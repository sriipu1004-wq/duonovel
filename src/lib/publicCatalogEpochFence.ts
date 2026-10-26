// Pure, independently executable version fence. There is intentionally no
// process-local epoch cache: every request reads the transactional DB revision.
export async function readEpochGuardedCatalog<T>(
  getEpoch: () => Promise<number | null>,
  readCached: (epoch: number) => Promise<T>,
  readUncached: () => Promise<T>,
  attempts = 3
): Promise<T> {
  let before = await getEpoch();
  if (before === null) {
    // SQL has not been provisioned yet. NEVER use the old shared cache.
    return readUncached();
  }
  for (let i = 0; i < attempts; i += 1) {
    const result = await readCached(before);
    const after = await getEpoch();
    if (after === null) throw new Error("catalog_epoch_disappeared");
    if (before === after) return result;
    before = after;
  }
  // A frequently changing catalog can be retried by the request boundary, but
  // must not return an in-flight stale result.
  throw new Error("catalog_epoch_changed_during_read");
}
