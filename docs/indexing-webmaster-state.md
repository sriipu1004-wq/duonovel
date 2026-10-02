# LIB read indexing / webmaster state

Reviewed at: **2026-10-02**
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

### Current authenticated inspection state

Direct authenticated Search Console URL Inspection / Sitemaps-report data was not available through the currently connected first-party tools in this Child83 session.

A ChatGPT GSC connector capable of property listing and URL Inspection is available but requires explicit user connection before it can be used. Until that is connected, the following remain unverified for the current 2026-10-02 state:

- current Sitemaps-report submission/fetch status;
- Google index status and last crawl for Home JA/EN/KO and selected SEO landing pages;
- Google-selected canonical for those URLs;
- whether a request-indexing action has already been sent after Child81/82.

### Recrawl target

The publicly surfaced web snapshot for the LIB read Home can still return a roughly two-month-old copy with the retired title `時間指定AI短編を読む・聴く | LIB read` and AI Story-generation copy, while authenticated Vercel inspection returns the current multilingual-reading HTML. This is classified as **stale indexed/crawler copy, not stale Production**.

Once authenticated URL Inspection is available, inspect and request indexing for at least:

- `https://www.syosetu-libread.com/`
- `https://www.syosetu-libread.com/en`
- `https://www.syosetu-libread.com/ko`
- the selected SEO landing pages that still show stale index data, if any.

Use the sitemap for broad discovery rather than attempting to request thousands of individual URLs.

## Bing Webmaster Tools

No Bing verification file/meta artifact was found in the current repository or live Home HTML. Connected account mail did not provide evidence of a Bing Webmaster registration, but absence of such mail is not proof that no site exists in another account or verification mode.

Current authenticated Bing state therefore remains **unverified**:

- ownership/site registration;
- sitemap submission/fetch status;
- URL Inspection;
- crawl/index coverage;
- stale Home title/description;
- request-indexing state.

Before changing code, use the existing valid robots/sitemap and inspect the actual Bing site entry. If the site is not present, prefer normal Bing Webmaster registration/import and ownership verification based on the real account state rather than inventing a verification token.

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

The Korean locale makes Naver relevant. Current live robots/sitemap are compatible with normal crawling and `/ko` is index/follow with a self canonical.

No Naver verification file/meta artifact was found in the current repository or live Home HTML. Connected account mail did not establish a Search Advisor registration. This does not prove the site is absent from another Naver account.

Current authenticated Naver state remains **unverified**:

- site registration;
- ownership verification;
- sitemap registration/recognition state;
- crawl/index status;
- stale Home/KO snippet state.

Search Advisor account login/ownership state must be checked before adding any verification artifact.

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

## Required user/account gates before Child83 completion

1. Connect authenticated Google Search Console access in ChatGPT (GSC Wizard is an available option) or otherwise provide a usable authenticated browser session, then inspect the current property/Sitemaps/URL Inspection state and send needed request-indexing actions.
2. Open/authenticate Bing Webmaster Tools for the actual account and inspect/register/submit as needed.
3. Open/authenticate Naver Search Advisor for the actual account and inspect/register/submit as needed.
4. Do not perform DNS ownership changes, destructive removals, or account-permission changes without explicit user approval.

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

Child83 is **in progress**, not complete.

Completed in this audit:

- latest main and Production target verification;
- live Production SEO/robots/sitemap audit;
- stale-vs-live cache classification;
- existing Google Search Console ownership evidence;
- IndexNow current-state check and no-adoption decision;
- Bing/Naver pre-auth verification-artifact audit.

Blocked on authenticated webmaster account access:

- current Google URL Inspection/Sitemaps status and recrawl request;
- Bing site state / sitemap / URL Inspection / recrawl;
- Naver site state / sitemap / crawl/index inspection.

Do not advance the roadmap to P4 Acquisition until these Child83 account-side checks are completed or explicitly waived by the user.
