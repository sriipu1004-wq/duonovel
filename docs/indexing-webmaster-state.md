# LIB read indexing / webmaster state

Reviewed at: **2026-10-03**
Child: **Child83 — Indexing / Webmaster submission / stale-cache diagnostics**
Starting main: `7dde3a2354b52d08af14fb67dc1d915b21ef2c4f`
Production product-copy baseline: `57e06d82e14ac33808f3f90c7403234517ee2542`

This document records observable indexing/webmaster state without treating a stale search snapshot as current Production content. It does not store verification tokens, account IDs, DNS secrets, API keys, or other webmaster credentials.

## State model

Keep these states separate:

1. live LIB read Production HTML;
2. search-engine indexed copy / crawl snapshot;
3. rendered search snippet;
4. user-controlled external pages and their cached copies;
5. third-party historical pages.

A stale value in items 2–5 is not evidence that item 1 is stale.

## Live Production audit

Authenticated Vercel Production inspection on 2026-10-02 confirmed that current Production targets main `7dde3a2354b52d08af14fb67dc1d915b21ef2c4f` and is READY.

### Core URLs

| URL | HTTP | robots | canonical | hreflang | stale AI Story wording | retired `read_language` |
| --- | --- | --- | --- | --- | --- | --- |
| `/` | 200 | index, follow | self | ja / en / ko / x-default | none found | none found |
| `/en` | 200 | index, follow | self | ja / en / ko / x-default | none found | none found |
| `/ko` | 200 | index, follow | self | ja / en / ko / x-default | none found | none found |
| `/faq` | 200 | noindex, follow | self | ja / en / ko / x-default | none found | none found |
| `/guide` | 200 | noindex, follow | self | ja / en / ko / x-default | none found | none found |

FAQ/Guide noindex is intentional existing policy and was not changed.

### SEO landing pages

The audited Japanese, English, and Korean SEO landing pages return 200, declare the intended self canonical, remain index/follow, and contain no audited retired AI Story wording or `read_language` residue.

- `/english-novel-reader`
- `/web-novel-language-learning`
- `/pdf-bilingual-reader`
- `/en/japanese-novel-reader`
- `/ko/japanese-novel-reader`
- `/en/learn-japanese-with-web-novels`
- `/ko/learn-japanese-with-web-novels`
- `/en/pdf-epub-bilingual-reader`
- `/ko/pdf-epub-bilingual-reader`

The Japanese-only discovery pages intentionally do not invent hreflang alternates that do not have equivalent pages. EN/KO paired landing pages use the existing paired alternates. PDF-reader landing pages use JA/EN/KO/x-default.

## robots.txt

Production `/robots.txt` returns HTTP 200 and points to the Production sitemap.

Current policy:

- general public crawl allowed;
- `/api/`, `/auth/callback`, and locale variants of `/library` disallowed;
- no Child83-specific GPTBot / ClaudeBot / Google-Extended / CCBot rule was added.

Child83 must not alter this policy merely to obtain webmaster verification or refresh a cache.

## sitemap.xml

Production `/sitemap.xml` returns HTTP 200 as `application/xml`.

Observed on 2026-10-02:

- 10,227 `<loc>` entries;
- JA / EN / KO Home entries present;
- subscription and intended SEO landing entries present;
- public work / public episode entries present;
- localized work/episode alternates present;
- no audited `/library`, auth, login, signup, write, or saved private path was found in the URL set;
- no audited stale AI Story target wording or retired `read_language` residue was found in the XML.

No sitemap code change is currently justified by this audit.

## Google Search Console

### Property / ownership evidence

Existing Google Search Console ownership is confirmed from account notifications:

- a `syosetu-libread.com` **Domain property** had been verified by 2026-07-02;
- a `https://www.syosetu-libread.com/` owner was added by 2026-08-13;
- Search Console was collecting Google Search impressions by 2026-07-03;
- on 2026-07-18 Search Console reported excluded pages involving noindex, redirects, and duplicate/canonical selection, including a sitemap-related duplicate-canonical notice.

The July notices predate Child81/Child82 and are not treated as evidence of a current defect. FAQ/Guide noindex is intentional, and current canonical/hreflang state must be compared against current URL Inspection before code changes.

### Current authenticated Google state

GSC Wizard is connected to the verified Domain property `sc-domain:syosetu-libread.com` with full Search Console OAuth access.

The existing sitemap `https://www.syosetu-libread.com/sitemap.xml` was re-submitted successfully on 2026-10-03T08:44:11Z:

- attempted: 1
- submitted: 1
- failed: 0
- accepted / confirmed: true
- warnings: 0
- errors: 0
- current state immediately after submission: pending download
- previous last download: 2026-09-27
- submitted URLs reported by Search Console: 10,227

A pending sitemap submission means Google has queued another fetch; it does not guarantee indexing.

### Google URL Inspection / tracking

A GSC Wizard Indexing Tracker is active for 15 Child83 diagnostic URLs. Initial inspection completed with no inspection errors or warnings.

Current tracked-state snapshot on 2026-10-03:

- total tracked: 15
- Submitted and indexed: 4
- not indexed: 11
  - URL unknown to Google: 6
  - Discovered - currently not indexed: 5
- pending: 0
- tracker errors: 0
- tracker warnings: 0

The 4 URLs still reported as indexed are:

- current Home `/` — last crawl 2026-09-10, before the Child81 positioning update;
- retired `/generate` — Production returns HTTP 404, Google last crawl 2026-09-06;
- retired generated-work page `/works/af9f56ea-93b4-4e34-8779-89aa8758f3aa` — live page renders the not-found surface with noindex, Google last crawl 2026-08-14;
- retired generated-work Reader URL `/read/af9f56ea-93b4-4e34-8779-89aa8758f3aa/1` — live page renders the not-found surface with noindex, Google last crawl 2026-07-03.

The 11 not-indexed targets are the EN/KO Home pages and the audited JA/EN/KO SEO landing pages. Some are unknown to Google and some are discovered but not yet indexed.

The tracker remains active so later Google recrawls can be observed without manually repeating URL Inspection.

### Retired generated-work URLs and streamed not-found responses

A public search snapshot still exposes a deleted AI-generated Reader page. Live Production no longer exposes the old title/body and instead renders the not-found surface with `noindex`.

Those dynamic not-found responses can have HTTP 200 because Next.js App Router returns 200 for streamed not-found responses while communicating the not-found state through rendered content/metadata. Current live responses contain `robots=noindex`; Child83 therefore does not remove streaming/loading behavior solely to force a transport-level 404.

The actionable problem is the stale Google crawl date, not live AI Story content.

### Search performance snapshot

Last 28 settled days through 2026-09-29:

- clicks: 0
- impressions: 9
- average position: approximately 21.6
- Home: 7 impressions
- retired `/generate`: 2 impressions in the broad 28-day result
- retired generated-work Reader URL `/read/af9f56ea-93b4-4e34-8779-89aa8758f3aa/1`: 2 impressions
- retired generated-work page `/works/af9f56ea-93b4-4e34-8779-89aa8758f3aa`: 2 impressions
- a narrower 2026-09-26 through 2026-09-29 query returned no rows for `/generate`

This is consistent with old indexed residue decaying while Google has not yet completed a fresh crawl.

## Bing Webmaster Tools

GSC Wizard exposes Bing Webmaster data only when a Bing Webmaster API key/account is connected. Current connector state is `notConfigured`.

The user explicitly chose not to add/switch Microsoft accounts solely for Child83. Bing authenticated registration/inspection is therefore **deferred and non-blocking** for this workstream.

Preserved state:

- Production robots/sitemap remain valid for normal Bing crawling;
- no invented Bing verification file/meta was added;
- no Microsoft-account change was requested;
- no IndexNow key was created merely to compensate for the missing Bing account connection.

If Bing later becomes an acquisition priority or stale Bing results are observed, connect the real Bing Webmaster account then inspect its actual site/feed/index state before adding any verification artifact.

## IndexNow

Current repository and Production contain no identified IndexNow key file or submission integration.

**Child83 decision: do not add IndexNow code/key-file infrastructure yet.**

Reason:

- the observed problem is a small set of stale public descriptions after a positioning rewrite, not a high-frequency URL-change pipeline;
- Google and Naver require their own recrawl/indexing paths, so IndexNow does not solve the full Child83 problem;
- current robots and sitemap are healthy;
- Bing Webmaster URL Inspection / sitemap submission should be checked first;
- adding a permanent key-file/submission path before the actual Bing site state is known adds repository surface without evidence that it is needed.

Revisit IndexNow if Bing remains stale after normal Webmaster recrawl/submission, or if LIB read later needs continuous rapid notifications for frequent public URL additions/updates. Any later implementation must follow the official ownership-key protocol and normal branch/Preview/approval workflow.

## Naver Search Advisor

The Korean locale remains crawlable: `/ko` is live, index/follow, self-canonical, and present in the sitemap.

No Naver verification file/meta exists in the repository/live Home, and no authenticated Search Advisor session is available through the connected tools. A plugin search did not surface a direct Naver Search Advisor connector.

Authenticated Naver registration/ownership/sitemap state is therefore **deferred and non-blocking** for Child83 rather than fabricating a verification token or requiring a new user login solely to close the workstream.

If Korean acquisition later becomes a focused channel, Naver Search Advisor can be reopened as an account-side acquisition/indexing task.

## Index / cache findings

### Current LIB read URLs

Classification: **current Production is correct; at least one external crawl/index snapshot is stale**.

Observed stale Home snapshot:

- stale title: `時間指定AI短編を読む・聴く | LIB read`;
- retired AI-generated-story navigation/copy;
- crawl snapshot approximately two months old.

This does not match current Production.

### User-controlled external URLs

Child82 user-controlled Note/X content was updated on 2026-10-02.

At least one publicly surfaced Note snapshot of the 2026-09-03 language-learning article is still based on a roughly three-week-old crawl and contains the retired `AI生成物語` section. Classify this as **user-controlled page with stale crawler/index copy** until a fresh crawl reflects the Child82 edit.

X current profile/pin could not be independently read through the available public crawler; retain the Child82 user-verified update state and do not fabricate current crawl status.

### Third-party historical URLs

Examples observed:

- the Hano / Note article about 2026 novel-posting sites;
- eveningmoon.net novel-site directory.

These pages still contain historical LIB read descriptions such as AI Story/AI-novel wording. They are third-party source content, not merely a cached copy of current LIB read HTML. Child83 does not send deletion/removal requests or outreach for them.

## Deferred account-side webmaster work

No further user account action is required to complete the current Child83 implementation.

Deferred, non-blocking items:

- Bing Webmaster authenticated registration/inspection because the user does not want to add/switch Microsoft accounts for this task;
- Naver Search Advisor authenticated registration/inspection because no usable authenticated connector/session is available and no verification artifact should be invented;
- Google's UI-only per-URL “Request indexing” action, because the existing sitemap has been successfully re-submitted and all priority URLs are now under automated URL Inspection tracking.

These may be reopened later if actual search-engine evidence makes them necessary.

## Preserved product constraints

- AI novel/story generation remains retired.
- Reader modes remain Original / Bilingual / Translation only.
- AI/Human remain translation-source/provenance choices, not Reader modes.
- Human translation remains separate from OpenAI and AI allowance/credits.
- Search remains source-language filtering; retired `read_language` is not restored.
- Public Domain status still requires rights/provenance evidence.
- crawler policy is unchanged.
- OpenAI account-specific data-sharing / ZDR / MAM claims remain unverified.

## Completion status

Child83 implementation is **complete on the work branch; merge and Production verification remain gated by Preview approval**.

Completed:

- latest main and Production target re-verification;
- live JA/EN/KO SEO, canonical, hreflang, robots and sitemap audit;
- Google Search Console Domain-property authenticated inspection;
- full Search Console scope verification;
- sitemap re-submission;
- URL-level inspection of Home, EN/KO, SEO landing pages and retired AI Story URLs;
- active GSC Wizard Indexing Tracker for 15 diagnostic URLs;
- stale live-vs-index/cache classification;
- retired `/generate` and deleted generated-work stale-index tracking;
- confirmation that deleted generated-work live surfaces contain no old story content and are noindex;
- IndexNow no-adoption decision;
- Bing authenticated work explicitly deferred without adding/switching a Microsoft account;
- Naver authenticated work deferred without fabricating verification state;
- stale user-controlled Note cache and third-party historical-source inventory recheck.

No product behavior, database data, crawler-blocking policy, AI/Human translation semantics, Public Domain rights state, or pricing/quota behavior was changed.

Remaining external processing, not an implementation blocker:

- Google must download the re-submitted sitemap and recrawl the tracked URLs;
- stale search/crawler copies can persist until those crawlers refresh;
- third-party historical source pages remain third-party content.

Do not start P4 Acquisition inside Child83. After Preview approval, merge PR #83, verify Production, return the Child83 completion report, then P4 becomes the next roadmap workstream.
