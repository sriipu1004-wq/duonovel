# LIB read — Ordered Roadmap

Last updated: **2026-10-06**
Product-state baseline: `63f340168da1725f9c147a8dba05ecc88898b532`

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

### P4 — Child84: Public read / Search reliability & performance hardening

Status: **in progress — connected DB recovered; read-only DB verification resumed; Child84b completed with no fallback adoption**

Priority was inserted on 2026-10-03 after a real Production availability incident exposed broad coupling to Supabase/network failures.

Primary objectives:

- public pages degrade partially rather than failing globally when optional data/auth/recording/recommendation reads fail;
- remove confirmed overfetch, N+1, duplicated reads, raw popularity-event aggregation, and all-corpus dependencies;
- preserve UI behavior, Search correctness, security, R18, ownership, publication visibility, translation entitlement, credit/subscription rules, and private/public isolation;
- validate Vercel-region and DB-index hypotheses before Production changes.

Ordered phases:

1. Production resilience / fault isolation;
2. obvious overfetch and duplicate reads;
3. list/Search/ranking foundation;
4. cache/infrastructure;
5. before/after Production measurement.

PR #85 merged to main on 2026-10-05 and Production verification passed for the bounded no-schema portions of phases 1–2 plus safe Home/Work/Reader/Search/Ranking/sitemap timeout isolation. Supported public Supabase reads abort underlying HTTP work at the deadline, network failures no longer trigger broad compatibility fallbacks, the global Auth header spinner is bounded, Work/Reader distinguish true not-found from transient upstream failure, Work content-rating/R18 verification fails closed, and Ranking/sitemap dynamic work discovery no longer perform deploy-time Supabase reads. Child84 is not complete because DB-dependent phases remain verification-gated.

2026-10-10 recovery update: Supabase Support restarted the previously unhealthy Nano project; connected `select now(), 1` now succeeds. Post-recovery DB audit is active. source_language coverage is verified for all 120 public series (no NULL); 3 private series retain NULL. The Work author metadata fix (PR #91) and bounded daily popularity read cutover (PR #92) were explicitly approved, merged and deployed READY; the remaining Reader author-column 400 fix was merged via PR #93 after explicit approval and Production reached READY. DB-side public episode metadata summary view plus least-privilege hardening were applied by two auditable migrations and PR #94 was approved/merged; Production `dpl_5kruXnw1gihDmRgpikL5XrttKnV4` is READY and a public Data API summary-view HTTP 200 was observed. Daily popularity rows include 50 buckets for non-existent series, 48 with 74 orphaned views; aggregate **read cutover** was completed in PR #92 after 0 mismatches on existing series, but orphan data cleanup remains blocked until lifecycle semantics/tombstones are verified. Nano -> Micro upgrade and independent backup verification remain account-side operations. Child84 is not DONE; Child85 remains blocked.

Still gated by live Supabase/Production DB verification:

- exact `source_language` coverage before legacy inference removal;
- `series_popularity_daily` freshness/invariants before runtime cutover;
- DB-side public-work summary / Search pagination that preserves fuzzy/facet semantics;
- a complete invalidation boundary before any longer public metadata TTL;
- EXPLAIN/advisor-driven index changes;
- final before/after Production measurement.

Vercel Asia-region Preview comparison is complete: a `sin1` stacked Preview reproduced the same bounded Supabase timeouts as `iad1`, so region relocation is rejected as the current incident fix.

Post-merge Production on main `f9f94512047d12f295937bd258880ace276ed0be` is READY. During the continuing upstream outage, sampled Home/Search/Work/Reader/Sitemap requests all completed with HTTP 200 in approximately 2.8–3.8 s and no generic page-error surface. Connected Supabase SQL still cannot complete even `select 1`, so the remaining DB-side work must not be guessed. Child84b has now completed its dependency-unblocked audit with a no-adoption result. Child85 remains blocked until the Child84 DB verification gates can be completed after Supabase recovery.

Child84 PR2 was merged as PR #88 on 2026-10-06 at main `63f340168da1725f9c147a8dba05ecc88898b532`. It replaces Reader all-episode navigation loading with bounded previous/next one-row reads and request-memoizes the Reader payload shared by metadata/page/layout. Independent review and final CI preserved publication, owner/private, R18, Reader-mode, translation provenance/permission, and entitlement semantics. Production deployment `dpl_ApuftG7vGmithHbv38hSKpvYytqV` reached READY; sampled Home/Work and JA/EN/KO Reader requests returned HTTP 200 without a generic page-error surface. A fresh connected SQL probe still ended in `Connection terminated due to connection timeout`, so PR2 does not unblock the remaining DB-verification gates or Child85.

See `docs/public-read-reliability-performance.md`.

#### Child84b — Public Reader failure-domain diversification

Status: **complete — option B; browser-direct fallback not adopted**

Purpose:

- reduce the single failure path from Vercel server execution to Supabase for the core public Reader only;
- audit whether an anonymous browser -> Supabase Data API path can safely recover public source text after a clearly classified transient server-side upstream failure;
- preserve canonical publication/R18/ownership/translation/credit boundaries even if availability does not improve.

Initial scope is intentionally narrow:

- public series core metadata;
- current public episode source;
- previous / next public episode;
- read-only anon/public Data API only.

Explicitly excluded from the first fallback:

- private/owner-only reads;
- draft/scheduled/unpublished episodes;
- R18 episode body when viewer preference cannot be safely verified;
- Search/Home/related/popularity;
- AI or Human translation;
- translation entitlement/unlock/credits;
- narration;
- bookmarks/reactions;
- any mutation.

Fallback may start only after a transient server-side upstream failure such as a bounded timeout, 522/503, connection reset/termination, or fetch/network failure. A successful not-found result, permission denial, malformed ID, or other non-transient failure must not be reinterpreted as an outage.

The dependency order is:

1. Child84 DB-dependent remainder stays blocked while the connected Production SQL path cannot complete a minimal probe;
2. Child84b completed during that block with no fallback adoption;
3. after Supabase recovery, return to the Child84 DB-dependent remainder;
4. only after Child84 verification completes may Child85 start.

Browser-direct fallback was **not adopted** after Preview failure simulation. The prototype correctly entered only after the bounded server-side Reader failure and stayed on a dedicated degraded surface, but the end-user browser's direct Supabase REST read did not complete. The browser reached the Supabase/Cloudflare gateway and received a successful CORS preflight, while the actual public Data API GET remained unanswered; an independent 15 s direct GET from the authorized validation machine also ended with 0 response bytes / HTTP 000. This demonstrates that the current incident is not isolated to the Vercel -> Supabase hop and that browser-direct access does not provide the required independent read failure domain.

The prototype application changes were therefore withdrawn before merge. Child84b leaves no extra browser Supabase client or Reader fallback in the product.

Reconsider browser-direct only if a future incident proves all of the following:

- the server-side Reader path fails transiently while the same public Data API GET succeeds reliably from representative end-user networks;
- live Production RLS/grants can be verified, not only inferred from repository migrations;
- the R18 viewer-preference boundary remains fail-closed before any body read;
- measured recovery benefit exceeds the extra client surface and added timeout latency.

Read Replica also remains unadopted as an outage fallback. Besides unverified project-specific compute/backup prerequisites and added cost, asynchronous replication can expose stale publication state; that conflicts with the requirement that deleted/unpublished content must not be served stale. A genuinely independent public mirror/cache should not be reconsidered until publish/edit/unpublish/delete have a complete server-controlled invalidation/tombstone boundary.

**2026-10-10 Child84 post-recovery verification checkpoint (no priority change):** healthy-upstream Home/Search/Work/Reader sampled HTTP GETs returned 200, and new summary-view requests were observed in Production. Search DB-side pagination remains **in progress / not shipped**: today's 120-public-series in-memory path also drives fuzzy ranking, current-condition facet counts, popularity-score sort and cross-tab shelves, so a naïve DB `LIMIT/OFFSET` would silently truncate valid results and corrupt counts. Preserve all Child78/80 language/permission/search behaviors and implement only after an exact-results-and-facets parity harness. Author client-side series/episode mutations still lack complete server-side cache invalidation/tombstones, so do not increase public TTL or adopt read replicas/mirrors. Off-site backup/restore verification and interactive Reader smoke remain open; do not mark Child84 DONE or start Child85 until required gates are satisfied.

**2026-10-10 Child84 author edit mutation boundary (Draft; backlog order unchanged):** implemented a candidate owner-authenticated Server Action for *existing-series edits only*, with explicit RLS owner filter, constrained editable fields and Next.js 16 immediate `updateTag` expiration of the 60-second public base-card cache. Author creation, episode mutation, deletion, scheduler and other direct-client paths remain outside this bounded candidate; DB commit and cache expiration are not atomic. This improves one mutation path only and must not be characterized as a complete publication/tombstone system or used to unblock Child85 without the remaining gates. Await CI, Preview, user approval, then Production authenticated edit/unpublish verification.

### P5 — Child85: staged Public Domain expansion

Status: **after Child84 Production verification**

Add a controlled batch of approximately **30–60 rights/provenance-verified Public Domain works** using the existing canonical ingestion rules.

Do not:

- bulk-approve the 36 legacy rights-unverified Official works;
- fabricate source/edition/translator/hash data;
- expand into hundreds of works before the post-expansion performance gate.

### P6 — Child86: post-expansion Production scale verification

Status: **after Child85**

Measure Home / Search / Work detail / Reader after the 30–60-work batch.

Validate:

- error/timeout rate;
- request/query shape;
- TTFB/server duration where available;
- result correctness;
- Search >1000-row behavior;
- cache/revalidation behavior.

Only if this gate passes should further staged Public Domain growth proceed.

### P7 — Acquisition

Status: **after Child86 scale gate**

Primary objective: real authors and readers, not more feature breadth.

Candidate channels:

- direct outreach to rights-owning indie authors / cross-posting authors
- language-learning and extensive-reading communities
- web-novel / multilingual-reading communities
- technical/indie-building articles
- third-party reviews
- micro-influencer experiments

Acquisition was displaced by the Production reliability incident; it was not canceled.

Do not use AI Fund/job-search context here.

### P8 — Real usage observation and minimal analytics

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

**Child84 author-create Server Action candidate (Draft, no priority change):** stacked on #101, both author creation forms route new series through owner-RLS Server Action and immediate public-card tag expiration. Existing source-language pending bridge, external client writers and delete/scheduled transitions remain separate, non-atomic boundaries. CI / Preview / explicit user approval and authenticated Production verification required. Child85 remains blocked.

**Child84 PR #104 safety gate (Draft; priority unchanged):** create-time original language + R18/violence warnings + publication visibility are validated and inserted in one owner-authenticated DB write. Old post-navigation writes are no longer used for new submissions. Delete, external direct DB writers, non-atomic cache refresh and authenticated E2E remain open; Child85 blocked.

**Child84 AI permission cache coherence (Draft PR #107, no roadmap reorder):** the author AI permission route must expire public-card `translationEligible` immediately after commit; creation should not re-POST an AI permission already saved atomically. Preserve Human/AI permission separation. Current Draft is not a release/merge decision; Child85 remains blocked.
