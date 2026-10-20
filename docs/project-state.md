# LIB read — Project State

Last updated: **2026-10-21**
Last product-changing main commit: `fa86529be99f167df9e673724adb4be6f8189ebf` (Child84i PR #123: temporary fail-closed self-service account deletion suspension and truthful Privacy/Terms)
Production: https://www.syosetu-libread.com
Repository: `sriipu1004-wq/duonovel`

This document is the compact canonical state for future parent/child chats. It should describe the current product, not the full history. Historical rationale belongs in `docs/decisions.md`.

> **CURRENT PARENT ENTRYPOINT:** [PROJECT_MASTER.md](../PROJECT_MASTER.md) (CONTROL-R1) is the fixed, independently recoverable parent overview, current specialist S1–S4 assignments and open-PR register. [docs/chat-operations.md](chat-operations.md) specifies long-lived roles. Always independently verify GitHub main/Production because the last-reviewed SHA may become stale. Older Child84 NOT DONE and Child85 BLOCKED notes below are explicitly historical; [Child84 operational closure](child84-operational-closure.md) and the roadmap P5 NEXT status take precedence for workstream state. Missing signed-in E2E/Storage restoration/timer-cause/Search SQL parity tests remain unverified.

## Current operational status — 2026-10-21

Child84 is operationally CLOSED with user-accepted deferrals, not fully verified. Child85 is NEXT for staged rights/provenance-verified Public Domain expansion; do not bulk-ingest or waive rights evidence. Source: docs/child84-operational-closure.md. Main 208c09beb1c28d6c71d4a5c101827c05ac4f8151 and matching Production READY were confirmed before this documentation workstream. Earlier Child84 NOT DONE / Child85 BLOCKED entries below are historical snapshots, superseded only as workflow status, not as evidence of completed tests.

## Historical Child84 P4 acceptance snapshot — 2026-10-11

- Verified GitHub `main` after merging PR #123: `fa86529be99f167df9e673724adb4be6f8189ebf`. Vercel Production deployment `dpl_BKpqovPvodbLBYvmHSZzKTUjvLBd` for this exact SHA is **READY**. Read-only live GET verification: `/`, `/privacy`, `/terms`, `/contact` all HTTP 200 with corrected public copy; `/api/account/delete` GET returned 405. Anonymous/authenticated POST must not use a real person's deletion; 401/409/503 are tested by synthetic mock, not real-session E2E.
- Merged #124: current late-callback Production evidence; JavaScript's 2,500ms timeout timer sometimes fires tens of seconds late, while abort settlement is fast. Root cause remains **unverified**; no deadline/TTL/region/unsafe public fallback change.
- Merged #121: Search exact-semantics audit **NO SQL CUTOVER**, reconciled with already shipped #122 bookmarked-works fix. Existing full JS candidate/ranking/facets/pagination remain canonical; do not implement DB LIMIT/OFFSET without a genuinely independent full-parity result and performance benefit.
- Merged PR #123: server-side `POST /api/account/delete` no longer performs the previous Auth soft deletion, billing cancellation, data/Storage write or cache mutation. Signed-in requests return 409 `ACCOUNT_DELETION_REVIEW_REQUIRED`; absent session 401; Auth dependency failures 503; all CI mock cases passed. Account Settings replaces one-click delete with reviewed `/contact` requests, and retains distinct `/subscription` billing management. Privacy §15 and Terms §13 explicitly disclose the interim suspension and historic incomplete soft deletion. The real published contact mailbox was connected, the original harmless test email was found in its INBOX, and a reply from it was confirmed in the sender's INBOX. A restricted intake label exists. This is **NOT** an automated deletion, complete erasure, approved B/C/A permanence, or genuine signed-in deletion E2E. Operations must verify each request's identity/rights and never report completion without evidence.
- Attempting an emergency Vercel Firewall deny rule for only the legacy account-delete POST was stopped by an external safety check; **no Firewall configuration change was applied**. Do not claim the endpoint is blocked.
- Read-only Production DB snapshot: 123 works (120 public, 3 private), 0 public R18, 0 currently unpublished episodes, 0 publicly authored works tied to deleted/missing Auth users, 6 historic Auth soft-deletions. These aggregates do **not** establish erasure of private data or future deletion correctness.
- Read-only, exact-source Production RLS test under PostgreSQL `anon` and a deliberately **nonexistent** `authenticated` identity passed: 120 public series, 3,284 posted/published episodes, and 2,277 publicly eligible recording metadata rows matched the privileged eligibility baselines. Zero nonpublic series/episodes, zero other-user bookmarks or Private Library rows were exposed to the synthetic stranger. The Human translation table and Private Library progress table intentionally deny direct SELECT to both roles; Human translation uses checked server-only API. Test source: `scripts/child84-readonly-role-boundary-audit.sql`; evidence: `docs/public-read-reliability-performance.md` §47. Real signed-in author/Reader/R18/Human translation E2E remains **NOT VERIFIED**. No Production DDL/DML or account was created.
- Draft #108 scheduled-episode Cron stays **unmerged/uninstalled**. The short-lived isolated Supabase branch test passed, but its replay lacked baseline `series`, and there is **no verified independent DB and ~30 GB Storage restoration** or authorized full-schema/authenticated Reader/author/R18 E2E. No Publication Cron activation is justified.
- Overall: **Child84 NOT DONE; Child85 BLOCKED**. The unsafe self-service Auth soft-delete endpoint is now gated in Production, but the separate long-term identity/erasure/retention/rights policy, real signed-in author/Reader/R18/Human translation E2E, independently restored DB+~30 GB Storage object bytes, safe Cron release and time-correlated timeout investigation remain unaccepted. Keep 60-second catalog TTL, publication/R18/ownership controls, Reader three modes, source/target/UI locale separation, and AI/Human provenance. Roadmap priority unchanged.


## Product definition

LIB read is a multilingual web-novel posting and reading platform. A work is posted in its source language and can be read through the same work/Reader surface in:

- Original
- Bilingual
- Translation only

Translation source is separate from Reader mode:

- AI translation
- Human translation, when a published Human translation exists

Private Library is a separate personal-reading feature for user-owned/imported books.

Core slogan: **読む、聴く、学ぶ。**

## Non-negotiable product boundaries

- AI novel/story generation has been removed from the active product and must not be reintroduced accidentally.
- AI is currently used for reading/translation support, principally AI translation and word explanation.
- AI translation and Human translation are separate provenance and separate permissions.
- Human narration and synthetic TTS are separate concepts.
- UI locale, work source language, and target reading language are separate concepts.
- Security, ownership, publication visibility, R18 gates, and permission checks must not be bypassed for UX or performance.

## AI translation

Author setting: AI translation permission.

Posting, publishing, or merely leaving AI translation permission open does not itself send the work to OpenAI.

A provider call occurs when a reader requests a missing AI translation and server-side access/permission/entitlement checks pass.

Current public translation contract:

- provider path: OpenAI Responses API
- audited requests use `store:false`
- source batches: max 3,000 source chars / 60 segments
- translation segment version: 3
- Reader marker max: 80 chars
- punctuation-only translated segments are valid
- limited previous published-episode context; do not send the whole series
- work-level glossary / target-language consistency data may be included
- `translation_permission_mode=closed` blocks new AI translation and new AI word-explanation provider calls
- closed rejection must not consume allowance, credit, or create an unlock

OpenAI published API policy was last audited 2026-09-25: API data is not used for training by default; standard abuse-monitoring logs may retain content for up to 30 days. LIB read account-specific data-sharing / ZDR / MAM settings remain unverified and must not be claimed otherwise.

See `docs/ai-data-flow.md`.

## Human translation

Implemented in Child80.

- separate Human translation permission: `series.human_translation_permission_mode`
- separate Human translation storage: `episode_human_translations`
- workflow: draft -> edit -> publish -> withdraw
- one active translator/episode/target-language record by unique constraint
- multiple translators may publish separate translations
- public identity uses display name / author attribution, never email fallback
- Human translation uses canonical source segmentation and source-hash stale protection
- Human translation does not call OpenAI
- Human translation does not consume AI allowance, credits, or AI unlocks
- Human translation is free to read
- Reader keeps the same three modes; translation-source selector appears only when published Human translations exist
- published Human translations in Production at this snapshot: **0**
- real-user Production E2E (draft -> publish -> Reader -> withdraw) is still unverified

Permission baseline after Child80:

- rightsChecked Public Domain works: Human translation open
- existing general works: Human translation closed unless explicitly changed by author
- legacy rights-unverified Official works: Human translation closed
- new works: AI translation open, Human translation open, narration open by default

## Reader

Canonical modes:

- Original
- Bilingual
- Translation only

Canonical position/bookmark anchor is source-side and must survive mode and AI/Human source switching.

Child75 translation segmentation and Child68 Reader position behavior are canonical.

## Pricing / quota

### Free

- ¥0
- shared daily allowance: public AI translation unlock + My Library import = **3 uses/day total**
- My Library capacity: **3 works**

### Premium

- ¥680/month
- public AI translation unlock: **30/day**
- My Library import: no daily count
- My Library capacity: **20 works**

### Credits

- 5 credits = ¥300
- 8 credits = ¥450
- 12 credits = ¥600
- valid 150 days
- 1 credit unlocks one public episode × one target language for AI translation
- Original does not need an unlock
- Bilingual and Translation only share the same entitlement
- same episode + target re-read is free
- Human translation never consumes credits

AI Story quota is retired and must not return.

## Public Domain / Official

Current snapshot:

- Official total: **120 works**
- current rightsChecked Public Domain: **84**
  - JA 4
  - EN 40
  - KO 40
- legacy / rights-unverified Official: **36**
- site-wide public source-language counts at the latest verified Search snapshot:
  - JA 43
  - EN 40
  - KO 40

Do not equate all Official works with rightsChecked Public Domain works.

Public Domain approval requires tracked provenance and rights review. “Official” alone is never a rights basis.

Child75 Public Domain translation constraints:

- target episode size: 8,000 chars
- hard max: 10,000 chars
- lossless repartition only
- rights-unverified legacy works must not be bulk-opened or bulk-repartitioned

## Search

Child78 is canonical.

- source-language multi-select only; do not restore `read_language`
- filter changes do not auto-scroll to results
- dynamic self-excluding facet counts
- lightweight normalized/fuzzy title/author matching
- no AI semantic/vector search
- 24 results/page
- URL page state
- localized “Back to filters”
- Search cards do not show views/likes/bookmarks/narration-play/popularity metrics
- PostgREST >1000-row correctness must be preserved

## Performance

Child76 is canonical.

- prioritize above-the-fold content
- use progressive loading / Suspense for secondary sections
- avoid fetching all episode bodies when current episode + metadata is sufficient
- preserve >1000-row pagination correctness
- do not trade security/permission correctness for streaming
- do not load all Human translation payloads on initial Reader load

## Human narration / TTS

- Human narration = actual user-recorded/uploaded human voice
- Aivis / VOICEVOX / browser speech are not Human narration
- work-page top-level Human narration creation CTA was removed in Child77
- Human narration feature itself remains
- genuine real-audio Production E2E remains unverified
- do not market Human narration as abundant or fully verified

## AI Story removal

Removed from active product:

- `/generate`
- AI short-story generation
- AI continuation
- generated-story Reader/runtime
- generated-story translation runtime
- AI Story pricing/quota
- persisted LIB read-generated AI works
- AI-generated runtime special cases

Historical audit/migration records may remain for accountability. Active product behavior must not depend on them.

## External public positioning

Child82 aligned the user-controlled external descriptions of LIB read with the current product definition.

- GitHub repository description now identifies LIB read as a multilingual web-novel posting and reading platform and was independently verified through the authenticated GitHub connector on 2026-10-02.
- User-controlled Note profile/articles were updated by the user to remove active AI Story positioning and to point readers to the current Reader/translation model.
- X profile/pinned introduction were updated by the user; the available public-Web path could not independently fetch the current profile/pin.
- Search/crawler caches may still expose retired AI Story wording from older crawls. That is an indexing/cache issue, not current Production state, and belongs to Child83.
- Third-party historical descriptions were inventoried but were not modified or contacted in Child82.

See `docs/external-information-inventory.md`.

## Indexing / webmaster state

Child83 is complete. PR #83 was merged as `29cd37ca0feb667f53fc6a69d61c86f2d3490e80`; the corresponding Production deployment reached READY and post-merge Production smoke verification passed on 2026-10-03.

Current state:

- current Production JA/EN/KO Home HTML is aligned with Child81 and contains no audited retired AI Story wording or retired `read_language`;
- Production `robots.txt` and `sitemap.xml` are healthy; crawler blocking policy is unchanged;
- Google Search Console Domain property is connected with full Search Console access;
- the existing 10,227-URL sitemap was successfully re-submitted on 2026-10-03 with zero immediate warnings/errors and is pending Google re-download;
- 15 priority URLs are now tracked through GSC Wizard URL Inspection;
- current tracker snapshot: 4 indexed / 11 not indexed / 0 pending / 0 errors;
- Home remains indexed from a 2026-09-10 crawl, before Child81, explaining stale Home copy;
- retired `/generate` remains indexed from a 2026-09-06 crawl while live Production returns 404;
- two deleted generated-work URLs remain indexed from July/August crawls, while live Production now renders noindex not-found surfaces with no retired story body/title;
- user-controlled Note search snapshots can still expose pre-Child82 AI Story wording; this is stale crawler state, not current Note/Production state;
- third-party historical descriptions remain third-party source content;
- Bing Webmaster authenticated work is deferred because the user does not want to add/switch Microsoft accounts solely for this task;
- Naver Search Advisor authenticated work is deferred because no authenticated connector/session is available and no verification token should be invented;
- IndexNow remains intentionally unconfigured; the current issue is stale crawl state rather than a need for permanent rapid-submission infrastructure.

See `docs/indexing-webmaster-state.md`.

## Production reliability / scale gate

A 2026-10-03 Production incident exposed an upstream-dependency resilience problem and confirmed several public-read/Search performance bottlenecks.

Verified infrastructure state at review:

- Vercel Production Functions run in `iad1` (US East);
- Supabase project is in `ap-southeast-1` (Singapore);
- Vercel runtime logs include Supabase-origin Cloudflare 522 timeouts plus series/episodes/recordings failures;
- Supabase's official status page reported an unresolved eastern-US intermittent-latency incident affecting eastern-US servers/serverless clients regardless of project region;
- direct read-only Supabase SQL verification attempts also timed out during the review.

This does not prove every timeout is application-caused. The immediate incident is strongly consistent with the upstream/network path. The application issue is that optional failures can still broaden into whole-page failure.

Canonical resilience direction:

- public Hero/core content must not depend on Auth success;
- optional bookmark/subscription/recording/recommendation/popularity failure must degrade locally;
- safe read-only retries, if used, must be bounded and limited to transient network failures;
- mutation/credit/unlock/payment/publish operations must not receive blind retries;
- performance work must preserve security/R18/ownership/publication/permission/entitlement correctness.


Child84 bounded no-schema PR1 was merged as PR #85 on 2026-10-05 and is live in Production at main `f9f94512047d12f295937bd258880ace276ed0be`. It:

- separated Home Hero/static content from Auth, bookmark/subscriber, recording-popularity, and public-work failures;
- added bounded timeout/retry only around safe read-only operations and local unavailable states for optional data;
- batched public author display-name lookup through public.users instead of Auth Admin N+1 calls;
- removed the stale Official-account translation-permission override so closed remains closed;
- changed Work detail from all-episode detail fetch + Node slice to minimal public-only navigation metadata and a 50-row detail range; range count is derived from navigation rows so the redundant exact-count query is gone;
- shared the Work series read between metadata/page through request memoization;
- isolated Work recording, reader-like, related-work, and subscriber reads;
- bounded Search public-data/Auth/saved-filter/popularity reads without changing Child78 fuzzy/facet/page semantics;
- narrowed public series/episode queries with the canonical publication filters;
- hardened public Reader reads while retaining private-owner and R18 fail-closed behavior;
- moved the public Ranking page out of build-time static Supabase reads and onto bounded runtime reads that reuse the canonical public-work/recording helpers;
- moved sitemap dynamic work loading out of deploy-time static generation and added a bounded runtime fallback so a Supabase 522 cannot stall the build or turn the sitemap into a 500;
- added explicit Work/Reader core-read unavailable states so series/episode timeouts no longer escape as the generic streamed page error;
- made Work content-rating/R18 verification independently fail closed: an unavailable safety read blocks Work children instead of allowing content through, and the R18 viewer-preference read is bounded;
- stopped retrying local read deadlines and now supplies AbortSignal cancellation to supported Supabase reads so timed-out HTTP work does not continue behind the local fallback; immediate terminated 522/503/network failures remain eligible for the bounded read-only retry.

The upstream incident is still reproducible on 2026-10-04. Both connected SQL verification and a direct public PostgREST read hit connection timeout / Cloudflare 522. Production curl probes with a 20 s cap showed Home timing out after partial HTTP 200 streaming on 3/3 runs, the sampled Work detail timing out after partial HTTP 200 streaming on 3/3 runs, and Search timing out on 1/3 runs while the other two completed in about 0.48–0.67 s. This supports an intermittent streaming-tail/optional-dependency problem rather than a uniform render failure.

Latest PR1 code Preview `b28277dea391249223fed92e5b6264bab7d80e00` is READY. During the continuing upstream outage, Home, Search, sampled Work detail, and sampled Reader all returned HTTP 200 without a generic application-error surface. The final measured Preview samples were approximately 2.869 s for Home, 2.970 s for Search, 5.693 s for the sampled Work page, and 3.277 s for the sampled Reader. The same Work URL on current Production main took approximately 39.488 s in the comparison sample. PR1 now aborts supported underlying Supabase HTTP reads rather than merely timing out the await, and network/timeout failures no longer trigger broad `select("*")` compatibility fallbacks.

The global client Auth header is also bounded at 2.5 s so the original indefinite “認証確認中...” symptom cannot persist on an Auth/network stall; normal anonymous `AuthSessionMissingError` is treated as healthy signed-out state.

Preview `eb55c0348f2f8a885346c12c9c82112c67701c78` additionally verified the Work safety boundary during the ongoing outage: content-rating verification timed out after 2.2 s, the page-level series read timed out after 2.5 s, HTTP 200 returned the dedicated content-safety unavailable surface, and the work content was not rendered.

Post-merge Production verification on 2026-10-05 confirmed deployment `dpl_fEhzkzw6FiQhwacjhn7f488aAGYJ` READY and aliased to `www.syosetu-libread.com`. During the same continuing upstream failure, sampled Production requests all returned HTTP 200 without the generic page-error surface: Home 3.777 s, Search 2.880 s, Work 3.519 s, Reader 2.830 s, and Sitemap 2.902 s total from the authorized validation host. Work/Reader/Sitemap used their bounded unavailable/fallback paths as expected. The pre-PR1 sampled Work response had taken about 39.488 s under the incident, so the long-hang failure mode is materially reduced.

Connected Supabase SQL still fails even for `select 1` with `Connection terminated due to connection timeout`. Child84 therefore remains open only for DB-dependent verification/optimization that cannot be safely inferred: exact `source_language` coverage, `series_popularity_daily` invariants/cutover, DB-side public-work/Search summary work, and EXPLAIN/advisor-driven indexes.

Child84 PR2 was merged as PR #88 on 2026-10-06 at main `63f340168da1725f9c147a8dba05ecc88898b532`. It removes another all-episode Reader hot path: Reader navigation now performs only bounded previous/next one-row queries instead of loading the work's full episode-navigation list, and the Reader payload is request-memoized so metadata/page/layout share the same loader result. Independent review confirmed that the public posting/publication filters, private-owner boundary, R18 fail-closed behavior, Reader three-mode model, AI/Human translation provenance and permission separation, and credit/subscription entitlement boundaries are preserved. PR #88 also added a dedicated Child84 pull-request workflow so the reliability regression runs directly. Production deployment `dpl_ApuftG7vGmithHbv38hSKpvYytqV` reached READY and was aliased to `www.syosetu-libread.com`. Production Home, Work, and JA/EN/KO sampled Reader routes returned HTTP 200 without a generic page-error surface; Work/Reader correctly used their bounded temporary-unavailable surfaces while the Supabase outage continued. Healthy-upstream previous/next click-through remains unverified because the current upstream still cannot serve the core Reader data. A fresh connected SQL probe (`select now(), 1`) still failed with `Connection terminated due to connection timeout`, so DB-dependent Child84 work remains blocked and no DB/schema/data change was attempted.

Child84b then audited a second failure path for the core public Reader. A minimal anonymous browser-direct Supabase prototype was built only on a branch and validated in Preview. Its publication/R18 contract was intentionally narrow: public series only, posted + published episode source only, metadata-first R18 rejection before any body read, and no translation/entitlement/narration/bookmark/mutation paths.

The prototype did **not** establish a useful independent failure domain. Preview `dpl_EbXjLSTs5FKbBGgRXNMLQPCa66A9` at SHA `45496159a4598c04f70e05d84e599a4e8969eb91` was READY and all five PR workflows passed. In a real browser, the server-side Reader timeout correctly activated the local fallback; the Supabase REST CORS preflight reached the public gateway with HTTP 200, but the actual series GET did not complete. A separate direct public Data API GET from the authorized validation machine also timed out after 15 s with 0 response bytes / HTTP 000. This shows that removing Vercel from the path does not bypass the current failing Supabase read data plane. The browser fallback code was therefore withdrawn before merge; Child84b completes with **no Production fallback adoption**.

Repository RLS hardening supports the intended public-only row contract, but live Production policy/grant verification is still blocked by the same SQL timeout. RLS also does not replace the application R18 viewer-preference gate, so any future direct path must continue to reject R18 before episode/body retrieval when viewer preference cannot be verified.

Supabase Read Replica was reviewed but not adopted. Project-specific compute/backup eligibility and cost remain unverified, and asynchronous replica lag can return stale publication state after unpublish/delete, which conflicts with the fail-closed visibility requirement. A truly independent public mirror/cache remains blocked until publish/edit/unpublish/delete have a complete server-controlled invalidation/tombstone boundary.

A stacked Singapore-region Preview (PR #86, Function region `sin1`) reproduced the same Home/Search/Ranking/Sitemap/Work timeouts, so moving Vercel Functions from `iad1` to Singapore is not a supported incident fix. PR #86 was closed unmerged. Cache invalidation audit also confirmed there is no complete tag/path invalidation boundary: primary series/episode writes still occur directly from Client Components to Supabase. Public cache TTLs therefore remain short and unchanged.

Confirmed current technical debt after PR1 includes:

- all public episode rows are still read to build the global public-work-card dataset, although PR1 narrows each row to id/series_id/episode_number/posted_at;
- Work detail still reads the full minimal episode-navigation row set even though detailed episode data is limited to the selected 50-row range;
- related works still depends on the all-public-work dataset, although failure is now locally bounded;
- broad Search filtering, fuzzy matching, facets, sorting, and pagination still operate over the in-memory public-work dataset;
- raw popularity event rows are still read despite an existing `series_popularity_daily` aggregate table;
- hot-path `select("*")` compatibility fallbacks remain where schema compatibility has not been proven removable;
- public cache invalidation is not centralized because canonical series/episode edits still include direct Client-to-Supabase writes.

The `source_language` runtime fallback must remain until Production proves canonical coverage complete; its original migration intentionally permitted legacy NULL rows.

Scale order is now:

Child84 DB-dependent remainder after Supabase recovery -> Child85 30–60 verified Public Domain works -> Child86 Production scale gate -> Acquisition -> minimal real-usage analytics.

Child84b is complete and does not insert a new Production fallback into this order.

See `docs/public-read-reliability-performance.md`.

## 2026-10-10 Supabase recovery / Child84 resumed audit

Supabase Support ticket SU-500983 confirmed that the Production project became unhealthy around 2026-10-02 13:10 UTC, with memory overcommitment, elevated disk I/O wait, and possible OOM. Support restarted the project; connected Production `select now(), 1` succeeded on 2026-10-10. At incident time the project was on paid-plan **Nano**; Support recommended Nano -> Micro. The user subsequently reported performing the account-side change and the PostgreSQL restart timestamp advanced on 2026-10-10, but this connector does not expose the current Compute tier. Micro is **reported, not independently plan-verified**.

Post-restart read-only Production SQL verified 123 series, 120 public series (40 JA/40 EN/40 KO), 3 private series with NULL source_language and 0 public NULL. The database size is approximately 77 MB. The existing `series_popularity_daily` has 294 buckets, of which 50 refer to non-existent series; 48 of those contain 74 retained view counts absent from the raw events. At that initial read-only audit stage no aggregate cutover, cleanup, schema/data write, or index change was made. Subsequently, PR #92 changed the *read path* after verifying 244 active-series buckets with 0 metric mismatches. No popularity data cleanup was performed; orphan aggregate lifecycle remains pending.

Post-recovery `public.users` REST reads exposed a Work-detail optional author query selecting obsolete `username, pen_name, name` columns not present in Production. Work author query fix merged as **PR #91** and deployed READY on 2026-10-10 together with **PR #92** daily popularity read cutover. Separate Reader author metadata legacy-column 400 was fixed by explicitly approved **PR #93**, merged on 2026-10-10 and Production READY. After the user approved **PR #94**, the RLS-invoker public-episode summary view and select-only privilege hardening migrations were applied; PR #94 merged as `398eb396796f2485f37dc5880d33281fdaf4ac08` and Production `dpl_5kruXnw1gihDmRgpikL5XrttKnV4` reached READY.

Independent database backup availability / download is not yet verified. Do not assume recovery automatically implies a validated off-site backup. Child84 DB-dependent remainder is now **unblocked** and read-only audits have resumed; PR #91/#92 merged and Production READY. Child84 is not DONE, and Child85 remains gated.

### 2026-10-10 Child84 Human narration read cutover and timeout diagnosis

Explicitly approved PR #97 merged at `5812deca12fd1549a03329124d30b37cfbde7dc2`; Vercel Production deployment `dpl_GzmY9kjL3UhEKUfawru6259Bffgw` reached READY. It restricts public Human-recording aggregate candidate queries to `is_public=true AND voice_model_id IS NULL` and introduces stable ordered 1,000-row paging with the canonical Human-storage/readers provenance check retained. No DB/data/schema change. SQL verification: 2,277 recording rows, 97 candidates (not Human inventory), 0 satisfying current `/human/` storage-path provenance. No synthetic/TTS record was relabeled.

Draft PR #98 is diagnosis only: it records allowlisted endpoint classes for locally expired 2,500-ms public DB reads, without URL, IDs, query, token, payload or duration policy changes. Vercel cache-revalidation AbortErrors remain observable; no proven root cause or permanent fix. Child84 is NOT DONE; Child85 is blocked. Off-site backup restore, controlled publish/unpublish cache invalidation, SQL Search pagination equivalence and authenticated Reader/R18/Human E2E remain pending.

### 2026-10-10 Child84 healthy-upstream smoke gate

Following approved PR #94, Production Home/Search/Work/Reader anonymous HTTP GET samples all returned 200 from the authorized validation device: Home TTFB 1.14 s / total 2.62 s; Search TTFB 0.83 s / total 2.26 s; Work total 3.62 s; Reader first episode total 4.34 s. Supabase Edge logs independently recorded HTTP 200 for `/rest/v1/public_episode_work_summaries` (the new Data API path), confirming the summary view is used in Production, not merely a migration-missing fallback. The view's SQL-invoker setting, anon role visibility (120 public series / 3,284 posted+published episodes), and SELECT-only anon/authenticated privileges were directly verified. Base data remained 123 series / 3,284 episodes.

Unfinished: independent off-site backup/restore verification; Compute tier must be checked in Dashboard; interactive Reader prev/next and AI/Human translation E2E; healthy-upstream longitudinal error/latency and p95 measurement; Search DB pagination with existing fuzzy/facet/popularity semantics; complete author edit/publish/unpublish/delete cache invalidation. **Child84 not DONE; Child85 remains blocked.**

## Current unresolved verification items

These are not automatic priority changes; they are release/claim gates:

1. Human translation real-user Production E2E has not yet been performed.
2. Human narration genuine-audio Production E2E has not yet been performed.
3. OpenAI account-specific data-sharing / ZDR / MAM settings are unverified.
4. 36 legacy Official works remain rights/provenance-unverified and must not be bulk-approved.

## Current roadmap

The current ordered roadmap lives in `docs/roadmap.md`. Do not reconstruct priority from old chat history when that file is available.

## Operating rule

For implementation work, read this file, `docs/roadmap.md`, `docs/decisions.md`, and the relevant feature-specific audit/doc before coding. Verify the current Git main/Production state rather than trusting an old chat SHA.

### 2026-10-11 approved Child84 diagnostic shipment
PR #98 was merged at main `927b79964cfe8761d5a9b91a6b09ab5ccdca6194` after user approval and its Vercel Production deployment `dpl_HnU5fHhjSeB3d7MNVDSdCUDXMkVj` reached READY. Anonymous Home/Search/Work/Reader HTTP smoke returned 200/200/200/200. Public fetch 2,500ms deadline and all permission boundaries unchanged. PR #99 source-language-only catalog candidate remains an independently reviewed release with all public 120 works populated, no data rewrite. Child84 NOT DONE; Child85 BLOCKED.

### 2026-10-11 Child84 PR #101 reconciliation
PR #101 was reconciled against approved Production PR #98/#99, retaining the canonical public catalog v12 cache key while registering its `public-base-work-cards` expiry tag. Only owner-authorized existing-series workspace edit and rights metadata preservation are targeted; DB commit and cache expiry remain non-atomic. PR #101 authenticated E2E/Preview required. Child84 NOT DONE; Child85 BLOCKED.

## 2026-10-11 Child84 author write integration candidate (Draft PR)
Main `ab3615aa0818e89426d9636f98f6fc0c7720f6f6` has Production READY after #98 diagnostic, #99 canonical catalog and #101 owner series save. The following combined branch carries existing #102 episode writes, #103 source-language/R18 route cache expiry, #104 atomic work create, and #107 AI permission cache expiry. This is not a scheduler/backup recovery, logged-in author E2E, Search SQL cutover, or full deletion/tombstone proof. All existing 120 public + 3 private series and rights evidence must be protected. Child84 NOT DONE; Child85 BLOCKED.

## 2026-10-11 Child84 approved author-write/cache hardening — Production READY checkpoint

Current canonical main: `10764dec384942c2140d858180cb1b994edf80e3`. Vercel Production `dpl_3rV3mGVSFmwfJNQPN9gPJL4Vf8VG` was verified READY and aliased to `www.syosetu-libread.com`. GitHub PR #98 merged as `927b79964cfe8761d5a9b91a6b09ab5ccdca6194`; #99 as `640e3cd8bd5010cd43c0107861df9956661c3682`; #101 as `ab3615aa0818e89426d9636f98f6fc0c7720f6f6`; consolidated #109 as `10764dec384942c2140d858180cb1b994edf80e3`. Each stage reached READY; final #109 anonymous Home/Search/Work/Reader GETs all returned HTTP 200 (not logged-in E2E).

Shipped: public DB local deadline diagnostics (unchanged 2500ms), public-catalog-only canonical source language and deletion of legacy first-episode-body guesses, registered `public-base-work-cards` tag with existing 60s TTL, owner-RLS Server Actions for existing-series edits, episode create/edit and atomic new-work creation, immediate cache expiration for source language / R18 and AI permission author routes, and safe partial-commit UX; AI and Human translation still have independent provenance and permissions. Existing Public Domain rights in `effect_settings.publicDomain` are preserved in author-workspace edit actions.

Post-deploy read-only SQL counts: 123 series (120 public, 3 private), 3284 posted/published episodes, 0 draft/scheduled, 0 public series with missing source language, 0 posted-vs-published mismatch, 84 series retaining `effect_settings.publicDomain` provenance, 0 public R18 in current snapshot. This is a count audit, not a signed-in author mutation E2E.

Closed **unmerged as superseded by shipped #109**: #102, #103, #104, #105 (integration-only), #107. Closed unmerged as no-go: #100 live probe, #106 region-only candidate. Retain Draft #108 scheduled-episode Cron candidate **unmerged/unapplied**; its numbering-gap correction is documented and passed a 19-row *read-only SQL fixture*, but cannot be considered an installed Cron job. Production `pg_cron` remains uninstalled. Existing remote Windows host lacks `pg_dump`, `psql`, Supabase CLI and Docker; no independently verified off-site dump/restore and no Supabase development branch exists. Do not create a paid branch or activate Cron without cost/environment confirmation, isolated exercise, backup/restore evidence, and auditable deployment decision.

Remaining Child84: authenticated author save/create/edit/unpublish and Reader AI/Human/R18 E2E; deletion/account-tombstone and out-of-band direct DB mutation consistency; Search DB pagination/result/facet/ranking exact parity (may defer cutover when 120 works render safely); longitudinal 2500ms timeout diagnostics and independent Production performance baselines; validated independent DB backup restore and scheduled publication end-to-end. **Child84 NOT DONE; Child85 BLOCKED.** These items do not reorder the canonical roadmap.

### 2026-10-11 Child84 DB and Storage independent recovery audit (Draft PR)
Supabase organization plan was independently verified as Pro. Project-specific automated backup files or restore points remain unverified; Pro plan entitlement cannot substitute for restore evidence. Production read-only SQL counted 4,728 Storage objects totaling 30,189,639,005 bytes, dominated by 4,720 recording-audio objects (30,165,700,212 bytes). All 2,277 recorded audio URL paths matched actual objects, but 2,443 other recording-audio objects (2,012,797,682 bytes) are **not directly referenced from public.recordings.audio_storage_path**; they are not established as unused and must not be purged. Supabase normal DB backups exclude Storage object bytes. A source-only read-only audit and two-track DB/Storage restore plan now live in `docs/child84-backup-and-storage-recovery.md` (Draft only). No backup archive, paid project, production mutation or media export occurred. Child84 NOT DONE; Child85 BLOCKED.

### 2026-10-11 Child84 owner scheduling UI public admission alignment (Draft)
Author-side `isEpisodePubliclyVisible` previously exposed a `読む` link for a scheduled row after its due time even though public RLS/Reader require `posted AND is_published=true`. The pending change aligns owner read links/counts with the public admission condition while retaining a separate author-only `予約時刻経過・公開待ち` overdue badge. It does not activate an automatic scheduler, DB migration or change R18/owner/translation permissions. Draft #108 remains unmerged. Child84 NOT DONE / Child85 BLOCKED.

### 2026-10-11 Child84 isolated Supabase Cron execution PASS — Production activation NO-GO
Draft #108 migration was applied successfully on an **ephemeral Supabase development branch** after the branch's existing migration replay failed independently (`public.series` baseline missing). A synthetic due episode published via real `pg_cron 1.6.4` with successful `cron.job_run_details` and one count-checked RLS-restricted audit row; draft/future rows were preserved. Cron was unscheduled, branch deleted and deletion verified. Production 123 series, zero scheduled episodes and zero pg_cron remained unchanged. The quoted branch rate was 0.01344/hour, not a verified charge. See `docs/child84-cron-isolated-supabase-evidence.md` for exact limitations. Independent DB+Storage restore, complete baseline migrations, signed-in/R18/Reader E2E and timeout error-rate monitoring are not accepted. Child84 NOT DONE; Child85 BLOCKED.

### 2026-10-11 Child84 Search SQL eligibility parity preflight (Draft)
Production read-only comparison of public/posted/source-language series to the canonical security-invoker summary view yielded 120 vs 120, zero missing/extra, ja/en/ko 40 each. A 1,803-row synthetic fixture in `scripts/test-child84-search-sql-candidate-contract.ts` protects broad SQL candidate parity, no premature LIMIT, fuzzy/date/saved/language self-excluded facets and pagination. `docs/child84-search-sql-eligible-parity.md` records the non-adoption decision: this is NOT DB-side Search pagination or full ranking/facet/performance acceptance. No Production mutations. Child84 NOT DONE, Child85 BLOCKED.

### 2026-10-11 Child84 optional Work AI translation badge fetch prefilter (Draft)
Read-only Production confirmed 120 works, 3,284 published episodes, max 261 episodes/work and **12 ready `episode_translations` rows** total. Existing optional Work translation badges query all full episode bodies before discovering most works have no cached translation. Draft adds a head-only join query for ready translations by published episode/series. Only exact zero-count with no error skips the body-heavy overview; nonzero/error/unknown falls back to unchanged public+permission+hash+R18 checks. Standalone translation-version page, Reader, AI credits and all Human translations remain unchanged. Expected read volume reduction is unmeasured; do not claim p95 success. Child84 NOT DONE / Child85 BLOCKED.

**2026-10-11 Work optional streaming gate supplement:** Work Layout renders `WorkTranslationAvailability` inside `<Suspense fallback={null}>` after the existing public series surface/R18 fail-closed gate, so an optional AI translation badge lookup cannot hold the main Work children pending its body fetch. Same permission/translation-page behavior; authenticated/R18 live E2E and latency measurement still needed.

### 2026-10-11 Child84 public DB timeout phase split (Draft candidate)
Vercel Production runtime logs show repeated `[public-db-local-timeout]` events for the public series and episode-summary endpoints, including some requests where reported elapsed wall time exceeded the nominal 2,500ms local timeout by tens of seconds. The timing alone cannot establish whether the timer callback ran late (event-loop/scheduling delay) or the aborted fetch promise settled late (post-abort delay). Draft instrumentation records only two **numeric** phase durations (`deadlineTimerDelayMs` and `abortSettlementDelayMs`) alongside the existing allowlisted endpoint/timeout/elapsed fields. It does not log URL, request ID, row ID, keys, bodies or personal data, and does not alter the 2,500ms abort, retries, cache TTL, R18, auth or data permissions. No live p95 result or root cause is claimed. Child84 remains NOT DONE; Child85 BLOCKED.

### 2026-10-11 Child84 localized Work metadata all-catalog outage fallback (Draft)
Localized `/en/works/[seriesId]` and `/ko/works/[seriesId]` metadata generation previously awaited global cached public-work cards without catching revalidation failures. Unlike the canonical Work body, an intermittent `series` / `public_episode_work_summaries` AbortError could escape through metadata and fail a localized page even if its individual work remains available. Proposed fail-closed metadata-only catch returns a generic `LIB read` title and `robots: noindex,nofollow` on uncertainty, without exposing any cached title, summary, author, private or R18 work. Successful catalog reads and all existing locale-specific SEO metadata remain unchanged. The canonical Work page and R18/publication gates are not altered. A static contract and build verify this boundary; SEO consequences of transient noindex should be monitored. Child84 NOT DONE; Child85 BLOCKED.

### 2026-10-11 Child84 actual Production timer-phase evidence after PR #116
Production READY main `26c42367c50bfb4ac0c73781dfa29eb67c2069b4` includes merged #116 phase-only timeout diagnostics and #117 localized Work metadata fail-closed handling. A new Vercel runtime warning for allowlisted `series` reported configured 2,500ms deadline, 83,379ms elapsed, **80,876ms timer callback delay**, 3ms post-abort settlement: this single severe event is predominantly late timer dispatch, not prolonged fetch rejection after abort. Supabase `pg_stat_statements` cumulative statistics showed 1,817 related series calls weighted 0.79ms mean/max13.26ms and 198 episode summary calls 26.30ms mean/max106.24ms; those DB metrics are not request-time-matched and cannot exclude outliers. Root scheduler cause and actual Vercel Fluid Compute setting unverified. Evidence and release gates: `docs/child84-public-db-timeout-phase-evidence.md`. No Production SQL/Storage writes. Child84 NOT DONE / Child85 BLOCKED.

### 2026-10-11 Child84 account Auth soft-delete cache-expiry boundary (Draft)
A read-only Production audit found zero series owned by a soft-deleted Auth account and zero retained public.users profiles of a soft-deleted account. Account deletion currently first cancels subscription billing, then calls the Supabase Admin API with `shouldSoftDelete=true`; it does **not** independently unpublish or purge author works, and the rights/retention policy is not yet resolved. This bounded Draft adds immediate Next.js public-card tag expiry *only after* confirmed Auth soft deletion, with a truthfully successful deletion response even when cache expiry fails. It does not invent a content tombstone or change ownership/R18/Human translation behavior. Real signed-in deletion E2E and policy/retention verification remain open; no real accounts or Production DB rows were deleted. Child84 NOT DONE; Child85 BLOCKED.
