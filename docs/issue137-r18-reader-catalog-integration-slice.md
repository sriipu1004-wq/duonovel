# #137 integration candidate: Reader / R18 / public cache and emergency withdrawal

**Status 2026-11-03: NONPRODUCTION INTEGRATION SLICE; NOT A STABLE RELEASE CANDIDATE / MERGE HOLD.**
Author surface: existing [Draft PR #160](https://github.com/sriipu1004-wq/duonovel/pull/160), base current-main `848f8419c64b2954ae004397b5292edf0cb75236`. Overlap: [Draft #153](https://github.com/sriipu1004-wq/duonovel/pull/153) (142 files, old base) and [Draft #150](https://github.com/sriipu1004-wq/duonovel/pull/150) (17 files, performance FAIL). None may be blindly merged, rebased, stacked, marked superseded or applied to hosted Supabase without a specific later authorization. **No Production/Auth/DB/Storage/rights/merge operation occurred in this phase.**

## Selected conflict resolution

| Source choice | Adopted in #160 | Safety rationale | Known remaining issue |
| --- | --- | --- | --- |
| #160: one B2+R0 combined SQL candidate in `scripts/`, 9 B2 triggers; owner emergency PRIVATE+R18 content-rating POST | Retained unchanged | Allows urgent logical withdrawal even while a legacy PUBLIC origin remains; re-publication stays HOLD | Script **not** a deployable migration; Storage physical URL and six Human rights remain unresolved |
| #153: `publicCatalogEpochFence.ts` and R18 viewer/DB-revision-aware `publicWorks.ts` | Selectively imported | DB transactionally advances epoch; per-request reads validate revision *after* viewer-specific R18 enrichment, with uncached direct path when RPC absent; GENERAL and R18 cannot share a viewer-specific cached result | Additional DB round-trips, cross-instance races, in-flight stream already sent, cache/transport latency not production benchmarked |
| #150: request-local-only no shared catalog cache | **Not imported** | #150 marked performance/reliability FAIL; avoid losing shared caching without measured acceptable p95 | Remains Draft HOLD; future profile/compare two approaches, not automatic acceptance |
| #153: R18 Work/Reader/Audiobook/AI-Human TUS and multipart pipeline, B2/H1 proposed migrations | **Not wholesale imported** | 142-file old-base surface contains overlapping schema, privilege, upload and consent boundaries; cherry-picking is not equivalent to a validated integration | Protected media playback, full Human ownership/consent and privileged upload boundary still block stable release |

### Runtime delta actually selected

- `src/lib/publicWorks.ts`: take the #153 epoch-bounded catalog version `v13-db-epoch-bound`, including request-scoped R18 discovery with a verified SSR session, DB profile recheck, and a final after-enrichment epoch validation. `src/lib/publicCatalogEpochFence.ts`: pure revision/rating fence. **No service-role authorization of the end-user**; admin usage for specific public metadata/consent and epoch read still needs independent audit.
- `src/app/works/[seriesId]/page.tsx`: anonymous Work/episode read remains the GENERAL fast path. If a work is hidden by restrictive anonymous R18 RLS, the fallback uses `getCurrentR18ViewerPreference()` (server-verified JWT + DB age/opt-in) AND a second `auth.getUser()` identity match before issuing a *user-scoped SSR-client* series request. Episode metadata/nav/range use that same authenticated RLS only for the R18 branch. The shared Work body still applies `canViewPublicWorkBody` before author/details/redirects. A non-existent PRIVATE work does **not** become public just because the user signed in.
- `src/app/api/series/[seriesId]/content-rating/route.ts`: existing #160 emergency owner POST persists PRIVATE+R18 in one DB update and invalidates public cache/Work path. **Not** a fully transactionally version-fenced owner-edit workflow, not a physical Storage revocation and not exposed through a verified new owner UI yet.

### Actual local HTTP acceptance (on final fixed HEAD only)

`scripts/issue137-b2/r0-next-http-e2e.mjs` with isolated GoTrue, PostgREST, Storage, locally spawned actual Next.js server + SSR cookies should verify:
1. **Public GENERAL** work appears on Search, Work and Reader before withdrawal, then disappears from cached Search and Work/Reader HTML/RSC after owner emergency PRIVATE+R18. Historical WAV remains physically PUBLIC until explicitly approved retirement, and re-publish remains blocked.
2. **Separate public R18** work initially contains no Public-origin media. Anonymous Search/Work/Reader do not serialize unique restricted title/body; age-confirmed opted-in authenticated nonowner can see the actual Search card, Work detail and Reader content via real RLS. Switching `users.show_r18_content` off while keeping the same cookie and Next server suppresses all three again.
3. Other-user/anonymous emergency POST denied, malicious payload denied; R18 public-only rating change with legacy PUBLIC media rejected. Existing private AI/Human physical-custody, alternate-public writer, signed URL/local retirement, DB transaction rollback and duplicate-install negatives preserved.
4. Any failure, unexpected protected metadata, denial of an authorized R18 reader, stale catalog after withdrawal or loss of GENERAL public reads is **release FAIL/HOLD**. Source-only success, CI, Preview or actual localhost are never independent audit.

## Explicit remaining blockers in delivery order

1. **Integrated real Human/AI secure media and release migration**: No whole #153 protected media runtime, signed playback/Owner UI, consent and privileged S3/TUS writer gate has been brought over. Resolve scoped author-side safety with one migration against the real current schema **without** replaying 51+4 old source or duplicating #153 trigger installation. Current version/ledger divergence blocks any hosted `db push`.
2. **Publication and stale-writer concurrency / cross-instance caches**: existing rating API does not implement full version/optimistic locking; a two-query in-flight race and bytes already streamed cannot be retroactively recalled. The epoch guard is not proof of global cache coherence; source revalidation can be tested, but Production p95/5xx and #150 FAIL must be measured separately.
3. **Actual media custody and rights**: legacy Public URLs remain directly addressable, six Human orphan objects have no verified historical consent; keep exact object cohort/rights HOLD. Prior 3-file synthetic private backup/retire/restore only validates local origin and same-process journal reload, not global CDN or committed DB+Storage recovery.
4. **Review/approval**: once integrated application and migration are stable at one fixed HEAD, obtain genuinely distinct security + R18/ownership + rights/database reviewer GO. No self-review/CI can supply it. Explicit user approval is still required **separately** for exact merge Preview and for every Production DB/history/Storage/rights/publication action. Old #153/#150 remain Draft and unmerged.

**Decision:** This is a meaningful nonproduction **Reader/R18/catalog-cache integration slice** of #137, not a claim that the 142-file protected-media release and its dependent migrations are complete. No project roadmap reprioritization or additional Issue started.
