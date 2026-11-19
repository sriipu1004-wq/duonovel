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
  runFollowingUpdates,
  type FollowingUpdateEpisode,
  type FollowingUpdatesResult,
} from "@/lib/updates/followingUpdates";

export type { FollowingUpdatesResult };

type SessionClient = Awaited<ReturnType<typeof createClient>>;

function readText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toTimeValue(value: unknown): number {
  if (typeof value !== "string" || !value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function readEmbeddedPublicationStatus(value: unknown): string | null {
  const embedded = Array.isArray(value) ? value[0] : value;
  if (!embedded || typeof embedded !== "object") return null;
  return readText((embedded as Record<string, unknown>).publication_status) || null;
}

/**
 * Bookmarks, followed authors and reading markers of the signed-in viewer.
 * Read with the viewer's own session (RLS) and filtered by user id; each row
 * keeps its owner column so runFollowingUpdates can drop any other row.
 */
async function readViewerRows(supabase: SessionClient, userId: string) {
  const [bookmarks, follows, playLogs] = await Promise.all([
    supabase.from("user_series_bookmarks").select("user_id, series_id").eq("user_id", userId),
    supabase
      .from("author_follows")
      .select("follower_user_id, followed_author_id")
      .eq("follower_user_id", userId),
    supabase
      .from("play_logs")
      .select("user_id, series_id, episode_number")
      .eq("user_id", userId),
  ]);
  if (bookmarks.error) throw new Error(`bookmarks: ${bookmarks.error.message}`);
  if (follows.error) throw new Error(`author follows: ${follows.error.message}`);
  return {
    bookmarks: (bookmarks.data ?? []) as Array<Record<string, unknown>>,
    follows: (follows.data ?? []) as Array<Record<string, unknown>>,
    // Reading markers only hide already-read episodes; when they cannot be
    // read the list still works.
    playLogs: playLogs.error ? null : ((playLogs.data ?? []) as Array<Record<string, unknown>>),
  };
}

/**
 * Posted, published episode metadata (number, title, posted time; no body)
 * of one work that already passed every check in selectFollowedWorks.
 * Service role because D030 country-restricted works hide their episode rows
 * from the Data API for everyone; the country rule was applied to the work
 * before this read. The series' publication_status is joined and required
 * to be 'public' here, live (not from the catalog cache).
 */
async function loadEpisodesForSeries(args: {
  seriesId: string;
  sinceIso: string;
  nowIso: string;
  limit: number;
}): Promise<FollowingUpdateEpisode[]> {
  const admin = createAdminClient();
  const run = (select: string) =>
    admin
      .from("episodes")
      .select(select)
      .eq("series_id", args.seriesId)
      .eq("series.publication_status", "public")
      .eq("posting_status", "posted")
      .eq("is_published", true)
      .gte("posted_at", args.sinceIso)
      .lte("posted_at", args.nowIso)
      .order("posted_at", { ascending: false })
      .limit(args.limit);

  let result = await run(
    "series_id, episode_number, title, posted_at, series!inner(publication_status)"
  );
  if (result.error && isSchemaCompatibilityReadFailure(result.error)) {
    result = await run("series_id, episode_number, posted_at, series!inner(publication_status)");
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
      seriesPublicationStatus: readEmbeddedPublicationStatus(row.series),
    });
  }
  return episodes;
}

export async function loadFollowingUpdates(args: {
  supabase: SessionClient;
  userId: string;
  now?: Date;
}): Promise<FollowingUpdatesResult> {
  const requestHeaders = await headers();
  return runFollowingUpdates({
    userId: args.userId,
    nowValue: (args.now ?? new Date()).getTime(),
    readViewerRows: () => readViewerRows(args.supabase, args.userId),
    // Public works only, with the viewer's R18 preference already applied.
    loadWorks: () =>
      getCachedPublicBaseWorkCards({
        visibility: "viewer",
        ignoreContentLanguageFilter: true,
        ignorePublicSearchLanguageFilter: true,
        prioritizeForUiLocale: false,
      }),
    loadShowR18: async () => (await getCurrentR18ViewerPreference()).showR18Content,
    // Throws on a read failure: never treated as "no restrictions".
    loadRegionMap: () => loadRegionRestrictionMap(),
    country: countryFromHeaders(requestHeaders),
    loadEpisodesForSeries,
  });
}
