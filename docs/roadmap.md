# LIB read — Ordered Roadmap

Last updated: **2026-09-26**
Product-state baseline: `ca216ac38f4e1150859ef3bc28b4ee60f1f2be58`

This file is the canonical ordered backlog for the next workstreams. It exists specifically so parent-chat replacement or context compression does not reorder the planned site work.

## Current priority order

### P0 — Project governance baseline

Status: **in progress on `chore/project-governance-baseline`**

Scope:

- canonical project state
- ordered roadmap
- decision log
- development workflow / child-chat rules
- ChatGPT Project instructions
- next-parent bootstrap/handoff

This is documentation/operations work only. It must not silently absorb the implementation scope of later children.

### P1 — Child81: public description / SEO / AI-search information alignment

Status: **next product work**

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

Status: **after Child81 Production completion**

Scope:

- public GitHub/repository description where appropriate
- Note or equivalent public introduction copy
- X profile / fixed post if the user wants to update them
- other external descriptions already under the user’s control
- replace stale AI Story / AI-generated-novel positioning
- reuse the canonical short/medium/technical descriptions produced by Child81
- do not invent traction, Human-translation inventory, narration inventory, or user counts

This child may require explicit user login/action for external accounts.

### P3 — Child83: indexing / webmaster submission

Status: **after Child82**

Scope:

- Google Search Console
- Bing Webmaster Tools
- IndexNow where appropriate
- Naver Search Advisor
- sitemap submission / verification
- indexing diagnostics
- coverage checks

Do not change crawler blocking policy just to complete submission.

### P4 — Acquisition

Status: **after public positioning + indexing**

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
