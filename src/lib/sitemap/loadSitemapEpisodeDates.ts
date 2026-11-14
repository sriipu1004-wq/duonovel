import { createPublicServerClient } from "@/lib/supabase/serverPublic";
import { episodeLastModifiedValue } from "@/lib/seo/publicWorkSeo";
import { runReadOnlyWithRetry } from "@/lib/reliability/readOnly";

/** seriesId -> episodeNumber -> last modified epoch ms. */
export type SitemapEpisodeDates = Map<string, Map<number, number>>;

type EpisodeDateRow = {
  series_id: string | null;
  episode_number: number | null;
  posted_at: string | null;
  last_edited_at: string | null;
};

const PAGE_SIZE = 1000;

/**
 * Real per-episode modification dates for sitemap <lastmod>: the later of
 * posted_at and last_edited_at (series has no updated_at column).
 *
 * Uses the anonymous public client, so RLS (episodes_public_or_owner_select)
 * returns only posted, published episodes of public series. The filters
 * below repeat that condition; the sitemap additionally intersects with the
 * public non-R18 work list, so private/R18 rows can never add a URL.
 * Body text is never selected.
 */
export async function loadSitemapEpisodeDates(
  signal?: AbortSignal
): Promise<SitemapEpisodeDates> {
  const supabase = createPublicServerClient();
  const dates: SitemapEpisodeDates = new Map();

  for (let start = 0; ; start += PAGE_SIZE) {
    let query = supabase
      .from("episodes")
      .select("series_id, episode_number, posted_at, last_edited_at")
      .eq("posting_status", "posted")
      .eq("is_published", true)
      .gt("episode_number", 0)
      .order("series_id", { ascending: true })
      .order("episode_number", { ascending: true })
      .order("id", { ascending: true })
      .range(start, start + PAGE_SIZE - 1);
    if (signal) query = query.abortSignal(signal);
    const { data, error } = await query;
    if (error) {
      throw new Error(`sitemap episode dates failed: ${error.message}`);
    }
    const rows = (data ?? []) as EpisodeDateRow[];
    for (const row of rows) {
      if (!row.series_id || !row.episode_number) continue;
      const value = episodeLastModifiedValue(row);
      if (value <= 0) continue;
      let perSeries = dates.get(row.series_id);
      if (!perSeries) {
        perSeries = new Map();
        dates.set(row.series_id, perSeries);
      }
      perSeries.set(row.episode_number, Math.max(perSeries.get(row.episode_number) ?? 0, value));
    }
    if (rows.length < PAGE_SIZE) break;
  }

  return dates;
}

/**
 * Per-episode modification dates. A failure here only degrades <lastmod> to
 * the work-level posted date; it never removes URLs or throws.
 */
export async function loadSitemapEpisodeDatesSafe(
  loadDates: (signal?: AbortSignal) => Promise<SitemapEpisodeDates> = loadSitemapEpisodeDates
): Promise<SitemapEpisodeDates> {
  try {
    return await runReadOnlyWithRetry((signal) => loadDates(signal), {
      operation: "sitemap episode dates",
      timeoutMs: 2500,
      retries: 0,
    });
  } catch (error) {
    console.warn(
      "[sitemap] episode lastmod unavailable",
      error instanceof Error ? error.message : String(error)
    );
    return new Map();
  }
}
