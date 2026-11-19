import "server-only";

import { headers } from "next/headers";
import type { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCachedPublicBaseWorkCards } from "@/lib/publicWorks";
import { getCurrentR18ViewerPreference } from "@/lib/contentRatingServer";
import {
  countryFromHeaders,
  loadRegionRestrictionMap,
} from "@/lib/rights/regionRestriction.server";
import { isSchemaCompatibilityReadFailure } from "@/lib/reliability/readOnly";
import {
  buildFollowingUpdates,
  followingUpdatesSince,
  selectFollowedWorks,
  type FollowingReadMarker,
  type FollowingUpdateEpisode,
  type FollowingUpdateItem,
} from "@/lib/updates/followingUpdates";

type SessionClient = Awaited<ReturnType<typeof createClient>>;

const EPISODE_ROW_LIMIT = 400;

function readText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readIdSet(rows: unknown, column: string): Set<string> {
  const ids = new Set<string>();
  if (!Array.isArray(rows)) return ids;
  for (const row of rows) {
    const value = readText((row as Record<string, unknown> | null)?.[column]);
    if (value) ids.add(value);
  }
  return ids;
}

function toTimeValue(value: unknown): number {
  if (typeof value !== "string" || !value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * Bookmarks, followed authors and reading markers of the signed-in viewer.
 * Read with the viewer's own session (RLS), and also filtered by user id, so
 * another user's rows can never enter the list.
 */
async function loadViewerFollowState(supabase: SessionClient, userId: string) {
  const [bookmarks, follows, playLogs] = await Promise.all([
    supabase.from("user_series_bookmarks").select("series_id").eq("user_id", userId),
    supabase
      .from("author_follows")
      .select("followed_author_id")
      .eq("follower_user_id", userId),
    supabase
      .from("play_logs")
      .select("series_id, episode_number")
      .eq("user_id", userId),
  ]);
  if (bookmarks.error) throw new Error(`bookmarks: ${bookmarks.error.message}`);
  if (follows.error) throw new Error(`author follows: ${follows.error.message}`);

  // Reading markers only hide already-read episodes; when they cannot be read
  // the list still works (it may show an episode the viewer already read).
  const readMarkers: FollowingReadMarker[] = [];
  if (!playLogs.error && Array.isArray(playLogs.data)) {
    for (const row of playLogs.data as Array<Record<string, unknown>>) {
      const seriesId = readText(row.series_id);
      const episodeNumber = Number(row.episode_number);
      if (seriesId && Number.isFinite(episodeNumber) && episodeNumber > 0) {
        readMarkers.push({ seriesId, episodeNumber: Math.floor(episodeNumber) });
      }
    }
  }

  return {
    bookmarkedSeriesIds: readIdSet(bookmarks.data, "series_id"),
    followedAuthorIds: readIdSet(follows.data, "followed_author_id"),
    readMarkers,
  };
}

/**
 * Posted, published episode metadata (number, title, posted time; no body)
 * of works that already passed every visibility check in
 * selectFollowedWorks. Service role because D030 country-restricted works
 * hide their episode rows from the Data API for everyone; the country rule
 * was applied to the id list before this read.
 */
async function loadRecentEpisodes(
  seriesIds: string[],
  sinceIso: string,
  nowIso: string
): Promise<FollowingUpdateEpisode[]> {
  if (seriesIds.length === 0) return [];
  const admin = createAdminClient();
  const run = (select: string) =>
    admin
      .from("episodes")
      .select(select)
      .in("series_id", seriesIds)
      .eq("posting_status", "posted")
      .eq("is_published", true)
      .gte("posted_at", sinceIso)
      .lte("posted_at", nowIso)
      .order("posted_at", { ascending: false })
      .limit(EPISODE_ROW_LIMIT);

  let result = await run("series_id, episode_number, title, posted_at");
  if (result.error && isSchemaCompatibilityReadFailure(result.error)) {
    result = await run("series_id, episode_number, posted_at");
  }
  if (result.error) throw new Error(`episodes: ${result.error.message}`);

  const episodes: FollowingUpdateEpisode[] = [];
  for (const row of (result.data ?? []) as unknown as Array<Record<string, unknown>>) {
    const seriesId = readText(row.series_id);
    const episodeNumber = Number(row.episode_number);
    if (!seriesId || !Number.isFinite(episodeNumber)) continue;
    episodes.push({
      seriesId,
      episodeNumber: Math.floor(episodeNumber),
      title: readText(row.title),
      postedAtValue: toTimeValue(row.posted_at),
    });
  }
  return episodes;
}

export type FollowingUpdatesResult = {
  items: FollowingUpdateItem[];
  /** The viewer follows or bookmarked at least one work/author. */
  hasFollowTargets: boolean;
};

export async function loadFollowingUpdates(args: {
  supabase: SessionClient;
  userId: string;
  now?: Date;
}): Promise<FollowingUpdatesResult> {
  const nowValue = (args.now ?? new Date()).getTime();
  const sinceValue = followingUpdatesSince(nowValue);
  const state = await loadViewerFollowState(args.supabase, args.userId);
  const hasFollowTargets =
    state.bookmarkedSeriesIds.size > 0 || state.followedAuthorIds.size > 0;
  if (!hasFollowTargets) return { items: [], hasFollowTargets };

  const [works, preference, regionMap, requestHeaders] = await Promise.all([
    // Public works only, with the viewer's R18 preference already applied.
    getCachedPublicBaseWorkCards({
      visibility: "viewer",
      ignoreContentLanguageFilter: true,
      ignorePublicSearchLanguageFilter: true,
      prioritizeForUiLocale: false,
    }),
    getCurrentR18ViewerPreference(),
    // Throws on a read failure: never treated as "no restrictions".
    loadRegionRestrictionMap(),
    headers(),
  ]);

  const selected = selectFollowedWorks({
    works,
    bookmarkedSeriesIds: state.bookmarkedSeriesIds,
    followedAuthorIds: state.followedAuthorIds,
    viewerUserId: args.userId,
    showR18: preference.showR18Content,
    regionMap,
    country: countryFromHeaders(requestHeaders),
    sinceValue,
  });
  if (selected.length === 0) return { items: [], hasFollowTargets };

  const episodes = await loadRecentEpisodes(
    selected.map((work) => work.seriesId),
    new Date(sinceValue).toISOString(),
    new Date(nowValue).toISOString()
  );

  return {
    items: buildFollowingUpdates({
      works: selected,
      episodes,
      readMarkers: state.readMarkers,
      sinceValue,
      nowValue,
    }),
    hasFollowTargets,
  };
}
