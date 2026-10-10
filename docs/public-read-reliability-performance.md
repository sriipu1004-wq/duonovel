# LIB read — Public read / Search reliability & performance plan

Reviewed: **2026-10-06**
Status: **PR1 + PR2 merged / Production verified; DB-dependent remainder blocked; Child84b completed with browser-direct fallback not adopted**
Starting canonical main: `049f89cfcbc28f0273dc2f74bd274480699a1a40`
Production: https://www.syosetu-libread.com

This document records the 2026-10-03 Production incident, the confirmed application-side bottlenecks exposed by that incident, the items that are still unverified, and the ordered optimization plan. It is not permission to weaken security, ownership, R18, publication visibility, translation entitlement, credit, subscription, or private/public isolation.

## 1. Incident classification

Observed user-facing symptoms:

- public work information failed to load;
- login/auth state remained loading;
- affected requests eventually fell into the global error surface / page-display failure.

Vercel Production runtime evidence around the incident includes:

- Supabase-origin responses returning Cloudflare `522 Connection timed out`;
- `/api/ai-usage` returning failures including 503-class behavior;
- `series` fetch failures including upstream/statement timeouts;
- `episodes` fetch failures;
- `recordings` fetch failures;
- cached public-work rebuild failures when episode fetches failed.

The current Production deployment is READY and was not identified as a new deploy regression.

Infrastructure placement verified during review:

- Vercel Production Functions: `iad1` (US East);
- Supabase project: `ap-southeast-1` (Singapore).

Supabase's official status page on 2026-10-03 reported an unresolved **Intermittent latency in Eastern US** incident. The incident explicitly states that servers/serverless functions located in eastern US can be affected regardless of the region in which the Supabase project itself is hosted. API Gateway was shown as degraded while the Singapore compute region itself was operational.

The Supabase project was reported by the Management API as `ACTIVE_HEALTHY`, but two read-only SQL verification attempts from the connected Supabase tool failed with connection timeouts during this investigation.

Current root-cause classification:

- the evidence is strongly consistent with a Vercel-US-East -> Supabase network/API path incident;
- this is not sufficient reason to treat every observed timeout as an application regression;
- however, LIB read currently has application coupling that turns upstream/optional dependency failure into unnecessarily broad page failure, so application resilience work is required even though the upstream incident cannot be prevented by LIB read.

### 1.1 2026-10-04 continuation evidence and PR1 scope

The same dependency path remained unhealthy on 2026-10-04:

- connected read-only SQL still terminated on connection timeout;
- a direct public PostgREST request from the authorized Windows validation host returned Cloudflare 522;
- Production curl probes with a 20 s cap showed Home failing to complete on 3/3 runs despite partial HTTP 200 responses (TTFB about 0.36–0.82 s), the sampled Work detail failing to complete on 3/3 runs (TTFB about 0.30–0.74 s), and Search failing to complete on 1/3 runs while two runs completed in about 0.48–0.67 s.

Bounded PR1 therefore focuses on no-schema containment that can be validated without inventing DB state:

- Home/Auth/bookmark/subscriber/recording/public-work fault isolation;
- safe read-only timeout/retry helper with no mutation retry;
- Author N+1 removal through one public profile query;
- Work metadata/page series sharing and 50-row episode-detail range;
- local fallback for Work recording/reader-like/related reads;
- bounded Search public-data/Auth/saved-filter/popularity reads without rewriting fuzzy/facet semantics;
- explicit canonical public filters on hot public series/episode reads;
- Reader public-read timeout isolation while keeping private-owner and R18 checks fail closed;
- Ranking changed from deploy-time static `select("*")` reads to bounded runtime reads reusing the canonical public-work and recording helpers.

PR1 does not complete Child84. DB summary/Search pagination, popularity-daily cutover, source-language fallback removal, cache invalidation redesign, and DB indexes remain gated on live verification. The Vercel-region experiment is complete and rejected as the current incident fix.

### 1.2 2026-10-05 merge and Production verification

PR #85 was explicitly approved, merged as main `f9f94512047d12f295937bd258880ace276ed0be`, and deployed READY to Production as `dpl_fEhzkzw6FiQhwacjhn7f488aAGYJ`.

The upstream Supabase path remained unhealthy after deployment. Production runtime logs still show bounded `reader series timed out after 2500ms` and Sitemap public-work timeout messages, while the routes return HTTP 200 through their local fallback paths.

A five-route curl sample from the authorized validation host produced:

| Surface | HTTP | TTFB | Total |
| --- | ---: | ---: | ---: |
| Home | 200 | 1.287 s | 3.777 s |
| Search | 200 | 0.361 s | 2.880 s |
| sampled Work | 200 | 1.023 s | 3.519 s |
| sampled Reader | 200 | 0.330 s | 2.830 s |
| Sitemap | 200 | 2.900 s | 2.902 s |

The sampled Work route before PR1 took approximately 39.488 s during the same incident class. This does not prove healthy-database steady-state latency improvement, but it does verify that the incident-time long-hang/global-error path was replaced by bounded local degradation in Production.

Live DB verification is still unavailable: connected Supabase SQL fails even for `select now(), 1` with `Connection terminated due to connection timeout`. Therefore the following remain intentionally unimplemented/unverified rather than guessed:

- exact canonical `source_language` coverage and legacy inference removal;
- `series_popularity_daily` row/freshness/invariant validation and runtime cutover;
- DB-side public-work summary / Search pagination preserving Child78 semantics;
- EXPLAIN/advisor-driven index changes;
- schema-proof removal of remaining legacy `select("*")` reads;
- final healthy-upstream before/after measurements.

Child85 remains blocked by this DB-verification gate.

### 1.3 2026-10-05 DB-independent Reader PR2

While live SQL verification remains unavailable, Child84 can still remove overfetch that is provably independent of Production data contents.

PR #88 changes the Reader path from:

- current episode;
- full episode-navigation list for the entire work;
- Node search for previous/next;

to:

- current episode;
- one bounded query for the immediately previous visible episode;
- one bounded query for the immediately next visible episode.

For public readers, the adjacent queries preserve the existing `posting_status = posted` and `is_published = true` filters. Owner/private behavior keeps the existing owner gate and may query adjacent private episodes only after the owner check. Schema compatibility fallback remains schema-only.

The shared Reader payload is also wrapped in React request `cache()`, allowing `generateMetadata()`, Reader layout and page rendering in the same request to reuse the same public-read loader rather than independently repeating series/current/adjacent/Auth work.

Independent review on 2026-10-06 found no application-code regression in public publication filters, private-owner visibility, R18 fail-closed handling, previous/next semantics, Reader modes, AI/Human translation provenance or permission separation, or credit/subscription entitlement boundaries. The review also found that `scripts/test-public-read-reliability-performance.ts` was not directly invoked by an existing pull-request workflow, so PR #88 added a dedicated Child84 workflow. On final head `a198de75485e07d9f8b1d1be3563b16c1e95ae25`, the Child84 reliability regression, Reader/translation regressions, security regression, TypeScript, changed-scope ESLint, Production build and whitespace check all passed; Child80 and Child81 workflows also passed, and Preview `dpl_ChgTjVCCwjjBkFgMxjsQfJwmgoMP` reached READY.

PR #88 was merged as main `63f340168da1725f9c147a8dba05ecc88898b532`. Production deployment `dpl_ApuftG7vGmithHbv38hSKpvYytqV` reached READY and was aliased to `www.syosetu-libread.com`. Production Home, sampled Work, and sampled JA/EN/KO Reader routes returned HTTP 200 with no generic page-error surface. During the continuing upstream outage, Work/Reader used the dedicated bounded temporary-unavailable surfaces. Healthy-upstream previous/next click-through could not be reverified because a fresh connected SQL probe (`select now(), 1`) still failed with `Connection terminated due to connection timeout`.

No DB/schema/data write is part of PR2 or its Production verification. It does not change Reader modes, R18/ownership/publication checks, translation entitlement, credits/subscription, Public Domain rules, or the DB-verification gates that still block Child85.

## 2. Billing state snapshot

Stripe Live was independently re-read during this review.

Observed Live state:

- successful charges: **0**;
- subscriptions of all statuses: **0**;
- Checkout Sessions: **2**;
  - JPY 300 credit-pack Checkout: expired / unpaid;
  - JPY 680 subscription Checkout: expired / unpaid.

Do not infer paying customers or third-party usage from these sessions. They may include owner/operator validation activity.

## 3. Traffic snapshot interpretation

An earlier operator snapshot during the incident reported roughly:

- 24h: 1,898 HTTP 200 / 75 HTTP 307 / 37 HTTP 503;
- approximately 2,010 runtime requests in that snapshot;
- at least roughly 8,884 requests over a 7-day snapshot.

A later rolling Vercel log query returned materially different counts for the current 24h/7d windows. Because the time window moved and runtime logs include crawler/bot/static-support activity, these counts are not canonical user analytics.

Current rule:

- it is valid to say HTTP/runtime activity exists and bot/crawler traffic is material;
- do not equate runtime request counts with readers, authors, sessions, signups, or growth;
- `/login`, `/register`, legal/contact routes, and `/opengraph-image` can receive machine traffic;
- user-growth conclusions belong to later minimal analytics after real acquisition traffic exists.

## 4. Confirmed current-code bottlenecks

### 4.1 Public work base-card rebuild still reads all public episode rows

`src/lib/publicWorks.ts` currently:

1. fetches all public `series` rows in pages;
2. fetches all public episode rows for those series;
3. groups/sorts the returned episode rows in Node;
4. derives card values such as:
   - episode count;
   - first episode number;
   - latest posted date;
   - public episode-number list.

PR1 reduces each global episode row to the four fields actually needed by this derivation: `id`, `series_id`, `episode_number`, and `posted_at`. The query itself enforces `posting_status = 'posted'` and `is_published = true`, so the former status/schedule columns and Node visibility re-check are no longer fetched for every row.

The remaining bottleneck is row cardinality, not per-row width: the card layer still reads every public episode row to derive summary fields.

Target direction:

- use DB-side aggregation / summary query / safe view / RPC where justified;
- preserve exact public visibility and >1000-row correctness;
- keep the four-column projection until the DB-side summary path is proven.

### 4.2 Author N+1 through Auth Admin — addressed in PR1

Baseline behavior called `auth.admin.getUserById(authorId)` once per distinct author.

PR1 replaces that path with one bounded `public.users(id, display_name)` query using `IN (...)`. Email and privileged Auth metadata are no longer needed for public card construction. Translation eligibility now follows the canonical permission field only; Official authorship is not a permission override.

### 4.3 source_language legacy fallback still exists and is not yet removable

The runtime can fetch the first episode body for works with no canonical `series.source_language` and infer language from source text.

Important constraint:

`20260912153000_add_series_source_language.sql` explicitly says existing rows intentionally remained NULL and must continue through the fallback resolver.

Therefore:

- do **not** remove this fallback merely because `source_language` is now canonical for new/current data;
- first obtain an exact Production count of missing `source_language`, including public works;
- if non-zero, determine a rights-safe/correct backfill source rather than guessing;
- only remove the body-based fallback after the canonical data gate is proven complete.

The count still could not be re-verified on 2026-10-04: connected Production SQL timed out and a separate public PostgREST read returned Cloudflare 522.

### 4.4 Home recording coupling — isolated in PR1

Baseline `loadHomeWorkCards()` waited for both public base work cards and recording aggregates.

PR1 separates recording aggregation into its own bounded promise/Suspense path. Latest/weekly public shelves no longer require recording metrics, and recording failure renders local unavailable state for popularity/narration-dependent sections rather than collapsing the Home page.

### 4.5 Home Auth/viewer blocking — removed in PR1

Baseline `PublicTopPageLegacy` awaited viewer state before returning the public page tree.

PR1 no longer awaits Auth/subscriber/bookmark state in the root Home component. Viewer-specific sections stream independently with bounded reads and availability flags. Auth unavailability is not presented as a confirmed signed-out/bookmark-empty/subscription-empty state.

### 4.6 Work detail metadata/page duplicate reads — reduced in PR1

PR1 adds a request-memoized series loader shared by `generateMetadata()` and the page body. Metadata checks only the first visible episode needed for indexability instead of loading all episode metadata. Canonical/hreflang behavior is preserved.

### 4.7 Work detail all-detail episode fetch — reduced in PR1

PR1 splits episode data into:

- minimal navigation metadata;
- a DB `range(...)` query for the visible 50 detailed rows.

The range count is derived from the already-required navigation rows instead of issuing a second exact-count query. Navigation is paged in 1,000-row chunks so series above the default PostgREST row cap still produce a correct count and resume-range map. Navigation, first-episode, and range reads explicitly apply the same posted/public predicate as the public episode policy (`posting_status = 'posted'` and `is_published = true`), so an authenticated owner session cannot accidentally mix draft/scheduled rows into public range math.

This removes the former all-detail-row fetch followed by Node slicing and one redundant DB request while retaining ordering, first-episode redirect behavior, reader selection, and public visibility semantics.

### 4.8 Related works still depend on the all-public-work base-card dataset

PR1 adds a bounded timeout and local fallback so this optional dependency no longer needs to fail the whole work page. The performance dependency remains: `RelatedWorksSection` still calls `getCachedPublicBaseWorkCards()` and filters all public works to produce:

- up to 4 other works by the same author;
- up to 4 similar works.

Target direction:

- targeted bounded queries, or isolate as below-the-fold optional data;
- do not remove the UI without an explicit user decision.

### 4.9 Search pagination remains UI pagination over a broad in-memory dataset

PR1 bounds/fault-isolates the broad public-data/Auth/saved-filter/popularity reads and distinguishes unavailable data from a real zero-result state. It deliberately does not replace Child78 fuzzy/CJK/Levenshtein/facet semantics with naive SQL matching.

Current Search still starts from `getCachedPublicBaseWorkCards()`, then performs a significant portion of filtering/faceting/sorting before pagination.

Target direction:

- move supported filters/sorts/ranges to DB queries;
- DB-side LIMIT/OFFSET or cursor where appropriate;
- keep facet/count queries separate from the result-page query where necessary;
- preserve Child78 semantics, source-language filtering, fuzzy metadata behavior, and >1000-row correctness.

### 4.10 Popularity daily aggregation already exists, but runtime ignores it

A canonical table already exists:

`public.series_popularity_daily`

The migration also creates triggers for:

- support reactions;
- bookmarks;
- series views;
- recording plays;

and performs an initial backfill.

However, current `src/lib/popularity.ts` still reads raw rows from:

- `user_series_reactions`;
- `user_series_bookmarks`;
- `series_view_events`;
- `recording_play_events`;

then rebuilds daily aggregates in Node with a short cache.

Target direction:

- validate the existing daily aggregate data/invariants;
- read `series_popularity_daily` in the hot Search/Home ranking path;
- do **not** create a duplicate popularity table unless a measured requirement proves the existing design insufficient.

### 4.11 select("*") compatibility fallback remains on hot paths

Confirmed examples include series, episodes, recordings, and author/user reads.

Target direction:

- narrow selects on normal hot paths;
- prove schema rollout is complete before removing compatibility fallback;
- do not make a failed narrow query silently turn every request into heavy `select("*")` forever.

### 4.12 Search EN/KO legacy React-tree localization remains

Search still renders the legacy tree and recursively localizes/rewrites it for EN/KO.

Classification:

- real technical debt;
- lower priority than DB/network/fault-isolation work;
- no large Search rewrite solely for this task;
- move toward dictionary-native rendering when Search is next structurally refactored.

### 4.13 OpenGraph crawler load — audited, no Child84 change required

`src/app/opengraph-image.tsx` is data-independent: it does not read Supabase, Auth, or any external API. Current Vercel builds classify `/opengraph-image` as `○ (Static) prerendered as static content`, not a runtime server-rendered route.

Therefore the OpenGraph image is not part of the observed Vercel→Supabase failure path and does not justify a Child84 cache/static-asset rewrite. Revisit only if future usage/cost evidence shows image-delivery overhead independent of the current database incident.

### 4.14 Ranking deploy-time Supabase dependency — addressed in PR1

The baseline Ranking page was statically evaluated during `next build` and issued three broad `select("*")` reads against series, recordings, and episodes. During the 2026-10-04 Preview build, those reads reproduced Cloudflare 522 and held static generation open.

PR1 changes Ranking to `force-dynamic`, reuses the canonical cached public-work and public-recording aggregate loaders, applies bounded runtime timeouts, and keeps the existing local error/partial-warning UI. This removes Ranking's Supabase dependency from the deployment build path without removing the surface.

### 4.15 Sitemap deploy-time dynamic-work dependency — addressed in PR1

After Ranking was removed from static generation, the next Preview exposed the same upstream failure in `/sitemap.xml`: dynamic public-work discovery hit Cloudflare 522 during `next build`. The existing sitemap fallback prevented a build failure, but the deploy still waited on the upstream request and could publish a sitemap temporarily missing work/episode URLs.

PR1 therefore makes the sitemap metadata route dynamic and bounds public-work discovery to 2.5 seconds with no retry. On upstream failure, the existing static landing URLs remain available and the next crawler request can recover work/episode entries without waiting for a new deployment. No crawler-visible route is removed.

### 4.16 Work / Reader core-read failure semantics — addressed in PR1

Preview runtime verification against the continuing Supabase outage showed that optional Home/Search/Ranking/Sitemap failures were contained, but the requested Work/Reader core series read could still throw a `ReadOnlyTimeoutError` into the streamed route. A streamed HTTP 200 with generic error/not-found-looking output is not an acceptable substitute for a readable failure state.

PR1 now keeps these cases distinct:

- a successful core lookup that proves the work/episode does not exist or is not publicly visible still follows the existing `notFound()` / permission path;
- a timeout, 522/503, connection failure, or other upstream read failure returns a localized temporary-unavailable surface instead of the generic page error;
- private-owner and R18 checks are unchanged and continue to fail closed;
- subscriber, author-profile and narration-related reads remain optional and cannot remove the core public reading surface.

Work content-rating safety has its own independent fail-closed boundary. If the layout cannot verify `content_rating/content_warnings`, it does not render the Work children even if the page-level series read happens to succeed. It returns a localized temporary-unavailable safety surface instead. For a verified R18 work, the viewer-preference read is also bounded; failure remains blocked rather than assuming R18 access.

Preview `eb55c0348f2f8a885346c12c9c82112c67701c78` verified this during the live incident: the Work layout series read timed out after 2.2 s and the page series read after 2.5 s, the route returned HTTP 200 with the content-safety unavailable surface, and the sampled work content was not rendered.

Preview verification on commit `b2619b16b63d14478c310431b57fe69ebab7a74b` confirmed the containment while the upstream remained unhealthy:

- `/` → 200 with Home-local unavailable state;
- `/search` → 200 with bounded public-work fallback;
- `/ranking` → 200 with bounded ranking fallback;
- `/sitemap.xml` → 200 using the static-only fallback when public-work discovery timed out;
- sampled `/works/{seriesId}` → 200 with the dedicated Work temporary-unavailable surface after a 2.5 s core series timeout;
- sampled `/read/{seriesId}/1` → 200 with the dedicated Reader temporary-unavailable surface after a 2.5 s core series timeout.

The Preview runtime logs contain those bounded timeout classifications and no generic page-error message for the sampled routes.

A follow-up Preview log audit also showed repeated `Auth session missing!` warnings for normal anonymous requests. PR1 now classifies Supabase `AuthSessionMissingError` as a healthy signed-out state on Home, Work, Reader, and Search saved-filter paths. Real Auth/network errors remain unavailable. This prevents anonymous users from being mislabeled as an Auth outage while preserving the same fail-safe behavior for actual Auth failures.

### 4.17 Vercel Singapore region experiment — rejected as an incident fix

A stacked Preview-only experiment (PR #86, commit `e1adf8d694b35ec1186a7b1bafe49e257b1dc615`) added Vercel `regions: ["sin1"]` on top of PR1. Deployment metadata confirmed the Vercel Function region was `sin1`; a sampled response also reported an `x-vercel-id` ending in the Singapore execution region.

The same upstream failure still reproduced:

- Home public works timed out after 2.5 s;
- Search public works timed out after 3.5 s;
- Ranking public works timed out after 3.0 s;
- Sitemap public works timed out after 2.5 s;
- sampled Work core series read timed out after 2.5 s.

Therefore moving Vercel Functions from `iad1` to `sin1` does **not** resolve the current incident. The region change is not a Production recommendation and PR #86 must remain unmerged.

### 4.18 Cache invalidation audit — TTL extension remains blocked

Current hot caches are:

- public base work cards: 60 s;
- public recording aggregates: 60 s;
- raw popularity dataset: 15 s.

Repository-wide inspection found no current `revalidateTag`, `updateTag`, or `revalidatePath` invalidation path for these caches. More importantly, primary series and episode create/edit flows write directly from Client Components to Supabase, including `WriteSeriesForm`, `WriteSeriesCreateForm`, and `WriteEpisodeForm`. Recording mutations are split across server routes/libraries.

Because not every canonical public-data mutation passes through one server-controlled invalidation boundary, extending metadata TTL now could serve stale publication/title/episode state after a successful edit. PR1 therefore keeps the current short TTLs unchanged.

A future TTL increase requires either:

- centralizing relevant public mutations behind server-controlled endpoints/actions; or
- adding an equally complete invalidation mechanism that also covers the current client-direct Supabase mutation paths.

Partial server-route invalidation alone is insufficient and should not be presented as complete.

### 4.19 Read deadline must abort the underlying HTTP request

The first PR1 timeout implementation used `Promise.race` to stop awaiting a read. Preview timing proved that this was insufficient for some streamed routes: the route could render a local timeout state while the underlying Supabase HTTP request remained alive and kept the full response open.

Measured from the same authorized desktop during the continuing incident:

| Surface | Production main sample | pre-abort Preview sample | final abort Preview `b28277d` |
| --- | ---: | ---: | ---: |
| Home | 40.493 s | 3.595–3.705 s | 2.869 s |
| Search | 0.427 s | 3.434–4.101 s | 2.970 s |
| sampled Work | 39.488 s | 39.614–39.967 s | 5.693 s |
| sampled Reader | not included in the Production timing sample | 2.892 s after core abort | 3.277 s |

The Search Production sample happened to complete during an intermittent healthy interval and is not treated as a stable baseline.

PR1 therefore now:

- supplies an `AbortSignal` from the bounded read helper and aborts it at the deadline;
- applies `.abortSignal(signal)` to Work/Reader critical PostgREST reads;
- configures the anonymous public-work Supabase client with a 2.5 s aborting fetch boundary;
- bounds Work layout content-rating and translation-availability reads as well as the page body;
- does not retry a locally generated deadline after abort;
- keeps the dedicated local unavailable UI.

This changed the sampled Work failure path from roughly 40 seconds to roughly 5.7 seconds while the upstream remained unhealthy. The remaining duration is consistent with multiple separately bounded Work route layers rather than one unbounded connection.

### 4.20 Compatibility fallback is schema-only

A narrow-column read must not fall back to `select("*")` merely because the network, gateway, or database is unavailable. During a 522/timeout this would duplicate the failed request and increase upstream work.

PR1 now permits the broad compatibility fallback only for recognizable schema/column compatibility failures such as PostgreSQL `42703` or PostgREST `PGRST204`. Network failures, 522/503, aborts, and timeouts propagate to the bounded local failure state instead.

### 4.21 Global Auth header spinner is bounded

The original incident included the header remaining on “認証確認中...” indefinitely. The client `AuthStatus` component previously called `supabase.auth.getUser()` without a deadline.

PR1 now releases that loading state after a 2.5 s bounded read. A real Auth/network failure shows the existing Auth-state error/login surface, while `AuthSessionMissingError` remains a normal signed-out state. This directly closes the indefinite global auth-spinner path without weakening authenticated behavior.


### 4.22 Child84b public Reader failure-domain audit

Question:

Can the core public Reader recover through the end-user browser when the Vercel server -> Supabase path is transiently unavailable?

Result: **no for the current incident; browser-direct fallback is not adopted.**

Audit findings:

- the connected Production Supabase project remains `ACTIVE_HEALTHY` in `ap-southeast-1`, but connected SQL still fails even `select now(), 1` with `Connection terminated due to connection timeout`;
- Production Vercel remains READY in `iad1`; the earlier `sin1` Preview reproduced the same bounded Supabase timeouts, so Vercel region switching alone is not a failure-domain fix;
- the project exposes the normal low-privilege frontend Supabase credential and repository migrations enable RLS on `series` and `episodes`;
- the canonical 2026-09-15 RLS hardening migration removes the old permissive `is_public` policy, limits anonymous series reads to `publication_status = 'public'`, and limits public episode reads to a public series plus `posting_status = 'posted'` and `is_published = true`;
- live Production policy-catalog/grant verification remains impossible while the SQL connection path is down, so repository migration state is not promoted to a stronger live-state claim.

Prototype security contract:

1. normal server Reader stayed authoritative;
2. only a classified transient server failure could start fallback;
3. fallback used a dedicated sessionless anonymous browser client and never a service-role credential;
4. series metadata was queried first with an explicit public filter;
5. canonical content rating was checked before any episode/body query;
6. R18 was excluded because the anonymous path cannot safely prove the viewer's R18 preference;
7. current/previous/next episode queries required `posting_status = 'posted'` and `is_published = true` and were post-validated;
8. the degraded surface was source-only and excluded AI/Human translation, entitlement/credits, narration, bookmarks/reactions, publishing, and every mutation;
9. browser failure stayed on a dedicated unavailable surface rather than escalating to the global error.

Preview / direct-path evidence:

- prototype Preview deployment `dpl_EbXjLSTs5FKbBGgRXNMLQPCa66A9` at branch SHA `45496159a4598c04f70e05d84e599a4e8969eb91` reached READY;
- all five GitHub PR workflows on that prototype SHA passed, including the dedicated Child84 fallback/security regression, Reader/Human-translation/security regressions, TypeScript, ESLint, and Production build;
- a real browser opened the sampled public Reader route and the bounded server-side Reader failure correctly activated the local fallback rather than the global application-error surface;
- the browser's Supabase REST CORS preflight returned HTTP 200 through the Supabase/Cloudflare edge, proving the browser could reach the public gateway;
- the actual public series Data API GET did not return before the fallback deadline;
- an independent direct GET from the authorized Windows validation machine, using the same public Data API route, was allowed 15 s and ended with 0 response bytes, HTTP 000, and a client timeout.

Interpretation:

The browser path removed Vercel from the network chain but did **not** remove the failing Supabase read data plane. This incident therefore is not adequately isolated by Browser -> Supabase. The fallback would add a second client-side data path and extra incident latency without demonstrated recovery benefit. The prototype application code was withdrawn before merge.

R18 / publication finding:

RLS is the publication boundary, not the R18 viewer-preference boundary. A canonically public R18 row can be readable under publication RLS even when the application's viewer-preference check is unavailable. Any future direct fallback must therefore remain a two-stage metadata-first design and fail closed before body retrieval. Child84b does not alter the current R18 behavior.

Read Replica finding:

Supabase currently documents Read Replicas for Pro/Team/Enterprise projects with infrastructure prerequisites including AWS, at least Small compute, Postgres 15+, and non-legacy backup requirements. This organization is Pro and the project is Postgres 17 in an AWS region, but current compute size and backup-mode prerequisites have not been independently verified. Replicas are asynchronous and can lag; they expose dedicated database/API endpoints and REST GET support, while Auth/Storage/Realtime are not served from the replica. Cost is additional replica compute and storage plus applicable optional resources; no project-specific amount is claimed here.

A Read Replica is **not** adopted as Child84b outage failover. Beyond unverified eligibility/cost, asynchronous lag can return stale publication state after unpublish/delete. That conflicts with the hard requirement that private, deleted, or unpublished content must not become visible through a resilience path.

Future true-diversification condition:

A genuinely independent public Reader mirror/cache becomes eligible for design only after all publish/edit/unpublish/delete operations pass through a complete server-controlled invalidation/tombstone boundary. At that point an independently hosted read-only mirror/CDN can carry explicit source/version/visibility state and be tested for fail-closed withdrawal semantics. Until then, stale-cache fallback remains more dangerous than the availability gain.

### 4.23 Post-incident recovery and DB-read audit (2026-10-10)

Supabase Support ticket SU-500983 confirmed the project became unhealthy around 2026-10-02 13:10 UTC with memory overcommitment and elevated IOWait; OOM was possible but not confirmed. Support restarted the project and connected Production `select now(), 1` succeeded. This **unblocks read-only Child84 DB verification**; it does not prove the prior failure's sole root cause or that all pages are healthy. Nano is still configured. A paid-org Nano -> Micro upgrade is recommended by Support at the same credited compute rate, but requires manual Dashboard action and brief downtime; no upgrade was executed in this audit.

Initial non-mutating SQL audit:
- `series`: 123 total, 120 public, public source_language NULL = 0; public JA=40, EN=40, KO=40; private NULL=3.
- `series_popularity_daily`: 294 buckets, latest bucket 2026-10-02, view sum 518 vs 444 raw `series_view_events`; 50 buckets refer to non-existent series and account for all 74 excess views, of which 48 are mismatched. Invariant and lifecycle semantics must be resolved before a popularity runtime cutover; **no data cleanup** was performed.
- DB size approximately 77 MB, `episodes` approximately 35 MB, `pg_stat_statements` installed. Cumulative statistics show heavy historical episode/recording query activity, but no narrow incident-time causation was proven.
- Live `public.users` schema has `id` and `display_name`, not `username`, `pen_name`, or `name`. Edge logs after recovery show optional Work author metadata queries repeatedly returning 400 due to a legacy column selection. PR #91 narrowed the selection, passed CI and was merged/deployed READY on 2026-10-10; the follow-up Reader column bug is handled separately in Draft PR #93.
- DB backups / off-site export have not been independently verified. Restoring or replacing the Production DB remains out of scope.

Retain the existing Child78 Search, R18, publication, owner, translation, and entitlement invariants. Before Child84 DONE: complete DB-dependent safe cutovers and healthy-upstream measurements, verify the micro-upgrade / backup status separately, then obtain explicit approval for any merge.


### 4.24 Reader author metadata 400 follow-up (Draft; 2026-10-10)

Production Edge logs after PR #91/#92 deployment still showed a separate `public.users` 400 with `select=display_name,username,pen_name,name`. Source inspection identified `src/app/read/[seriesId]/[episodeNumber]/page.tsx`'s `getNormalAuthorName` as the exact query path; Production `public.users` has `display_name` but not the three legacy columns. Child84 Reader follow-up selects only `display_name`, retaining the existing `series.author_name` / localized fallback and existing timeout handling. This is distinct from the already merged Work-detail author fix in PR #91. No DB/schema/data change. The follow-up remains Draft pending CI, Preview, user approval and healthy Production validation.

## 5. Retry / timeout rules

Limited retry may be useful only for safe, idempotent/read-only operations and only for clearly transient network failures.

Allowed candidates after measurement:

- public series read;
- public episode metadata read;
- optional public aggregate read.

Do not blindly retry:

- credit consumption;
- unlock creation;
- payment/Stripe mutation;
- publishing/unpublishing;
- permission mutation;
- any mutation whose idempotency is not explicitly guaranteed.

Requirements:

- bounded timeout;
- at most a small bounded retry count;
- network/transient classification;
- then local fallback/retry UI rather than an indefinite spinner;
- do not retry a locally generated `ReadOnlyTimeoutError` when the underlying request cannot be aborted. `Promise.race` only bounds how long LIB read waits; it does not cancel the still-running Supabase request, so retrying that local timeout can overlap duplicate reads and amplify an outage;
- immediate upstream failures that have already terminated, such as explicit 522/503/connection-reset responses, may still use the small read-only retry budget.

## 6. Fault-isolation model

Treat data by criticality.

Critical examples:

- requested work's core public series record;
- the visible public episode range needed to navigate/read.

Optional/viewer-specific examples:

- Auth state on a public page;
- subscription badge/upsell personalization;
- bookmark state/update shelf;
- Human narration/recording popularity;
- author other works;
- similar works;
- popularity metrics;
- secondary recommendations.

Rule:

**optional failure must not throw the entire public page into the global error boundary.**

Show a section-local fallback/retry state instead.

## 7. Region decision gate

Current placement:

- Vercel Functions: `iad1`;
- Supabase: Singapore.

Because the Supabase incident specifically affected eastern-US clients, moving Vercel server execution closer to Singapore/Asia is now a legitimate hypothesis to test.

Do not change Production region by guess.

Before any region change:

- verify supported Vercel region/config for the current Next.js project;
- use Preview;
- test Auth;
- test public Supabase reads;
- test Stripe Checkout creation/webhook assumptions;
- test OpenAI translation path;
- test Reader;
- test relevant webhook/callback behavior;
- compare latency before/after.

Only promote a region change after explicit user approval.

## 8. DB index/query-plan rules

Do not add indexes because they seem plausible.

Inspect actual query plans / measured slow paths first.

Candidate columns to verify include:

- `series.publication_status`;
- `series.source_language`;
- `episodes.series_id`;
- `episodes.episode_number`;
- episode publication/posting visibility columns;
- translation language/version/filter columns;
- popularity event `series_id` + `created_at`;
- bookmark/reaction `user_id` + `series_id`.

For every new index:

- tie it to a real query;
- compare plan/cost;
- check write/storage trade-offs;
- run Supabase advisors after DDL.

## 9. Cache strategy

Current public base-card cache revalidates on roughly a 60-second cadence.

Target direction:

- reduce unnecessary full rebuilds;
- consider longer TTL for stable public metadata;
- use explicit tag/path invalidation on publish/edit/unpublish/delete if the current framework/data flow supports it safely;
- ensure invalidation covers fields actually rendered in Search/Home/cards;
- do not serve private/unpublished stale data.

Goal:

`viewer request count != full public-corpus rebuild count`.

## 10. UI disposition gate

Do not delete these solely for performance:

- Home narration-popular shelf;
- Home bookmark updates;
- work-page author other works;
- work-page similar works;
- Search narration-popular shelf.

Default order:

1. keep;
2. isolate / lazy-load;
3. narrow the query;
4. measure;
5. only then ask the user whether a persistently poor-value surface should be removed.

## 11. Ordered implementation phases

### Phase 1 — Production resilience

Highest priority.

- prevent optional dependency failures from reaching the global error boundary;
- make Home public shell independent from Auth success;
- isolate recording/recommendation/bookmark/subscriber failures;
- eliminate indefinite loading;
- add bounded read-only timeout/retry only where safe;
- add section-level retry/fallback UI.

### Phase 2 — obvious overfetch / duplicate work

- metadata/page shared loader;
- Author N+1 removal;
- exact `source_language` completion check, then legacy-path decision;
- work detail 50-episode DB range;
- related works targeted/below-fold reads;
- reduce `select("*")` hot-path fallback where rollout is proven complete.

### Phase 3 — list/search/ranking foundation

- DB-side public-work summary;
- Search DB pagination/filter/sort where semantics can be preserved;
- separate facet/count queries as needed;
- switch runtime popularity reads to existing `series_popularity_daily`;
- measure row/column/query reduction.

### Phase 4 — cache / infrastructure

- tag/path invalidation vs TTL redesign;
- Vercel/Supabase region Preview test;
- real EXPLAIN/query-plan-driven index changes;
- OpenGraph cache/static feasibility.

### Phase 5 — Production measurement

Compare before/after for:

- Home;
- Search;
- Work detail;
- Reader.

Measure where available:

- TTFB;
- server duration;
- DB request count;
- DB rows/columns transferred;
- 5xx;
- Supabase timeout/error rate.

Do not claim improvement without a before/after basis where measurement is possible.

## 12. Public Domain scaling gate

Do not increase the Public Domain corpus into the hundreds while the current broad-read architecture remains.

Ordered scale path:

1. complete the reliability/performance workstream;
2. add a controlled **30–60 work** rights/provenance-verified Public Domain batch;
3. verify Production performance/error behavior;
4. only if the scale gate passes, continue staged corpus growth.

Public Domain rules remain unchanged:

- rights/provenance evidence required;
- Official alone is not a rights basis;
- no fabricated source/edition/translator/hash data;
- legacy 36 rights-unverified Official works are not bulk-approved.

## 13. Roadmap interaction

This Production incident is a valid priority interrupt under the canonical roadmap protocol.

Current dependency-aware order:

1. Child84 — DB-dependent remainder remains blocked while the connected Supabase SQL path cannot complete the minimal probe;
2. Child84b — completed during that dependency block with no browser-direct fallback adoption;
3. after Supabase recovery, return to the Child84 DB-dependent remainder and complete its verification gates;
4. Child85 — staged Public Domain expansion (30–60 verified works);
5. Child86 — post-expansion Production scale verification;
6. Child87 — Acquisition;
7. Child88 — Real usage observation / minimal analytics.

Acquisition is displaced, not deleted.

## 14. Scope boundary

This workstream must not absorb unrelated in-progress fixes such as:

- author-facing AI explanation;
- translation permission changes;
- Public Domain translation/narration feature work;
- work-creation UI changes;
- new-work abandonment bug fixes;

unless an exact dependency is demonstrated.

Use a dedicated branch/PR for reliability/performance.

New feature freeze remains in effect.

## 15. Child84 existing popularity daily aggregation cutover (PR #92 Production READY)

2026-10-10 connected Production SQL returned successfully after Supabase Support recovered the database. A read-only reconciliation of `public.series_popularity_daily` against source reactions, bookmarks, view events and recording play events established:

- 294 daily buckets total;
- 244 buckets referencing **existing** series, with **0 discrepancies** across all four event metrics;
- 50 remaining buckets referencing **non-existent** series, including 74 retained view counts no longer present in raw events;
- existing compound primary key `(series_id, bucket_date)` and daily bucket date index.

The read cutover merged in PR #92 reads the existing daily aggregate, restricted to the precise caller-supplied series IDs; consequently, aggregate rows for deleted works are not consulted or exposed. The read is bounded into stable ordered pages of up to 1000 rows, including a continuation page when the limit is reached. The 15-second Next cache revalidation interval and public-search time-window conversion (Asia/Tokyo buckets) are preserved. Failed aggregate reads raise an error so the caller's existing availability/error boundary remains responsible for handling upstream failure, rather than claiming that counts are zero.

No `series_popularity_daily` schema, trigger, raw event row, orphan aggregate row, or Production data was modified. The orphan history's retention/deletion semantics remain open for separate review. No new index was added because the current aggregate is tiny and the read-only EXPLAIN evidence does not justify an unreviewed index.

This change merged in PR #92 after explicit approval and its combined Production deployment reached READY at `dpl_Ew3wnwkFWkTg6f87uUy8etYzn6bP`. Healthy Production request-level behavior and performance improvement measurement remain open. Child84 Search facets/pagination, public-work metadata summary, cache invalidation, independent backup verification, Reader click-through and before/after healthy-upstream performance verification remain separate gates.

## 16. Child84 public-work episode summary (PR #94 merged; Production verified)

**Motivation.** `buildPublicBaseWorkCards` still fetched up to 3,284 posted/published episode metadata rows in repeated 1,000-row API pages for 120 public series. This was wasteful during Home/Search/Work/Reader/SEO cache misses and cache revalidation.

**Applied migration:** `supabase/migrations/20261010013603_public_episode_work_summaries.sql` creates a `public_episode_work_summaries` VIEW with `security_invoker = true`, explicit `anon` / `authenticated` SELECT grants and no episode bodies. Its query joins `public.series` and `public.episodes`, requires `series.publication_status='public'`, `episodes.posting_status='posted'` and `episodes.is_published=true`. Existing source-table RLS and the application's subsequent content-rating / viewer boundary remain in force. First/last episodes use `episode_number` plus `id` deterministic ordering; each summary retains every positive public episode number required by the existing product.

**Read-only Production evidence (2026-10-10):** 120 series / 3,284 visible episodes; direct ranked-baseline vs aggregate comparison showed 0 discrepancies for count, first id/number/posted_at and latest posted_at, and 0 positive-number-array length discrepancies. On warm Production data, `EXPLAIN (ANALYZE, BUFFERS)` reported approximately 6.4 ms database execution, with 0 disk reads in that run. Equivalent illustrative SQL JSON payloads measured 546,764 bytes for existing episode rows vs 44,309 bytes for summaries (~92% fewer bytes); **not** a measured HTTP transfer or page latency improvement.

**Application behavior:** the server's public Supabase client reads the new view with bounded ordered pagination and a server-side input-series filter. When the view is specifically missing (`PGRST205` / `42P01` naming the view), the legacy paginated episode path remains available for Preview and phased rollout. Other failures (timeouts, permissions, Data API errors) throw, preserving the existing failure boundary rather than masking the incident.

**Production acceptance:** Both exact Supabase migration versions `20261010013603` (view) and `20261010013642` (revoke default DML grants; retain anon/authenticated SELECT) were applied and appear in the migration history. The view has `security_invoker=true`, anon SELECT returns 120 public series / 3,284 episodes, INSERT/UPDATE/DELETE are denied, no nonpublic series was found and the underlying 123 series / 3,284 episode rows remained unchanged. After explicit approval PR #94 merged into main `398eb396796f2485f37dc5880d33281fdaf4ac08`; Vercel Production `dpl_5kruXnw1gihDmRgpikL5XrttKnV4` became READY. A live Supabase Edge log recorded HTTP 200 for `/rest/v1/public_episode_work_summaries`, confirming runtime adoption. Cache TTL remains 60s. Exact before/after HTTP payload, p95 latency and long-run error reduction remain unproven; do not claim measured 92% network reduction. Source-language search, ownership, publication, R18, AI/Human provenance and entitlements remain unchanged.

## 17. Child84 post-recovery public smoke and remaining Search/cache gates

Production deployment `dpl_5kruXnw1gihDmRgpikL5XrttKnV4` (main `398eb396796f2485f37dc5880d33281fdaf4ac08`) was READY. Authorized read-only HTTP GETs:
- Home HTTP 200, TTFB 1.138 s, total 2.617 s
- Search HTTP 200, TTFB 0.826 s, total 2.257 s
- Public general Work HTTP 200, TTFB 0.563 s, total 3.621 s
- Public general Reader episode 1 HTTP 200, TTFB 0.640 s, total 4.342 s

Supabase Data API edge telemetry recorded `/rest/v1/public_episode_work_summaries` with HTTP 200 after the merge. Additional anonymous public Reader route-pair smoke using published, general-rating works:
- EN episode 1 / 2: HTTP 200, total 3.289 s / 2.978 s
- JA episode 1 / 2: HTTP 200, total 4.187 s / 4.866 s
- KO episode 1 / 2: HTTP 200, total 4.048 s / 3.505 s
These were separate GET requests rather than browser next-button clicks and do not verify translated content, Human translation selection, logged-in permissions or R18 interactivity. All six requests returned 200; no source work was edited.

These bounded samples are smoke tests, not a full interactive E2E or p95 performance benchmark; Next.js cache warmth and other network conditions were uncontrolled. Reader prev/next, translation choice/mode, actual R18 fail-closed UI, Search result/facet/ordering parity and deletion/unpublish invalidation must be separately tested.

Current Search obtains cached public work cards (at present 120 public series), then applies in-memory source-language filters, fuzzy title/author search, tag/genre self-excluded facet counts, popularity/daily-score and narration sorting, saved lists and pagination. Shipping a simple DB LIMIT/OFFSET upstream would alter result totals, ranking, and facets. A DB-paging rewrite must first define equivalent matching/aggregation semantics, count sources and 1000+ rows parity tests, with no retired `read_language` reintroduction. Given current dataset size, defer any unverified optimization change rather than regress Search correctness; the canonical roadmap order remains unchanged.

The public-work cache currently revalidates after 60s and source-language legacy fallback still exists for private NULL rows. Author series/episode writes still include Client-to-Supabase mutations without centralized publish/unpublish/delete revalidation; do **not** extend cache TTL or add asynchronous read-mirror delivery until server-controlled invalidation/tombstones can guarantee fail-closed public visibility.

No additional Production DB/data writes, indexes or cache configuration changes were made in this read-only smoke/plan update. Independent backup/restore proof and current Compute tier metadata remain unverified.

## 18. Child84 Search SQL pagination equivalence gate (Draft; no SQL cutover)

The current Search page still processes the complete bounded public-work-card set (120 public series at this verification point). It calculates JavaScript-side fuzzy scores, source-language eligibility, tag/genre self-exclusion, saved author/work membership, Tokyo-date windows, narration-shelf eligibility, popularity sorting, search-score re-ranking, counts, and finally 24-result pages. A naive `OFFSET/LIMIT` pushed into the `series` query would change the search/facet universe and may return partial or incorrect results, particularly above PostgREST's default 1000-row page. No new `read_language` semantics are authorized.

This Draft extracts the existing `matchesCurrentConditions` predicate into `src/lib/search/publicSearchConditions.ts` without altering Search's surrounding language, saved-list retrieval, popularity, sort, shelf, facet or pager behavior. The Child78 Search regression constructs a deterministic 1,257-work fixture with mixed languages, fuzzy Latin/CJK/Korean titles, tags/genres, saved-author/work filters, date windows and self-excluded tag/genre conditions. It independently compares inclusion identities and counts, tag/genre facet counts, and selected page windows. It deliberately verifies that the 53rd page remains reachable and the first 1000 rows cannot stand in for the entire corpus.

**Explicit limitation:** This is a testable Search condition contract and a safe preparatory refactor, **not DB-side filtering or pagination**. Future DB implementation must additionally match current popularity/date-specific score ordering, relevance tie handling, dynamic facet counts, source-language-specific result availability, narration shelves, saved filters, R18/ownership/publication visibility, and large-data load/cost under EXPLAIN. Do not trade correctness for speculative performance before those parity tests pass. No production DB migration, index, TTL change, route change, or direct browser fallback in this PR.

Cache invalidation remains a separate blocked gate: `WriteSeriesForm`, `WriteSeriesCreateForm` and `WriteEpisodeForm` persist public-affecting state directly through client Supabase mutations. Merely calling `revalidateTag` after a client write cannot atomically prove non-publication; a failed notification or already-started cached read can leave stale public content. Any future long-lived cache/mirror must first cover all author publish/edit/unpublish/delete operations through authoritative server-controlled publication and fail-closed invalidation/tombstone semantics, with explicit permission and R18 regression. Retain short existing TTL until that is proven.

## 19. Child84 Human-recording aggregate candidate filtering (Draft)

After Supabase recovery, a read-only Production count established 2,277 `recordings` rows, all with `is_public=true`; 2,180 have non-NULL `voice_model_id`, leaving **97 candidate rows across 24 series** where `is_public=true AND voice_model_id IS NULL`. The latter are *candidates*, not a verified Human narration inventory. The existing `isPublishedHumanRecording` predicate also requires a /human/ audio storage path and reader identity/name. Production schema proves `voice_model_id` is a UUID, so no empty-string compatibility case exists.

The prior `buildPublicRecordingAggregates` issued an unpaged `recordings` select, subject to the default 1,000-row API limit. This could silently omit eligible Human recordings if more than 1,000 rows were scanned, besides transferring many synthetic/TTS recording rows that are always disqualified by `isPublishedHumanRecording`. The Draft patch pushes only two **necessary** Human publication constraints into PostgREST (`is_public=true`, `voice_model_id IS NULL`) and retains the full Human storage/readers provenance check in application code. Both global and series-ID-filtered reads use stable `id` order and consecutive, inclusive 1,000-row ranges, with narrow-field select and existing schema compatibility fallback. Non-schema failures still raise rather than misclassify outages.

The existing 60s cache lifetime is unchanged; the key is versioned to invalidate any previously truncated cached result after a future approved deployment. No schema migration, data write, RLS relaxation, change to Human/TTS provenance, unpublished content exposure, owner authorization, search/facet behavior, or Reader mode change is included. Run Child84 CI, Preview and Production observation after explicit approval.

Further read-only Production breakdown on 2026-10-10: all 97 candidates have reader IDs and non-empty reader names, but **0 have storage paths containing the required `/human/` segment**. Consequently, **0 rows satisfy all current `isPublishedHumanRecording` conditions** in this verified snapshot; this is not evidence that the complete external/audio inventory is absent, only that no rows are eligible under the app's canonical provenance predicate. Do not relabel synthetic recordings as Human or rewrite provenance to inflate inventory.

Read-only `EXPLAIN (ANALYZE, BUFFERS)` comparison on warm Production data: broad `recordings ORDER BY id LIMIT 1000` returned 1,000 rows in ~4.4 ms database execution, whereas `is_public=true AND voice_model_id IS NULL ORDER BY id LIMIT 1000` returned 97 candidate rows in ~0.63 ms; this is not an application HTTP latency benchmark. The filtered candidate count is 97, but the Human narration inventory eligible for this feature is **0 in the verified snapshot**.

**Child84 healthy Production sampling (not caused by this pending PR):** the same authorized client performed 8 consecutive read-only GETs each for Home and Search on main `ae200c0237e54ea08d97d271980b46e016675cb5`; all 16 returned HTTP 200. Observed total-time sample median was Home 0.522 s (sample-interpolated p95 0.990 s, max 1.222 s), Search 0.807 s (sample-interpolated p95 0.984 s, max 1.008 s). Eight requests per route, one client/network and uncontrolled cache warmth are **not** a trustworthy longitudinal Production p95 or causal before/after speed gain. Within a separately checked Supabase Edge window, 341 requests had status 200 and none had 522/504; Vercel cache-revalidation error clusters still showed `AbortError` and `fetch failed` from the 2,500-ms bounded public read path. Root cause and sustained error rate remain unresolved. Current Supabase `pg_stat_statements` sample showed public-series narrow SELECT averaging ~2.1 ms over 103 calls, but this does not account for end-to-end gateway/network latency or prove timeout absence.

Independent off-site backup restore, current Compute tier direct metadata, complete publish/unpublish/delete cache invalidation, Search SQL pagination with full result/facet equality, and interactive Reader/translation/R18 E2E remain **open**. Child84 must not be marked DONE or used to unblock Child85 on the basis of this Draft PR.

## 23. Child84 owner-controlled series edit and immediate cache expiration (Draft)

**Verified baseline (2026-10-10):** `WriteSeriesForm.handleUpdate` performed browser-to-Supabase `series.update` directly. Production `public.series` has owner-only RLS UPDATE policies based on `author_id = auth.uid()` but neither the browser write nor `router.refresh()` invalidates the tagged `unstable_cache` public work-card snapshot. Existing series edits may include publish/unpublish and changes to title, summary, genres/tags, Human/AI translation permission, recording permission and effect settings. The independent DB schema audit shows the supported `description` column, not historical `summary/catch_copy` columns; the existing client retried multiple payloads for compatibility.

**Bounded Draft implementation:** The existing-series **edit** submit is moved to a `"use server"` Server Action using cookie-session Supabase `auth.getUser()` and explicit `.eq("author_id", auth.user.id)` alongside the existing RLS. Only allowlisted editable fields are accepted, with validated enums, bounded strings/arrays/effect JSON and no client-provided `author_id`, `source_language`, `content_rating` or other authority-bearing metadata. The server writes `description` using the confirmed DB schema and requires an actual updated row via `.select("id").maybeSingle()`; an unauthorized or non-existent work is not reported as success. The existing 60-second cached public-base-work-card loader is tagged `public-base-work-cards`. After a successful mutation, Next.js 16 `updateTag` is called inside the Server Action for immediate cache expiration, **not** `revalidateTag(..., "max")` which allows stale-while-revalidate. The client receives a distinct `persisted=true, cache_invalidation_failed` result if the database write succeeds but cache invalidation fails; the action will not retry an already committed mutation.

**Limits; DO NOT claim global completion:** A write and Next cache invalidation are not a distributed transaction, so a crash between the DB commit and `updateTag` can still leave a stale public card until the existing 60-second TTL. Author **creation** (`WriteSeriesForm.handleCreate`, `WriteSeriesCreateForm`), episode **create/update**, deletion, scheduler/background changes and other mutation call sites remain outside this new action. Other ongoing requests and third-party direct RLS-authorized DB writes may also race with cache expiration. This is a **partial author-edit workflow hardening**, not a complete server-controlled publication transition, tombstone system or hard immediate-unpublish guarantee. Reader/Work's authoritative visibility checks remain essential and must not be weakened. Do not extend public TTL, ship mirrors, or unblock Child85 based on this change.

**Tests / rollout:** A pure validator rejects invalid IDs, publication status, unknown fields, forged `author_id`, `source_language`, content-rating writes, over-limit bodies and invalid permission fields. Structural regressions ensure the browser edit path uses the Server Action, the create path remains unchanged, server ownership RLS is applied, and `updateTag` is paired with a tagged cache loader. CI, Preview, explicit approval and authenticated edit/unpublish/R18 Production validation are required. No Production DB/schema/data change is made by this Draft PR.

## 25. Child84 source-language and R18 owner-route cache expiry (stacked Draft after PR #101)

Two already-authenticated and owner-checked API routes directly mutate `series.source_language` and `series.content_rating/content_warnings`, outside `WriteSeriesForm`. The first is also used by the post-create pending-language bridge. Without an invalidation, cached source-language or general-rated cards could remain visible for their 60-second lifetime after an owner changes them.

This Draft adds `revalidateTag("public-base-work-cards", { expire: 0 })` **after successful DB writes** in both routes. Next.js 16 only supports `updateTag` inside Server Actions; Route Handlers can use the documented `revalidateTag` with immediate expiration (rather than the insecure `"max"` stale-while-revalidate path). Browser callers already invoke `router.refresh` on successful updates. If expiration throws, the route returns an explicit 503 `persisted=true` status rather than falsely claiming the DB write did not commit.

**Release dependency:** This code relies on the public-card tag introduced in PR #101; its PR base is that Draft branch. Both must be approved independently. This is another targeted metadata mutation closure, not a distributed DB/cache transaction or global publication-cache guarantee. Work creation/deletion, episode create/update until PR #102 approval, episode deletion, scheduled jobs, external direct Supabase writes, and crash gaps remain. No RLS, owner, R18 policy, allowed languages, cache TTL, schema or Production data change is included. A standalone test checks the auth/owner/update/expire sequence and no stale-while-revalidate use; authenticated Production behavior still requires review after merge.
