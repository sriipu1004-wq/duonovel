# Issue #137 B2 — nonproduction R18 and protected-media candidate

**Draft PR only. No Production DB/Auth/Storage/rights writes, no merge authorization.**

Base main is 74c816edf22446bf0668d01d1164e1780d7f6899. The user authorized bounded B2 source implementation, local synthetic tests, standard CI and same-HEAD Preview. PR #150 remains independent FIX/MERGE HOLD.

Effective R18 = rating r18 OR warning sexual_r18. Public/general remains anonymously accessible. Signed-in, self-confirmed and opt-in ON is needed for consumer R18; owners must retain workspace access even when display OFF. All existing permissive RLS policies must be independently checked before production. The migration adds **restrictive** RLS, never widens Data API grants.

The public recording-audio bucket is unchanged. New R18 AI/Nemo/Aivis stores media in a separate private r18-recording-audio bucket and persist private references. A no-store playback proxy checks work/episode/R18 on each request; for HTTP range it forwards a bounded range. Real audio bytes already downloaded cannot be recalled. Human narration remains separate in attribution, consent, and its own private bucket, but new playback requests use the same checked no-store streaming primitive as AI rather than a reusable signed URL. Previously issued signed URLs/browser/CDN caches remain subject to independent expiry and invalidation limits; old publicly hosted Human files are untouched.

A DB trigger blocks classification/publication/episode changes while linked or discoverable prior PUBLIC audio exists. Another trigger blocks public upload with R18/hidden series state, even without a recording row. This intentionally blocks legitimate operations until media is contained; it does NOT delete, copy, inspect or repair any existing media.

**Hard limits:** SQL's known path prefixes cover nemo/, aivis/, human/ in recording-audio; alternate historic/custom-bucket paths and cached/external downloads must be inventoried before release. Service-role reads and any route that emits R18 body must be separately reviewed. The existing public catalog uses shared anonymous cache; request-scoped authenticated viewer supplementary reads have been introduced. No production migration/rollout is authorized by this source change.

Tests include local synthetic GoTrue JWT, Data API policy, general/rating-only/warning-only R18, direct owner updates, public Storage upload, orphan checks, viewer OFF-to-ON and security_invoker view; SOURCE checks and live E2E are distinct. The local tests use freshly created disposable tables approximating actual schema, **not real production user data or the true complete migration history**. B1 tests are historical, not substitute for new B2 proof.

**Mandatory before merge:** exact-HEAD Actions and type/build/Preview, no unresolved FAIL; real signed-in Next.js JA/EN/KO, Original/Bilingual/Translation and Range/streaming tests if feasible; independent separate-session security GO; user exact-head merge approval; then **separate target/count/rollback Production Supabase migration and media containment approval**. Existing six public Human objects cannot be touched under this PR.


## F1 transactional catalog revision candidate (source only)
- Updates to series/episodes or author `display_name` increment a private, one-row revision **in the same PostgreSQL transaction** through statement-level triggers. Rollback also rolls back the revision.
- The read path obtains that revision through a **service-role-only** RPC before/after retrieving the revision-keyed `unstable_cache` result. If it changes, the read retries; after 3 races it errors rather than delivering a stale cached card. No end-user JWT/identity enters a shared cache key.
- With the SQL function absent in a staged Preview, only an **uncached direct** read is allowed. This is a slower compatibility fallback, NOT production performance acceptance and must never be the intended live rollout. A DB connectivity error is fatal/fail-closed.
- Two RPC reads/request and the single-row write serialization can affect TTFB and write latency. Measure with explicit request-duration/error denominator and Postgres lock/contention before release. The short time interval between final revision read and HTML delivery cannot provide instantaneous revocation under all races; do not overpromise CDN/browser/cache invalidation.
- Synthetic GoTrue/PostgREST tests exercise real epoch changes on series/episode/author DML and rejected media mutation rollback; separate executable pure SOURCE test proves cache key/race handling. Neither confirms real Production schema parity or native Next caching semantics.
