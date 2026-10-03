# LIB read — Ordered Roadmap

Last updated: **2026-10-03**
Product-state baseline: `57e06d82e14ac33808f3f90c7403234517ee2542`

This file is the canonical ordered backlog for the next workstreams. It exists specifically so parent-chat replacement or context compression does not reorder the planned site work.

## Current priority order

### P0 — Project governance baseline

Status: **complete**

Merged governance baseline: `45f1a2aa031d76625327a68551d59821f978786d`

Scope:

- canonical project state
- ordered roadmap
- decision log
- development workflow / child-chat rules
- ChatGPT Project instructions
- next-parent bootstrap/handoff

This is documentation/operations work only. It must not silently absorb the implementation scope of later children.

### P1 — Child81: public description / SEO / AI-search information alignment

Status: **complete**

Merged PR #80 as `57e06d82e14ac33808f3f90c7403234517ee2542`; Production deployment reached READY and post-deploy smoke verification passed on 2026-09-26.

Keep the previously agreed scope:

- align Home / FAQ / Guide / public product copy with current implementation
- remove stale AI Story positioning everywhere public
- describe AI translation and Human translation separately
- describe author AI/Human permission accurately
- explain long-form translation glossary / limited context without quality guarantees
- align Private Library / Public Domain wording
- align current pricing, allowance, credits, and library capacities
- JA / EN / KO parity
- metadata / OG / Twitter
- structured data
- canonical / hreflang
- sitemap / robots audit
- existing SEO LP audit
- README public description update if stale
- no new product feature
- no crawler-policy change
- no Search Console/Bing/Naver submission yet
- no external posting yet

Important current facts for Child81:

- AI novel/story generation is removed and persisted LIB read-generated AI works were purged.
- AI remains for translation / reading support.
- Human translation is implemented.
- published Human translations are currently 0; do not exaggerate availability.
- Human narration real-audio Production E2E remains unverified; do not overclaim it.
- rightsChecked Public Domain = 84; legacy rights-unverified Official = 36.
- OpenAI account-specific ZDR/MAM/data-sharing settings remain unverified.
- robots/crawler policy is currently unchanged.

### P2 — Child82: external information update

Status: **complete**

Completed 2026-10-02.

Scope completed:

- inventoried user-controlled and relevant third-party external descriptions
- updated GitHub repository description to the canonical multilingual web-novel positioning
- updated user-controlled Note profile/articles to remove active AI Story positioning and distinguish the current Reader/translation model
- updated X profile/pinned introduction through user action
- preserved AI Story retirement, Reader 3-mode model, AI/Human provenance separation, Public Domain rights rules, and verified-facts-only AI claims
- recorded stale search/crawler caches without treating them as current Production state
- did not perform webmaster/indexing submissions, crawler-policy changes, third-party outreach, or acquisition

Verification notes:

- GitHub repository description was independently verified through the authenticated connector on 2026-10-02.
- Note/X account edits are user-verified; available public crawlers may still return older cached copies.
- external cache/index refresh belongs to Child83.

See `docs/external-information-inventory.md`.

### P3 — Child83: indexing / webmaster submission

Status: **complete**

Completed scope:

- re-audited live Production metadata, canonical, hreflang, robots and sitemap;
- authenticated the existing Google Search Console Domain property;
- inspected Home, locale Home pages, SEO landing pages, retired `/generate`, and stale generated-work URLs;
- re-submitted the existing 10,227-URL sitemap successfully on 2026-10-03;
- created an active 15-URL GSC Wizard Indexing Tracker for continued recrawl/index-state observation;
- established that stale Home/AI Story search copies are older crawler/index state, not current Production;
- confirmed deleted generated-work URLs no longer expose retired story content live and are served with noindex not-found surfaces;
- rechecked stale user-controlled Note snapshots and third-party historical descriptions;
- kept crawler blocking policy unchanged;
- did not add IndexNow infrastructure without demonstrated need.

Explicitly deferred as non-blocking account-side work:

- Bing Webmaster authenticated setup/inspection, because the user chose not to add/switch Microsoft accounts solely for Child83;
- Naver Search Advisor authenticated setup/inspection, because no usable authenticated connector/session is available and no verification artifact should be fabricated;
- Google UI-only per-URL Request indexing, because sitemap re-submission succeeded and priority URLs are under automated inspection tracking.

External crawler refresh remains asynchronous and is not a code/merge blocker. Do not wait for every stale search copy to disappear before closing Child83.

See `docs/indexing-webmaster-state.md`.

### P4 — Acquisition

Status: **next**

Primary objective: real authors and readers, not more feature breadth.

Candidate channels:

- direct outreach to rights-owning indie authors / cross-posting authors
- language-learning and extensive-reading communities
- web-novel / multilingual-reading communities
- technical/indie-building articles
- third-party reviews
- micro-influencer experiments

Do not use AI Fund/job-search context here.

### P5 — Real usage observation and minimal analytics

Status: **after meaningful external traffic begins**

Build only the minimum analytics needed to answer actual product questions. Avoid pre-emptively building a broad dashboard.

## Release / claim gates that do NOT change the roadmap order

These are checks to complete before making the corresponding public claim or scaling acquisition.

### Human translation E2E gate

Current status: **unverified with a real Production user flow**

Before Human translation becomes a major acquisition claim, perform one controlled real-user flow on an appropriate work:

draft -> save -> re-edit -> publish -> Reader Human selection -> withdraw

Prefer a rightsChecked Public Domain work or another explicitly permitted test target. Avoid leaving test UGC published.

### Human narration E2E gate

Current status: **genuine real-audio Production E2E unverified**

Do not delay Child81/82/83 solely for this unless Human narration is promoted as a primary claim. If it remains secondary, describe conservatively and verify before actively marketing it.

### OpenAI account-setting gate

Current status: **data sharing / ZDR / MAM account-specific settings unverified**

This does not block Child81 if copy stays within verified policy facts. If the user later checks the account settings, update `docs/ai-data-flow.md` and public privacy wording if necessary.

### Legacy Official rights gate

Current status: **36 legacy Official works remain unverified**

Do not bulk-approve, bulk-open Human/AI translation permissions, or label them all Public Domain. Handle individually only when provenance is sufficient.

## Priority-change protocol

The ordered roadmap may change only when one of the following happens:

1. the user explicitly reprioritizes;
2. a Production/security/legal/data-loss bug creates a higher-priority incident;
3. a dependency makes the next item impossible.

When the order changes:

- update this file in the same child/workstream;
- record the reason in `docs/decisions.md` if it is a durable product decision;
- preserve displaced items rather than silently deleting them;
- state the new order in the parent completion report.

Do not infer a new priority merely because an older chat suggested an alternative.
