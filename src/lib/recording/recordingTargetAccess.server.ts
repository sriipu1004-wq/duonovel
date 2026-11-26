import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  canViewerSeeEpisode,
  canViewerSeeSeries,
  isSeriesAuthor,
  isSeriesPublic,
} from "@/lib/rights/rlsVisibility";

// Recording targets (series + episode) read through the service role
// (Issue #216, KD-4). A per-country restricted work (D030) hides its episode
// rows from every non-author session through RESTRICTIVE RLS, so a reader in
// an allowed country could not record it. These reads replace the session
// read and re-apply the same select RLS in the query and in code
// (src/lib/rights/rlsVisibility.ts). The visitor's country is NOT checked
// here: every caller runs regionBlockedApiResponse (API) or
// assertSeriesAvailableInRequestRegion (page) for the same series first.

type AdminSupabase = ReturnType<typeof createAdminClient>;
type RawRow = Record<string, unknown>;

export type RecordingTargetResult =
  | { ok: true; series: RawRow; episode: RawRow; isAuthor: boolean }
  | { ok: false; reason: "series_not_found" | "episode_not_accessible" | "read_failed" };

async function readSeriesVisibleToViewer(
  admin: AdminSupabase,
  seriesId: string,
  viewerId: string
): Promise<{ row: RawRow | null; failed: boolean }> {
  const { data, error } = await admin
    .from("series")
    .select("*")
    .eq("id", seriesId)
    .maybeSingle();
  if (error) return { row: null, failed: true };
  const row = (data ?? null) as RawRow | null;
  if (!row || !canViewerSeeSeries(row, viewerId)) return { row: null, failed: false };
  return { row, failed: false };
}

/**
 * One episode of one series, as the viewer's session would see it without the
 * per-country policy: the author sees every episode of their work; anyone
 * else only a posted, published episode of a public work.
 */
export async function loadRecordingTargetForViewer(
  admin: AdminSupabase,
  input: { seriesId: string; episodeId: string; viewerId: string }
): Promise<RecordingTargetResult> {
  const { seriesId, episodeId, viewerId } = input;
  if (!seriesId || !episodeId || !viewerId) {
    return { ok: false, reason: "episode_not_accessible" };
  }

  const series = await readSeriesVisibleToViewer(admin, seriesId, viewerId);
  if (series.failed) return { ok: false, reason: "read_failed" };
  if (!series.row) return { ok: false, reason: "series_not_found" };

  const isAuthor = isSeriesAuthor(series.row, viewerId);
  let query = admin
    .from("episodes")
    .select("*")
    .eq("id", episodeId)
    .eq("series_id", seriesId);
  if (!isAuthor) {
    query = query.eq("posting_status", "posted").eq("is_published", true);
  }
  const { data, error } = await query.maybeSingle();
  if (error) return { ok: false, reason: "read_failed" };
  const episode = (data ?? null) as RawRow | null;
  if (!episode || !canViewerSeeEpisode(series.row, episode, viewerId)) {
    return { ok: false, reason: "episode_not_accessible" };
  }
  return { ok: true, series: series.row, episode, isAuthor };
}

/**
 * Every episode of one series the viewer's session would see without the
 * per-country policy (author: all; others: posted and published of a public
 * work; a private work of someone else: none).
 */
export async function loadRecordingEpisodesForViewer(
  admin: AdminSupabase,
  input: { seriesId: string; viewerId: string }
): Promise<{ episodes: RawRow[]; error: string | null }> {
  const { seriesId, viewerId } = input;
  if (!seriesId || !viewerId) return { episodes: [], error: null };

  const series = await readSeriesVisibleToViewer(admin, seriesId, viewerId);
  if (series.failed) return { episodes: [], error: "series_read_failed" };
  if (!series.row) return { episodes: [], error: null };

  const isAuthor = isSeriesAuthor(series.row, viewerId);
  if (!isAuthor && !isSeriesPublic(series.row)) return { episodes: [], error: null };

  let query = admin.from("episodes").select("*").eq("series_id", seriesId);
  if (!isAuthor) {
    query = query.eq("posting_status", "posted").eq("is_published", true);
  }
  const { data, error } = await query;
  if (error) return { episodes: [], error: error.message };

  const episodes = ((data ?? []) as RawRow[]).filter((episode) =>
    canViewerSeeEpisode(series.row, episode, viewerId)
  );
  return { episodes, error: null };
}
