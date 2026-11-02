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

## Decision / stopping conditions

**Prefer E for further nonproduction investigation**, because it addresses the unsafe stale refresh without unconditional full catalog rebuilds and uses a concrete already drafted trigger/revision mechanism. Do not adopt B from #150 while its performance gate fails. Do not deploy C just because its projection appears cheap: publication/R18 correctness plus every cached metadata dependency matters.

Acceptance requires: fresh transactionally bound revision for all relevant series/episodes/author/rights/translation/edition mutations; real PostgreSQL race tests proving rollback and concurrent after-commit epoch invalidation; current user R18 confirmation and age; all JA/EN/KO/Search/Reader/Ranking/routing HTML/RSC; safe fallback/error behavior under PostgREST 2500ms abort; credential scope and DB RPC grants; benign metadata parity; bounded actual Preview timings/status/request counts, independent fixed-HEAD security review and exact user approvals. **Runtime/schema/Production changes remain outside this approved phase.**

PR #153 and PR #150 **MERGE HOLD**.
