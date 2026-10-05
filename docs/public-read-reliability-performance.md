# LIB read — Public read / Search reliability & performance plan

Reviewed: **2026-10-05**
Status: **PR1 merged / Production verified; DB-dependent remainder blocked by live Supabase connectivity**
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

Final PR2 head `c4b7e9f204d9e6bd17dc744eebdbb8588137c281` passed the full GitHub verification workflow, including existing Reader/security/translation regressions, TypeScript, changed-scope ESLint, Production build and whitespace check. Vercel Preview `dpl_DvJNFRdHSm9fsQDUUV7RCKuKHgkh` reached READY. A sampled Preview Reader during the still-active Supabase timeout condition returned HTTP 200 and the dedicated temporary-unavailable surface rather than a generic page error.

No DB/schema/data write is part of PR2. It does not change Reader modes, R18/ownership/publication checks, translation entitlement, credits/subscription, Public Domain rules, or the DB-verification gates that still block Child85.

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

New order:

1. Child84 — Public read / Search reliability & performance hardening;
2. Child85 — staged Public Domain expansion (30–60 verified works);
3. Child86 — post-expansion Production scale verification;
4. Child87 — Acquisition;
5. Child88 — Real usage observation / minimal analytics.

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
