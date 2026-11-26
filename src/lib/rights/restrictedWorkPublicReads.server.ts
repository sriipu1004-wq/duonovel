import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { loadRegionRestrictionMap } from "@/lib/rights/regionRestriction.server";
import {
  isEpisodePostedAndPublished,
  isRecordingPubliclyVisible,
  isSeriesPublic,
} from "@/lib/rights/rlsVisibility";

// Public catalog reads for per-country restricted works (Issue #216, KD-4).
//
// Public catalog data (cards, search, ranking) is read with the anon client
// (#137). D030's RESTRICTIVE policies make a restricted work's episodes and
// recordings invisible to anon, although the work stays public and its card
// is shown everywhere (D030 "Limits"). These helpers read ONLY the restricted
// works through the service role, with the anon select RLS written out in the
// query and re-checked in code (src/lib/rights/rlsVisibility.ts):
//   series: publication_status = 'public'
//   episodes: posting_status = 'posted' and is_published = true
//   recordings: is_public = true, on such an episode of such a series.
// Only aggregate inputs leave this module (ids, counts); no body text.
//
// A failure to read the restriction list leaves the restricted works out
// (the previous behaviour) instead of failing the whole catalog read.

type AdminSupabase = ReturnType<typeof createAdminClient>;
type RawRow = Record<string, unknown>;

const ID_CHUNK = 100;
const PAGE_SIZE = 1000;

function chunk<T>(values: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size));
  return out;
}

function lower(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/**
 * Restricted series ids (lowercase), limited to `wanted` when given. Returns
 * [] when the restriction list cannot be read (logged, not thrown).
 */
export async function listRestrictedSeriesIds(wanted?: Iterable<string> | null): Promise<string[]> {
  let restricted: string[];
  try {
    restricted = Array.from((await loadRegionRestrictionMap()).keys()).map(lower);
  } catch (error) {
    console.warn("[restricted-work-public-reads] restriction list unavailable", {
      message: error instanceof Error ? error.name : "unknown",
    });
    return [];
  }
  if (!wanted) return restricted.sort();
  const wantedSet = new Set(Array.from(wanted, lower));
  return restricted.filter((id) => wantedSet.has(id)).sort();
}

async function fetchPublicSeriesIds(admin: AdminSupabase, seriesIds: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  for (const ids of chunk(seriesIds, ID_CHUNK)) {
    const { data, error } = await admin
      .from("series")
      .select("id, publication_status")
      .in("id", ids)
      .eq("publication_status", "public");
    if (error) throw new Error(`restricted series の取得に失敗: ${error.message}`);
    for (const row of (data ?? []) as RawRow[]) {
      if (isSeriesPublic(row)) out.add(lower(row.id));
    }
  }
  return out;
}

/**
 * Posted, published episodes of the public restricted works among `seriesIds`
 * (anon RLS episodes_public_or_owner_select, non-author branch).
 */
export async function fetchRestrictedPublicEpisodes(
  seriesIds: string[],
  selectClause: string
): Promise<RawRow[]> {
  const restricted = await listRestrictedSeriesIds(seriesIds);
  if (restricted.length === 0) return [];
  const admin = createAdminClient();
  const publicSeries = await fetchPublicSeriesIds(admin, restricted);
  if (publicSeries.size === 0) return [];

  const rows: RawRow[] = [];
  for (const ids of chunk(Array.from(publicSeries).sort(), ID_CHUNK)) {
    for (let start = 0; ; start += PAGE_SIZE) {
      const { data, error } = await admin
        .from("episodes")
        .select(selectClause)
        .in("series_id", ids)
        .eq("posting_status", "posted")
        .eq("is_published", true)
        .order("series_id", { ascending: true })
        .order("episode_number", { ascending: true })
        .order("id", { ascending: true })
        .range(start, start + PAGE_SIZE - 1);
      if (error) throw new Error(`restricted episodes の取得に失敗: ${error.message}`);
      const page = (data ?? []) as unknown as RawRow[];
      for (const row of page) {
        // Status columns are checked again when the caller selected them.
        if (("posting_status" in row || "is_published" in row) && !isEpisodePostedAndPublished(row)) {
          continue;
        }
        if (!publicSeries.has(lower(row.series_id))) continue;
        rows.push(row);
      }
      if (page.length < PAGE_SIZE) break;
    }
  }
  return rows;
}

/**
 * Public recordings of the public restricted works among `seriesIds` (all
 * restricted works when null), as anon RLS recordings_select_public_visible
 * would return them: is_public, on a posted, published episode that belongs
 * to the recording's public series. `humanOnly` only narrows the query.
 */
export async function fetchRestrictedPublicRecordings(
  seriesIds: string[] | null,
  selectClause: string,
  options: { humanOnly?: boolean } = {}
): Promise<RawRow[]> {
  const restricted = await listRestrictedSeriesIds(seriesIds);
  if (restricted.length === 0) return [];
  const admin = createAdminClient();
  const publicSeries = await fetchPublicSeriesIds(admin, restricted);
  if (publicSeries.size === 0) return [];
  const seriesList = Array.from(publicSeries).sort();

  const recordings: RawRow[] = [];
  for (const ids of chunk(seriesList, ID_CHUNK)) {
    for (let start = 0; ; start += PAGE_SIZE) {
      let query = admin
        .from("recordings")
        .select(selectClause)
        .in("series_id", ids)
        .eq("is_public", true);
      if (options.humanOnly) query = query.is("voice_model_id", null);
      const { data, error } = await query
        .order("id", { ascending: true })
        .range(start, start + PAGE_SIZE - 1);
      if (error) throw new Error(`restricted recordings の取得に失敗: ${error.message}`);
      const page = (data ?? []) as unknown as RawRow[];
      recordings.push(...page);
      if (page.length < PAGE_SIZE) break;
    }
  }
  if (recordings.length === 0) return [];

  const episodeIds = Array.from(
    new Set(recordings.map((row) => lower(row.episode_id)).filter((id) => id.length > 0))
  ).sort();
  const episodes = new Map<string, RawRow>();
  for (const ids of chunk(episodeIds, ID_CHUNK)) {
    const { data, error } = await admin
      .from("episodes")
      .select("id, series_id, posting_status, is_published")
      .in("id", ids)
      .eq("posting_status", "posted")
      .eq("is_published", true);
    if (error) throw new Error(`restricted recording episodes の取得に失敗: ${error.message}`);
    for (const row of (data ?? []) as RawRow[]) episodes.set(lower(row.id), row);
  }

  return recordings.filter((recording) => {
    const seriesId = lower(recording.series_id);
    if (!publicSeries.has(seriesId)) return false;
    const episode = episodes.get(lower(recording.episode_id));
    return isRecordingPubliclyVisible(recording, episode, {
      id: seriesId,
      publication_status: "public",
    });
  });
}
