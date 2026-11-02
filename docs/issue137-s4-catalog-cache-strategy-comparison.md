# Issue #137 F1 — public catalog cache safety versus latency: isolated option study

Date: 2026-11-02. **Scope approved:** compare strategies, negative fixtures, bounded performance modeling. **No source/runtime deployment, real Production/DB edits, permissions, migrations, cache configuration, Rights publication, merge or paid tools**. The current PR #153 remains Draft/MERGE HOLD; PR #150 remains PERFORMANCE_GATE_FAIL.

## Current code / prior evidence (not a production change)

- Main/Production serves a 60-second shared `unstable_cache` catalog (v12). Public revalidation `AbortError` logs continue. Raw Vercel error events are **not** the count of HTTP 5xx requests; missing status/latency denominator.
- Draft PR #150 (head `8da5090f8cf16e2b3d8bc8dc913d0e83a7bf31fc`) replaces shared catalog with **request-scope** `React.cache`, fetching current PUBLIC series, author display names, published-episode summaries per request. Earlier only **two** anonymous GETs per route found Home, Search, Ranking and language-count Preview materially slower than main, so it is *PERFORMANCE_GATE_FAIL*, not a measured statistical p95.
- Draft PR #153 already contains a stronger **transactional DB epoch** candidate in `src/lib/publicCatalogEpochFence.ts` and `src/lib/publicWorks.ts`: version-keyed shared cache; read current revision before+after viewer/header/locale processing and retry on mismatch; direct fresh read if revision RPC is absent; fail closed on RPC error or unstable epoch. Authenticated R18 enrichment and its final fresh preference check stay separate from general shared cache. This is **source/isolated candidate only** until its SQL is separately approved and actually deployed.
- The proposed epoch SQL `supabase/migrations/20261026120000_issue137_b2_r18_boundary.sql` increments a DB singleton revision on INSERT/UPDATE/DELETE of `series` or `episodes`, and update of `users.display_name`; only server service_role gets read-only RPC `public.libread_public_catalog_revision()`. SQL execution on hosted Production **not authorized**. The completeness of every current and future metadata source mutation, view, rights/edition attachment or cache key and migration/rollback remains to be proven on a fixed integrated release candidate.
- A source-generated PUBLIC card currently includes title, description, originalTitle, author display, tags/genres, effective R18 classification from *rating AND warning*, canonical source language, translation permission, effect_settings/Public Domain metadata, and PUBLIC episode summary/count/first episode/numbers. This set of payload fields makes **ID/public/R18-only validation insufficient** whenever stale cache bytes could contain old metadata.

## Threat / strategy comparison

| Strategy | Protection against late stale refresh | Query/computation cost | Release evaluation |
| --- | --- | --- | --- |
| A. Keep current v12 shared 60s cache + revalidateTag/updateTag | Historical isolated Next 16 repro showed in-flight old public refresh could reinsert withdrawn title after invalidation. | Fast warm hits, no fresh authority dependency | **NO-GO** for PUBLIC→PRIVATE/R18 metadata safety without extra guard |
| B. Fresh full rebuild on each request (#150) | Uses current public source and summaries; remains vulnerable to commit **after** last checked read unless explicitly fenced. | Many series/episode/author reads on *every* request; prior 2-sample Preview materially slower | **PERFORMANCE FAIL; HOLD** |
| C. Shared display cache + latest public/R18/ID projection | Stops some removals but does **not** detect changed title/summary/author, episode membership, language, translation permission or edition/rights metadata. | Cheapest limited comparison in a synthetic model | **NO-GO as formulated; unsafe content freshness** |
| D. Strict fresh metadata projection + cached card | To safely reuse bytes, it must compare **all** display/security dependencies and fail closed on mismatch, including current published episode summary and author profile. Direct fresh rendering after mismatch is equivalent to a substantial part of full rebuild; race after final check remains. | Similar per-request authoritative read volume to (B), no proven savings | **Not recommended without measured optimization** |
| E. DB transactional revision fence + epoch-keyed shared cache (#153) | Under complete atomic revision triggers, late old cache writes remain unreachable to future requests; a change during request must trigger retry or error. Does not close final check→HTTP emission TOCTOU or shared backend key/code defects. | Warm: 2 small revision reads, no full-card rows; cold: epoch+series+summary/author+final epoch. Missing revision RPC falls back to full fresh reads. | **Best candidate for further isolated work, NOT release-approved** |
| F. Cached public series + per-card version epochs with a separate auth projection | Could narrow invalidations but requires provider-enforced per-series revisions, edition/author/episode fanout, transactional bindings and a new maintenance/query plan. | Unknown without DB schema, indexes, query plan | **Research only**, not justified versus E yet |

## Exact SOURCE+MODEL negative cases

Test `scripts/issue137-b2/f1-catalog-strategies-offline.test.mjs` imports the **actual application** `readEpochGuardedCatalog`, `retainOnlyFreshlyAuthorizedR18Cards`, `getSeriesContentRating`, `getSeriesPublicationStatus` and `isEpisodePubliclyVisible`. Fake cards and isolated mutable revision replace any real user works.

It checks that:
- status/rating-only projection may deny PUBLIC→PRIVATE or general→R18 but continues to expose old presentation for **eight** categories: title, summary, author display, source language, translation permission, rights/edition, public episode number and tags; episode withdrawn/draft/reparent paths remain unsafe if projection covers series only.
- strict full-field comparison rejects all **14** mutations instead of emitting stale cached attributes.
- original epoch cache remains physically present but is not addressable after a committed bump; in-flight withdrawal after viewer/header work results in fresh retry; R18 warning-only escalation is blocked even if numeric rating remains general.
- revision loss/missing RPC, repeated changes, stale R18 viewer preference and failure of fresh R18 lookup fail closed; a mutation **after the final epoch check** is an unresolved last-microsecond race.
- this model is **not** a proof that current hosted DB triggers are complete, nor that legacy HTML/RSC/routes, all translations, Public Domain edition rights or browser CDN caches are safe.

## Bounded performance experiment (not actual Product p95)

Test workload deliberately fixes **120 synthetic eligible series**, a **single aggregate episode-summary row per series**, and **120 author names** (the dated project snapshot had ~120 public works and ~3,284 posted episodes, but that is NOT the current authoritative count; the SQL summary view can preaggregate episodes). No real Supabase query/hosted credentials or browser traffic is used.

Each simulated DB call waits ~2 ms via local in-memory timer and respects dependency waves (fresh series first, then **parallel** author and summary calls; epoch before and after). There are 16 repeated local timing samples per strategy. Printed `mockP50Ms`/`mockP95Ms` measure the Node test environment and timers, not Vercel, DB, Network, HTTP body time, SQL query plan or load-test p95. Do not compare these numeric outputs with the two Preview timing samples as if they were equal evidence.

| Strategy | Calls per modeled request | Sequential latency waves | Source rows retrieved (synthetic) |
| --- | ---: | ---: | ---: |
| Full fresh rebuild | 3 | 2 | 360 |
| ID/rating-only projection (unsafe) | 1 | 1 | 120 |
| Strict projection | 3 | 2 | 360 |
| Versioned epoch warm cache | 2 | 2 | 0 card rows; 2 scalar revisions |
| Versioned epoch cold / changed cache | 5 | 4 | 360 + 2 scalar revisions |
| Missing epoch RPC → direct fallback | 4 | 3 | 360 + failed revision lookup |

This is a **query-shape and synthetic latency envelope**, not an empirical statement that version E is faster or safer than main in Production. Real warm-cache hit rate, RPC/DB regional latency, invalidation rate, shared Fluid compute, R18 user-specific reads, PostgREST timeout, cache topology and request-level 5xx/p95 must be measured before any rollout.

## F1 SQL/source coverage follow-up (2026-11-02; READ-ONLY, no new PG run)

**Operation boundary:** A proposed new isolated PostgreSQL fixture creation was refused by the safety check on the GitHub write action. **That action was not retried through another path or tool.** This section is independent READ-ONLY code audit and PostgreSQL 17 reference comparison, not a substitute claim of real DB E2E.

### Independently checked existing evidence

- The existing real **disposable** GoTrue/PostgREST/PostgreSQL E2E in `scripts/issue137-b2/e2e.mjs` verifies the revision RPC using the service role, anon denial, **+1** after a series UPDATE, episode UPDATE and `users.display_name` UPDATE, and **unchanged revision after a rejected R18 mutation**. Prior B2 run `41422942017`, job `125202885043` completed SUCCESS and its raw log reported 63 B2 real LOCAL auth/RLS/Storage assertions. It did **not** demonstrate every arbitrary rollback/savepoint, concurrent writer ordering, profile INSERT/DELETE or schema parity with hosted Production.
- The F1 `fence.test.ts` race proof and 80-case strategy test are SOURCE+MODEL, **not** concurrent Postgres tests. Do not treat shared-memory revision increments as SQL transaction results.

### Display dependency → database trigger inventory (source)

| Catalog field / dependency | Source of truth | Triggered in draft F1 SQL? | Confidence and gap |
| --- | --- | --- | --- |
| Work title, summary, status, genres, tags, effective content rating+warnings, canonical source language, translation permission | `public.series` | Statement-level INSERT/UPDATE/DELETE | **SOURCE yes**; covers row mutations, not independently proven against all runtime publication/rights paths |
| Public episode counts/numbers/posted dates and membership | `public.episodes` via public episode summary view | Statement-level INSERT/UPDATE/DELETE | **SOURCE yes**, view definition/source schema and any external maintenance not fully verified |
| Public Domain original title, original author, provider, source URL, rightsChecked and edition metadata | `public.series.effect_settings.publicDomain` | Series INSERT/UPDATE/DELETE | **SOURCE yes** for updates stored in this series JSON; no proof all copyright/edition status always comes from this column |
| Visible author display name | `public.users.display_name` after author lookup | Only **AFTER UPDATE OF display_name** | **COVERAGE GAP:** `public.users` INSERT or DELETE is not covered. A created/deleted profile may change fallback/actual author display while series and episodes remain unchanged. Actual production ability and impact require separate trace |
| Viewer-specific R18 preference/age confirmation | `public.users.show_r18_content`, `r18_confirmed_at` | Not included in shared catalog revision | **Intentional separate entitlement** checked by viewer-specific fresh read and R18 recheck; MUST NOT put viewer-specific restricted metadata in anonymous shared cache |
| Third-party cached output beyond these tables (e.g. new rights, translations, author aliases or materialized metadata) | Future/unknown | Not established | **UNVERIFIED**; source dependency inventory must expand before declaring completeness |

### Additional confirmed trigger semantics and unresolved performance risks

1. PostgreSQL 17 documentation states a **FOR EACH STATEMENT trigger fires even when a statement affects zero rows**. Draft F1 triggers on any series/episode INSERT/UPDATE/DELETE therefore bump the singleton revision even on valid no-op/zero-match updates; an `UPDATE OF display_name` trigger also fires when that column is named in an UPDATE statement, without requiring changed display contents. This can cause unnecessary cache misses, but the actual frequency and impact are **unmeasured**.
2. All three statement-level bump triggers execute `UPDATE libread_internal.public_catalog_revision SET epoch=epoch+1 WHERE singleton=true`. An update to the same singleton row by concurrent transactions requires competing writer locks. This **may serialize otherwise independent series/episode/author commits** and can contribute to lock wait/deadlock risk depending on transaction ordering. No concurrent real-PG timing, deadlock or p95 result was obtained; do not claim it actually caused Production `AbortError`.
3. SQL triggers are transaction-scoped, so a failing triggering transaction rolls back its epoch update (PostgreSQL 17 reference and the existing narrower rejected-transition E2E). That is **not** proof of correct commit visibility under all parallel interleavings, savepoints, or a cache read immediately before an update commits.
4. These triggers do not handle `TRUNCATE`; whether TRUNCATE can occur in approved operations is **not established** and would require strict privileged administrative controls. No justification for broadening trigger scope or any Production schema change is included here.
5. Real application use of `public.users` profile INSERT/DELETE and their independent FK lifecycle needs confirmation before labeling the coverage gap a real Production leak. No Production data was inspected for this research.

**Primary PostgreSQL 17 references:** [Trigger behavior](https://www.postgresql.org/docs/17/trigger-definition.html) (per-statement triggers even with zero affected rows, transaction rollback semantics), [Explicit locking](https://www.postgresql.org/docs/17/explicit-locking.html) (same-row writer lock conflicts, deadlocks). No vendor documentation converts this SOURCE audit into measured performance.

**Decision:** With current author-profile INSERT/DELETE omission and unmeasured singleton-row contention, F1 versioned caching **still cannot be declared complete or Production ready**. Existing narrower local PG positive tests stand; a real independent, explicitly allowed PG concurrency/coverage test and fixed-HEAD security/performance audit remain unmet. The refused fixture action stays refused. Keep PR #153 Draft/MERGE HOLD and #150 PERFORMANCE_GATE_FAIL.

## Decision / stopping conditions

**Prefer E for further nonproduction investigation**, because it addresses the unsafe stale refresh without unconditional full catalog rebuilds and uses a concrete already drafted trigger/revision mechanism. Do not adopt B from #150 while its performance gate fails. Do not deploy C just because its projection appears cheap: publication/R18 correctness plus every cached metadata dependency matters.

Acceptance requires: fresh transactionally bound revision for all relevant series/episodes/author/rights/translation/edition mutations; real PostgreSQL race tests proving rollback and concurrent after-commit epoch invalidation; current user R18 confirmation and age; all JA/EN/KO/Search/Reader/Ranking/routing HTML/RSC; safe fallback/error behavior under PostgREST 2500ms abort; credential scope and DB RPC grants; benign metadata parity; bounded actual Preview timings/status/request counts, independent fixed-HEAD security review and exact user approvals. **Runtime/schema/Production changes remain outside this approved phase.**

PR #153 and PR #150 **MERGE HOLD**.
