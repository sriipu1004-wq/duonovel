## Child84 Search DB eligibility — exact-result preflight (2026-10-11)

This workstream does **not** switch Production Search to a new database paginator.

Read-only Production SQL `scripts/child84-search-eligible-sql-parity.sql` compares two database-side sets: (a) public series with a canonical source language and at least one `posted AND is_published` episode; (b) those same public series present with `episode_count > 0` in the current `security_invoker` episode summary view. It returns aggregate counts, per-source-language counts and symmetric-difference cardinalities only (no private IDs). It was executed against Production read-only on 2026-10-11 and returned:

- Reference eligible series **120**, summary-view eligible series **120**; missing from view **0**, unexpected view rows **0**.
- `ja=40`, `en=40`, `ko=40`, all other supported source languages currently **0**; all compared counts equal.
- This is not a proof that future data will stay consistent and is not an independent validator of fuzzy scores, saved-auth lists, narration eligibility, R18, popularity, date ranges or tag/genre counts. Those currently remain in application logic.

`scripts/test-child84-search-sql-candidate-contract.ts` uses **1,803 entirely synthetic works**, including private works, scheduled-only works, unresolved languages, a work beyond the default 1,000-row PostgREST page, typo/fuzzy queries, language selection, self-excluded tag/genre facets, saved-followed-authors, updated periods, ranking and page clamping. It checks that the proposed safe SQL *broad eligibility candidate* preserves the current app's full candidates through downstream JS matching. It deliberately demonstrates that pre-limiting candidate rows to 1,000 hides an exact-tail match, and that language facet counts must come from an unsliced all-language set.

**Explicit non-adoption:** do not replace in-memory Search with DB `LIMIT/OFFSET` based on eligibility parity alone. A later candidate requires full result-ID order, all self-excluding faceted counts, popularity and narration metrics, saved-filter privacy, source-language semantics, R18, tag/genre, all pagination pages and transient DB failure behavior to match existing production output. This report does not claim end-to-end equivalence or a latency improvement, and does not alter roadmap order. Child84 NOT DONE; Child85 BLOCKED.


## Child84e — Full Search semantic audit / SQL migration decision (2026-10-11)

**Decision: NO CUTOVER. Retain current cached full public candidates and JavaScript Search processing.** This is not the adoption of a DB-side paginator or full SQL/JS end-to-end equivalence.

### Verified state

- Git base: 3bba7a0abee7505e53b557fc766283aa95850571; PR #120 merged.
- Production: dpl_FKd595o4mjxaATna4eAZSzhV9qUP READY, SHA matches base.
- READ ONLY Production SQL 2026-10-11: 120 public works; 120 eligible summary-view rows; 244 daily-popularity rows referencing eligible works; total UTF-8 size of titles plus descriptions 3,762 bytes. The latter is NOT a full serialized card or network transfer measurement.
- Prior eligible-set audit: 120 direct vs 120 summary, 0 asymmetric differences; source JA/EN/KO 40 each; remaining supported languages 0. This validates admission for one snapshot, not complete Search.
- Public catalog uses 60-second cached base cards; popularity-daily uses 15-second cache. Search filters/ranks complete unsliced viewer-visible candidates. Previously measured Search GET median approximately 0.807 seconds (eight warm/uncontrolled samples on an earlier main), NOT a controlled SQL-vs-JS benchmark.
- A first read-only SQL aggregate mistakenly compared series.id (UUID) to series_popularity_daily.series_id (text), yielding PostgreSQL 42883. The corrected SELECT explicitly cast series.id to text and succeeded. An actual SQL join would require type-specific plan verification; no SQL migration or new index was made.

### Canonical semantics extracted from source

1. **Admission/security:** publication_status=public, at least one posted AND is_published episode in the public summary view, and parseable canonical source_language from the eight-tag registry. Unknown-language public rows are omitted. Public/private and episode RLS must remain authoritative. Search reads the viewer-gated catalog: R18 excluded unless the existing viewer preference permits it; preference failure stays fail-closed. UI locale, source language and target reading language are distinct.
2. **Language:** deduplicated registry-ordered source_language multi-select; any selected language is an OR match; empty means all. Never restore read_language.
3. **Search:** query trimmed/clamped at 120 code units; NFKC + en-US lowercase, apostrophe removal, Unicode punctuation/symbol normalization and compact no-space matching; CJK/Hangul substring matching and Latin-token bounded Levenshtein (distance 1/2). Score tiers: exact title 1000; compact title 990; exact original title 980; compact original 970; exact author 960; title prefix 930; original prefix 920; searchable substring 900; compact substring 880 (at least three chars); token match 800; fuzzy 620; miss 0. Blank query scores 1.
4. **Predicate:** all selected tag tokens AND and all selected genre tokens AND; at most three genres. Tokyo local-day boundaries are inclusive; reversed dates are swapped. **Date range excludes works only in updated order.** In popular order, it chooses daily popularity score buckets, not result admission.
5. **Viewer saved:** followed-authors and liked-authors use author IDs; liked-works and liked-readers use series IDs. Missing sign-in / failed saved data read produces no saved matches, not cross-user data. **Potential existing defect (ここが怪しい):** bookmarked-works is recognized by resolver, but SearchPageLegacy has no corresponding savedSeriesIds loading branch, making its list empty. Preserve existing behavior during this no-cutover audit; assess a correction as a separate reviewed change.
6. **Sort:** period popularity score = views/100 + likes + bookmarks/3. Popular results order by period score descending, period views descending, ALL-TIME likes descending, ALL-TIME bookmarks descending, latest posted timestamp descending. Updated results use latest posted timestamp descending, then created timestamp descending. Stable JS ties ultimately retain base catalog order (latest-posted descending, created descending, then initial series created_at descending/id ascending). For nonempty text query, stable score-only sort is applied AFTER the selected mode sort. An SQL order-by score alone would change ties.
7. **Narration:** narration-popular shelf requires positive narration activity (windowed for popular mode, all-time for updated mode), then sorts narration count, views, all-time likes/bookmarks and latest date. Its daily/weekly/monthly/quarterly/yearly/all-time shelves compute independent windows. Do not conflate Human narration with TTS.
8. **Facets:** tags count matching works with tag selection removed; genres count works with genre selection removed; work counted once per normalized label, sorted count descending then Japanese-locale label order. Language counts use the entire all-language corpus with other search/tag/genre/saved/date/narration constraints still applied. Separate genre shelf discovery uses a broader source set than conditional genre-facet counts.
9. **Pagination:** total computed only after all filtering + narration eligibility. 24/page; invalid/negative/nonfinite page maps to first page; finite fractional page floors; pages clamp to 1..max(1,ceil(total/24)). URL retains filters/order/dates/shelf; page=1 implicit. Catalog and popularity readers already page PostgREST by complete consecutive ranges of 1,000.
10. **Failure/invariants:** an unavailable public dataset must not be relabeled a genuine empty result. R18, owner-private, publication, AI/Human translation provenance/permissions, source-language and Reader modes remain unchanged.

### Alternatives compared

| Option | Equivalence | Performance / cost judgment | Decision |
|---|---|---|---|
| Full public catalog, 60s cache, JavaScript Search | Canonical behavior | Only 120 eligible works; shared cache, no extra dynamic facet round trips | RETAIN |
| DB public+posted+source admission, all rows then JS | Broad boundary 120/120 parity at current snapshot; downstream still requires full universe | Already partly realized via summary view; duplicate fetch or language-facet query likely adds overhead at this scale | NO CUTOVER |
| DB exact tag/genre/date/saved filtering before JS | Cannot supply self-excluded/all-language facets without additional full-universe queries; date depends on sort, viewer data depends on authenticated RLS | More queries/coupling; benefit unmeasured | NO-GO |
| Full SQL/RPC for fuzzy score, popularity, narration, facets and paging | No independent full semantic proof; Unicode normalization, CJK fuzzy, stable ties and error-mode semantics unproven | High build/test/security/maintenance burden for 120 works | NO-GO |
| SQL LIMIT 24/OFFSET on broad eligible rows | Known truncation of later exact/fuzzy matches and incorrect counts/facets | Incorrect even if faster | PROHIBITED |

### Scope of regression and remaining gate

The existing 1,803-synthetic-work eligibility and 1,257-synthetic-work condition tests demonstrate the 1,000-row truncation hazard and basic predicate equivalence. The Child84e expansion to the synthetic eligibility regression compares fully ordered IDs, total counts, all tag/genre/language facet counts, narrator activity, date/order windows, saved and R18 viewer variants, 24-item page slices and empty/last-page boundaries, while retaining a common downstream JavaScript implementation.

**Limitation:** two simulated admission predicates feeding the same JS pipeline are NOT independently written SQL-vs-JS end-to-end implementations. No SQL scorer/RPC is tested, and CI status must be recorded separately. No SQL performance improvement or Production p95 change is claimed.

Only reopen SQL cutover if corpus growth or sustained measured latency/DB transfer provides material benefit. Require independent SQL query and JS reference, exact ordering/facets/count/page parity on real + >1,000 synthetic works, authenticated/R18/failure tests, measured EXPLAIN and end-to-end Preview before any Draft implementation is considered.

**No Production writes, DB migration, new index, new SQL RPC, cache TTL change, UI/Reader modification, roadmap priority change, or merge is authorized by this audit.** Child84 remains in progress and Child85 BLOCKED. Next for parent: account-deletion policy, authenticated E2E, DB/Storage restore, and timer-diagnostic review.
