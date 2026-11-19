// P9 PR-P9-5: in-site "updates from works you follow" list (no mail / push /
// cron). Pure selection logic shared by the server loader, the client list and
// the tests. Every visibility rule is applied here a second time on top of the
// already-filtered public catalog (defense in depth):
//   - only works whose series is public (the catalog input) and, for R18,
//     only when the viewer opted in;
//   - never a work that is withheld in the viewer's country (D030), and never
//     a restricted work when the country is unknown (fail closed);
//   - only works the viewer bookmarked or whose author the viewer follows;
//     the caller reads those rows for the signed-in user only.

import {
  isSeriesBlockedInCountry,
  type RegionRestrictionMap,
} from "@/lib/rights/regionRestriction";

/** How far back a newly posted episode still counts as an update. */
export const FOLLOWING_UPDATES_WINDOW_DAYS = 30;
/** Works shown at most on the home page. */
export const FOLLOWING_UPDATES_LIMIT = 6;
/** Works whose episodes are looked up at most (bounds the episode query). */
export const FOLLOWING_UPDATES_MAX_CANDIDATES = 60;
/** New episodes kept per work (enough to re-filter by local history). */
export const FOLLOWING_UPDATES_MAX_EPISODES_PER_WORK = 20;
/** Works whose episodes are read in parallel per round (one query each). */
export const FOLLOWING_UPDATES_EPISODE_BATCH = 6;
/** Rounds at most: bounds the episode queries per page view. */
export const FOLLOWING_UPDATES_MAX_EPISODE_BATCHES = 4;

export type FollowingUpdateReason = "bookmark" | "author";

export type FollowingUpdateWork = {
  seriesId: string;
  title: string;
  authorId: string | null;
  authorName: string;
  contentRating: "general" | "r15" | "r18" | string;
  latestPostedAtValue: number;
};

export type FollowingUpdateEpisode = {
  seriesId: string;
  episodeNumber: number;
  title: string;
  postedAtValue: number;
  /** publication_status of the series, read together with the episode. */
  seriesPublicationStatus: string | null;
};

/** Last reading position the server knows about (play_logs). */
export type FollowingReadMarker = {
  seriesId: string;
  episodeNumber: number;
};

export type FollowingUpdateItem = {
  seriesId: string;
  title: string;
  authorName: string;
  reasons: FollowingUpdateReason[];
  /** Newest first, posted inside the window and not yet read. */
  newEpisodes: Array<{ episodeNumber: number; title: string; postedAtValue: number }>;
};

export type SelectFollowedWorksInput = {
  works: readonly FollowingUpdateWork[];
  bookmarkedSeriesIds: ReadonlySet<string>;
  followedAuthorIds: ReadonlySet<string>;
  viewerUserId: string;
  showR18: boolean;
  regionMap: RegionRestrictionMap;
  country: string | null;
  sinceValue: number;
  maxCandidates?: number;
};

export type SelectedFollowedWork = FollowingUpdateWork & {
  reasons: FollowingUpdateReason[];
};

export function followingUpdatesSince(nowValue: number): number {
  return nowValue - FOLLOWING_UPDATES_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}

/**
 * Works that may appear in the viewer's update list, newest update first.
 * Own works are skipped (an author does not need to be told about them).
 */
export function selectFollowedWorks(
  input: SelectFollowedWorksInput
): SelectedFollowedWork[] {
  const selected: SelectedFollowedWork[] = [];
  const seen = new Set<string>();
  for (const work of input.works) {
    if (!work.seriesId || seen.has(work.seriesId)) continue;
    const reasons: FollowingUpdateReason[] = [];
    if (input.bookmarkedSeriesIds.has(work.seriesId)) reasons.push("bookmark");
    if (work.authorId && input.followedAuthorIds.has(work.authorId)) {
      reasons.push("author");
    }
    if (reasons.length === 0) continue;
    if (work.authorId && work.authorId === input.viewerUserId) continue;
    if (work.contentRating === "r18" && !input.showR18) continue;
    if (isSeriesBlockedInCountry(input.regionMap, work.seriesId, input.country)) {
      continue;
    }
    if (!(work.latestPostedAtValue >= input.sinceValue)) continue;
    seen.add(work.seriesId);
    selected.push({ ...work, reasons });
  }
  selected.sort((a, b) => b.latestPostedAtValue - a.latestPostedAtValue);
  return selected.slice(0, input.maxCandidates ?? FOLLOWING_UPDATES_MAX_CANDIDATES);
}

export type BuildFollowingUpdatesInput = {
  works: readonly SelectedFollowedWork[];
  episodes: readonly FollowingUpdateEpisode[];
  readMarkers: readonly FollowingReadMarker[];
  sinceValue: number;
  nowValue: number;
  limit?: number;
};

/**
 * Groups new episodes by work. An episode is new when it was posted inside
 * [since, now] (scheduled future posts are excluded) and its number is after
 * the last episode the viewer is known to have read.
 */
export function buildFollowingUpdates(
  input: BuildFollowingUpdatesInput
): FollowingUpdateItem[] {
  const workById = new Map(input.works.map((work) => [work.seriesId, work]));
  const lastRead = new Map<string, number>();
  for (const marker of input.readMarkers) {
    if (!workById.has(marker.seriesId)) continue;
    const current = lastRead.get(marker.seriesId) ?? 0;
    if (marker.episodeNumber > current) lastRead.set(marker.seriesId, marker.episodeNumber);
  }

  const bySeries = new Map<string, FollowingUpdateItem>();
  const seenEpisode = new Set<string>();
  for (const episode of input.episodes) {
    const work = workById.get(episode.seriesId);
    if (!work) continue;
    // Re-checked live with the episode read: a work set back to private after
    // the catalog cache was built must not leak titles or episode numbers.
    if (episode.seriesPublicationStatus !== "public") continue;
    if (!(episode.episodeNumber > 0)) continue;
    if (!(episode.postedAtValue >= input.sinceValue)) continue;
    if (episode.postedAtValue > input.nowValue) continue;
    if (episode.episodeNumber <= (lastRead.get(episode.seriesId) ?? 0)) continue;
    const key = `${episode.seriesId}:${episode.episodeNumber}`;
    if (seenEpisode.has(key)) continue;
    seenEpisode.add(key);

    let item = bySeries.get(episode.seriesId);
    if (!item) {
      item = {
        seriesId: work.seriesId,
        title: work.title,
        authorName: work.authorName,
        reasons: [...work.reasons],
        newEpisodes: [],
      };
      bySeries.set(episode.seriesId, item);
    }
    item.newEpisodes.push({
      episodeNumber: episode.episodeNumber,
      title: episode.title,
      postedAtValue: episode.postedAtValue,
    });
  }

  const items = [...bySeries.values()];
  for (const item of items) {
    item.newEpisodes.sort(
      (a, b) => b.postedAtValue - a.postedAtValue || b.episodeNumber - a.episodeNumber
    );
    item.newEpisodes = item.newEpisodes.slice(0, FOLLOWING_UPDATES_MAX_EPISODES_PER_WORK);
  }
  items.sort(
    (a, b) => (b.newEpisodes[0]?.postedAtValue ?? 0) - (a.newEpisodes[0]?.postedAtValue ?? 0)
  );
  return items.slice(0, input.limit ?? FOLLOWING_UPDATES_LIMIT);
}

/**
 * Client-side refinement with the browser's own reading history
 * (localStorage, already kept by the reader): drops episodes the viewer has
 * read on this device. Returns null when nothing new remains.
 */
export function applyLocalReadEpisode(
  item: FollowingUpdateItem,
  readEpisodeNumber: number | null | undefined
): FollowingUpdateItem | null {
  const read =
    typeof readEpisodeNumber === "number" && Number.isFinite(readEpisodeNumber)
      ? readEpisodeNumber
      : 0;
  const newEpisodes = item.newEpisodes.filter((episode) => episode.episodeNumber > read);
  if (newEpisodes.length === 0) return null;
  return { ...item, newEpisodes };
}

/** The first unread new episode: where "read" should start. */
export function firstNewEpisodeNumber(item: FollowingUpdateItem): number | null {
  let first: number | null = null;
  for (const episode of item.newEpisodes) {
    if (first === null || episode.episodeNumber < first) first = episode.episodeNumber;
  }
  return first;
}

type Row = Record<string, unknown>;

function rowText(row: Row, column: string): string {
  const value = row[column];
  return typeof value === "string" ? value.trim() : "";
}

/** Dependencies of the loader; the server module wires Supabase into these. */
export type FollowingUpdatesDeps = {
  userId: string;
  nowValue: number;
  /** The viewer's own rows (session / RLS). Each row carries its owner id. */
  readViewerRows: () => Promise<{
    bookmarks: Row[];
    follows: Row[];
    /** null when play_logs cannot be read (the list still works). */
    playLogs: Row[] | null;
  }>;
  /** Public catalog with the viewer's R18 preference applied. */
  loadWorks: () => Promise<FollowingUpdateWork[]>;
  loadShowR18: () => Promise<boolean>;
  /** Must throw on failure; never resolve to "no restrictions". */
  loadRegionMap: () => Promise<RegionRestrictionMap>;
  country: string | null;
  /** Newest posted episodes of one work inside [since, now], at most `limit`. */
  loadEpisodesForSeries: (args: {
    seriesId: string;
    sinceIso: string;
    nowIso: string;
    limit: number;
  }) => Promise<FollowingUpdateEpisode[]>;
};

export type FollowingUpdatesResult = {
  items: FollowingUpdateItem[];
  /** The viewer bookmarked a work or follows an author. */
  hasFollowTargets: boolean;
};

/**
 * Loads the list. Rows that do not belong to the viewer are dropped even if
 * the source returned them. Episodes are read one work at a time (newest
 * FOLLOWING_UPDATES_MAX_EPISODES_PER_WORK each), so a work that posts many
 * episodes cannot push the others out of the list.
 */
export async function runFollowingUpdates(
  deps: FollowingUpdatesDeps
): Promise<FollowingUpdatesResult> {
  const sinceValue = followingUpdatesSince(deps.nowValue);
  const rows = await deps.readViewerRows();

  const bookmarkedSeriesIds = new Set<string>();
  for (const row of rows.bookmarks) {
    if (rowText(row, "user_id") !== deps.userId) continue;
    const seriesId = rowText(row, "series_id");
    if (seriesId) bookmarkedSeriesIds.add(seriesId);
  }
  const followedAuthorIds = new Set<string>();
  for (const row of rows.follows) {
    if (rowText(row, "follower_user_id") !== deps.userId) continue;
    const authorId = rowText(row, "followed_author_id");
    if (authorId) followedAuthorIds.add(authorId);
  }
  const readMarkers: FollowingReadMarker[] = [];
  for (const row of rows.playLogs ?? []) {
    if (rowText(row, "user_id") !== deps.userId) continue;
    const seriesId = rowText(row, "series_id");
    const episodeNumber = Number(row.episode_number);
    if (seriesId && Number.isFinite(episodeNumber) && episodeNumber > 0) {
      readMarkers.push({ seriesId, episodeNumber: Math.floor(episodeNumber) });
    }
  }

  const hasFollowTargets = bookmarkedSeriesIds.size > 0 || followedAuthorIds.size > 0;
  if (!hasFollowTargets) return { items: [], hasFollowTargets };

  const [works, showR18, regionMap] = await Promise.all([
    deps.loadWorks(),
    deps.loadShowR18(),
    deps.loadRegionMap(),
  ]);
  const selected = selectFollowedWorks({
    works,
    bookmarkedSeriesIds,
    followedAuthorIds,
    viewerUserId: deps.userId,
    showR18,
    regionMap,
    country: deps.country,
    sinceValue,
  });

  const sinceIso = new Date(sinceValue).toISOString();
  const nowIso = new Date(deps.nowValue).toISOString();
  const episodes: FollowingUpdateEpisode[] = [];
  let items: FollowingUpdateItem[] = [];
  for (
    let batch = 0;
    batch < FOLLOWING_UPDATES_MAX_EPISODE_BATCHES &&
    batch * FOLLOWING_UPDATES_EPISODE_BATCH < selected.length;
    batch += 1
  ) {
    const slice = selected.slice(
      batch * FOLLOWING_UPDATES_EPISODE_BATCH,
      (batch + 1) * FOLLOWING_UPDATES_EPISODE_BATCH
    );
    const results = await Promise.all(
      slice.map((work) =>
        deps.loadEpisodesForSeries({
          seriesId: work.seriesId,
          sinceIso,
          nowIso,
          limit: FOLLOWING_UPDATES_MAX_EPISODES_PER_WORK,
        })
      )
    );
    results.forEach((list, index) => {
      // Only rows of the work that was asked for.
      for (const episode of list) {
        if (episode.seriesId === slice[index].seriesId) episodes.push(episode);
      }
    });
    items = buildFollowingUpdates({
      works: selected,
      episodes,
      readMarkers,
      sinceValue,
      nowValue: deps.nowValue,
    });
    if (items.length >= FOLLOWING_UPDATES_LIMIT) break;
  }

  return { items, hasFollowTargets };
}
