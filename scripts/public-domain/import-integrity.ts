/**
 * Pure verification of the PostgREST INSERT ... RETURNING response.
 * This is not a replacement for a single-transaction RPC, nor permission
 * to import unreviewed content.
 */
export type DraftEpisodeReturnedRow = {
  id: unknown;
  series_id: unknown;
  episode_number: unknown;
  posting_status: unknown;
  is_published: unknown;
};

export function assertExactDraftEpisodeInsert(
  plannedNumbers: readonly number[],
  seriesId: string,
  returned: readonly DraftEpisodeReturnedRow[] | null
): void {
  if (!seriesId || plannedNumbers.length < 1 ||
      plannedNumbers.some(n => !Number.isSafeInteger(n) || n <= 0) ||
      new Set(plannedNumbers).size !== plannedNumbers.length) {
    throw new Error("DRAFT_INSERT_EXPECTATION_INVALID");
  }
  if (!Array.isArray(returned) || returned.length !== plannedNumbers.length) {
    throw new Error("DRAFT_EPISODE_COUNT_MISMATCH: insertion confirmation missing or incomplete");
  }
  const expected = new Set(plannedNumbers);
  const seenNumbers = new Set<number>();
  const seenIds = new Set<string>();
  for (const row of returned) {
    if (!row || typeof row.id !== "string" || !row.id ||
        seenIds.has(row.id) || row.series_id !== seriesId ||
        row.posting_status !== "draft" || row.is_published !== false ||
        typeof row.episode_number !== "number" ||
        !expected.has(row.episode_number) || seenNumbers.has(row.episode_number)) {
      throw new Error("DRAFT_EPISODE_RESPONSE_MISMATCH: ID, owner series, numbering or privacy");
    }
    seenIds.add(row.id);
    seenNumbers.add(row.episode_number);
  }
}

export function assertDraftRollbackConfirmed(
  deleted: readonly { id: unknown }[] | null,
  seriesId: string
): void {
  if (!Array.isArray(deleted) || deleted.length !== 1 || deleted[0]?.id !== seriesId) {
    throw new Error("DRAFT_ROLLBACK_UNVERIFIED: cannot confirm the inserted series was removed");
  }
}
