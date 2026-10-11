## Child84 Search DB eligibility — exact-result preflight (2026-10-11)

This workstream does **not** switch Production Search to a new database paginator.

Read-only Production SQL `scripts/child84-search-eligible-sql-parity.sql` compares two database-side sets: (a) public series with a canonical source language and at least one `posted AND is_published` episode; (b) those same public series present with `episode_count > 0` in the current `security_invoker` episode summary view. It returns aggregate counts, per-source-language counts and symmetric-difference cardinalities only (no private IDs). It was executed against Production read-only on 2026-10-11 and returned:

- Reference eligible series **120**, summary-view eligible series **120**; missing from view **0**, unexpected view rows **0**.
- `ja=40`, `en=40`, `ko=40`, all other supported source languages currently **0**; all compared counts equal.
- This is not a proof that future data will stay consistent and is not an independent validator of fuzzy scores, saved-auth lists, narration eligibility, R18, popularity, date ranges or tag/genre counts. Those currently remain in application logic.

`scripts/test-child84-search-sql-candidate-contract.ts` uses **1,803 entirely synthetic works**, including private works, scheduled-only works, unresolved languages, a work beyond the default 1,000-row PostgREST page, typo/fuzzy queries, language selection, self-excluded tag/genre facets, saved-followed-authors, updated periods, ranking and page clamping. It checks that the proposed safe SQL *broad eligibility candidate* preserves the current app's full candidates through downstream JS matching. It deliberately demonstrates that pre-limiting candidate rows to 1,000 hides an exact-tail match, and that language facet counts must come from an unsliced all-language set.

**Explicit non-adoption:** do not replace in-memory Search with DB `LIMIT/OFFSET` based on eligibility parity alone. A later candidate requires full result-ID order, all self-excluding faceted counts, popularity and narration metrics, saved-filter privacy, source-language semantics, R18, tag/genre, all pagination pages and transient DB failure behavior to match existing production output. This report does not claim end-to-end equivalence or a latency improvement, and does not alter roadmap order. Child84 NOT DONE; Child85 BLOCKED.
