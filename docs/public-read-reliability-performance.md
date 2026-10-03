# LIB read — Public read / Search reliability & performance plan

Reviewed: **2026-10-03**
Status: **planned / priority inserted before Acquisition**
Baseline main at review: `1428b1449e47c52cd54dc4c318c6ee3c180801a0`
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

### 4.1 Public work base-card rebuild reads all public episode metadata

`src/lib/publicWorks.ts` currently:

1. fetches all public `series` rows in pages;
2. fetches episode metadata for all public series IDs;
3. groups/sorts all returned episode rows in Node;
4. derives card values such as:
   - episode count;
   - first episode number;
   - latest posted date;
   - public episode-number list.

The card layer does not need all episode rows merely to derive summary fields.

Target direction:

- use DB-side aggregation / summary query / safe view / RPC where justified;
- return only the fields needed by cards;
- preserve exact public visibility and >1000-row correctness.

### 4.2 Author N+1 through Auth Admin

Public base-card construction currently calls `auth.admin.getUserById(authorId)` per distinct author.

Target direction:

- prefer an existing public-safe/profile/user data source that can be fetched in one bounded `IN (...)` query where current schema/visibility rules permit;
- preserve Official detection semantics;
- do not expose email or privileged Auth metadata.

### 4.3 source_language legacy fallback still exists and is not yet removable

The runtime can fetch the first episode body for works with no canonical `series.source_language` and infer language from source text.

Important constraint:

`20260912153000_add_series_source_language.sql` explicitly says existing rows intentionally remained NULL and must continue through the fallback resolver.

Therefore:

- do **not** remove this fallback merely because `source_language` is now canonical for new/current data;
- first obtain an exact Production count of missing `source_language`, including public works;
- if non-zero, determine a rights-safe/correct backfill source rather than guessing;
- only remove the body-based fallback after the canonical data gate is proven complete.

The count could not be re-verified during this review because direct Production SQL attempts timed out.

### 4.4 Home recordings are coupled to the main work-card promise

Home `loadHomeWorkCards()` waits for:

- public base work cards;
- public recording aggregates for those works.

A recordings failure can therefore block the Home work sections.

Target direction:

- public Home shell first;
- core public works independently;
- narration/recording popularity as optional/lazy/fallback-capable data;
- recording failure must not collapse unrelated Home content.

### 4.5 Home blocks the public shell on Auth/viewer state

`PublicTopPageLegacy` starts work-card and viewer-state promises concurrently but then awaits `loadHomeViewerState()` before returning the public page tree.

`loadHomeViewerState()` performs:

- Auth `getUser()`;
- subscriber lookup when signed in;
- bookmark lookup when signed in.

Target direction:

- public Hero / public navigation / core public content must not require Auth success;
- viewer-specific state may stream/lazy-load separately;
- Auth failure should degrade the viewer-specific UI, not the public site.

### 4.6 Work detail metadata and page body duplicate major reads

`/works/[seriesId]`:

- `generateMetadata()` reads the series and episode metadata;
- the page body independently reads the series and episode metadata again.

Target direction:

- request-scoped memoized/shared loader where compatible with Next.js behavior;
- preserve SEO metadata and canonical/hreflang correctness.

### 4.7 Work detail fetches all episodes then slices 50 in Node

The UI exposes 50-episode ranges, but the data path fetches all episode metadata and later calls `episodes.slice(..., 50)`.

Target direction:

- DB count for total visible episodes;
- DB range query for the visible 50;
- fetch only additional minimum data required for first-episode/redirect/reader behavior;
- preserve ordering and public visibility rules.

### 4.8 Related works depend on the all-public-work base-card dataset

`RelatedWorksSection` calls `getCachedPublicBaseWorkCards()` and filters all public works to produce:

- up to 4 other works by the same author;
- up to 4 similar works.

Target direction:

- targeted bounded queries, or isolate as below-the-fold optional data;
- do not remove the UI without an explicit user decision.

### 4.9 Search pagination is UI pagination over a broad in-memory dataset

Current Search starts from `getCachedPublicBaseWorkCards()`, then performs a significant portion of filtering/faceting/sorting before pagination.

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

### 4.13 OpenGraph crawler load should be measured

`/opengraph-image` is expected to receive crawler traffic.

Target direction:

- measure request volume/cost;
- verify whether current ImageResponse path is adequately cached;
- static asset or stronger caching may be considered only if SEO/social rendering remains correct.

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
- then local fallback/retry UI rather than an indefinite spinner.

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
