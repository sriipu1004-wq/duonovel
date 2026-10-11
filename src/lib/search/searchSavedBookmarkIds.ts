/**
 * Reads the complete, owner-scoped bookmark ID set for the normal public Search.
 *
 * The caller must use the authenticated user's Supabase client, filter by that
 * user's ID, order by a unique key and request count: "exact". RLS is an
 * additional database-enforced ownership boundary.
 *
 * An absent count, failed page or incomplete page must not be interpreted as
 * a valid empty bookmark collection.
 */
export type BookmarkedSeriesIdPage = {
  data: readonly { series_id: string | null }[] | null;
  count: number | null;
  error: { message: string } | null;
};

export async function collectBookmarkedSeriesIds(
  fetchPage: (from: number, to: number) => Promise<BookmarkedSeriesIdPage>,
  pageSize = 500
): Promise<Set<string>> {
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 1000) {
    throw new RangeError("Bookmark page size must be between 1 and 1000");
  }

  const seriesIds = new Set<string>();
  let expectedTotal: number | null = null;

  for (let from = 0; ; from += pageSize) {
    const { data, count, error } = await fetchPage(from, from + pageSize - 1);
    if (error) throw new Error(`Bookmark lookup failed: ${error.message}`);
    if (!Array.isArray(data) || !Number.isSafeInteger(count) || count === null || count < 0) {
      throw new Error("Bookmark lookup returned an incomplete response");
    }
    if (expectedTotal === null) expectedTotal = count;
    if (count !== expectedTotal) {
      throw new Error("Bookmark collection changed during pagination");
    }

    const requiredRows = Math.min(pageSize, Math.max(0, expectedTotal - from));
    if (data.length !== requiredRows) {
      throw new Error("Bookmark lookup returned a truncated page");
    }

    for (const row of data) {
      if (typeof row.series_id !== "string" || !row.series_id.trim()) {
        throw new Error("Bookmark lookup returned an invalid series ID");
      }
      seriesIds.add(row.series_id.trim());
    }

    if (from + data.length >= expectedTotal) return seriesIds;
    if (from > Number.MAX_SAFE_INTEGER - pageSize) {
      throw new Error("Bookmark pagination exceeded a safe offset");
    }
  }
}
