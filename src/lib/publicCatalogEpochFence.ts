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

// A final DB preference lookup can detect a revocation committed before it.
// It cannot undo bytes already streamed or close the DB-read-to-response race.
export async function retainOnlyFreshlyAuthorizedR18Cards<T extends { contentRating: string }>(
  cards: readonly T[],
  verifiedUserId: string | null,
  checkFreshPermission: (userId: string) => Promise<boolean>
): Promise<T[]> {
  const unrestricted = cards.filter((card) => card.contentRating !== "r18");
  if (unrestricted.length === cards.length) return [...cards];
  if (!verifiedUserId) return unrestricted;
  try {
    if (await checkFreshPermission(verifiedUserId)) return [...cards];
  } catch {
    // A failed fresh preference read always denies R18 metadata.
  }
  return unrestricted;
}
