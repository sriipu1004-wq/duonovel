# LIB read — Project State

Last updated: **2026-10-04**
Last product-changing main commit: `57e06d82e14ac33808f3f90c7403234517ee2542`
Production: https://www.syosetu-libread.com
Repository: `sriipu1004-wq/duonovel`

This document is the compact canonical state for future parent/child chats. It should describe the current product, not the full history. Historical rationale belongs in `docs/decisions.md`.

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


Child84 implementation is in progress on a bounded no-schema PR1. As of 2026-10-04, the branch has:

- separated Home Hero/static content from Auth, bookmark/subscriber, recording-popularity, and public-work failures;
- added bounded timeout/retry only around safe read-only operations and local unavailable states for optional data;
- batched public author display-name lookup through public.users instead of Auth Admin N+1 calls;
- removed the stale Official-account translation-permission override so closed remains closed;
- changed Work detail from all-episode detail fetch + Node slice to minimal navigation metadata, DB count, and a 50-row detail range;
- shared the Work series read between metadata/page through request memoization;
- isolated Work recording, reader-like, related-work, and subscriber reads;
- bounded Search public-data/Auth/saved-filter/popularity reads without changing Child78 fuzzy/facet/page semantics;
- narrowed public series/episode queries with the canonical publication filters;
- hardened public Reader reads while retaining private-owner and R18 fail-closed behavior;
- moved the public Ranking page out of build-time static Supabase reads and onto bounded runtime reads that reuse the canonical public-work/recording helpers;
- moved sitemap dynamic work loading out of deploy-time static generation and added a bounded runtime fallback so a Supabase 522 cannot stall the build or turn the sitemap into a 500;
- added explicit Work/Reader core-read unavailable states so series/episode timeouts no longer escape as the generic streamed page error;
- stopped retrying local read timeouts because the underlying Promise is not aborted; immediate upstream 522/503/network failures remain eligible for the bounded read-only retry.

The upstream incident is still reproducible on 2026-10-04. Both connected SQL verification and a direct public PostgREST read hit connection timeout / Cloudflare 522. Production curl probes with a 20 s cap showed Home timing out after partial HTTP 200 streaming on 3/3 runs, the sampled Work detail timing out after partial HTTP 200 streaming on 3/3 runs, and Search timing out on 1/3 runs while the other two completed in about 0.48–0.67 s. This supports an intermittent streaming-tail/optional-dependency problem rather than a uniform render failure.

Confirmed current technical debt includes:

- all-public episode metadata used to build public work cards;
- per-author Auth Admin lookup;
- Home recording aggregates coupled to main work-card loading;
- work-detail metadata/page duplicate data fetches;
- all-episode fetch followed by 50-item Node slicing;
- related works depending on the all-public-work dataset;
- broad Search in-memory filter/sort/pagination;
- raw popularity event reads despite an existing `series_popularity_daily` aggregate table;
- hot-path `select("*")` compatibility fallbacks.

The `source_language` runtime fallback must remain until Production proves canonical coverage complete; its original migration intentionally permitted legacy NULL rows.

Scale order is now:

Child84 reliability/performance -> Child85 30–60 verified Public Domain works -> Child86 Production scale gate -> Acquisition -> minimal real-usage analytics.

See `docs/public-read-reliability-performance.md`.

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
