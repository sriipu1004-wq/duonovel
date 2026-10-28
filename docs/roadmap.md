# LIB read — Ordered Roadmap

Last updated: **2026-10-29**
Product-state baseline: `63f340168da1725f9c147a8dba05ecc88898b532`

This file is the canonical ordered backlog for the next workstreams. It exists specifically so parent-chat replacement or context compression does not reorder the planned site work.

> **CONTROL-R4 single operator window:** S1–S4 are internal specialist responsibilities, not ordinary child chat assignments. See [PROJECT_MASTER.md](../PROJECT_MASTER.md) and [docs/chat-operations.md](chat-operations.md). Child84/85/86 are roadmap Work IDs. **This operator change does not reorder any priorities**. Git/Production status in old dated notes is historical; live checks and approvals still govern.

## Current priority order

## Integrated execution queue — 2026-10-29 (owner-requested single ranked view)

**Status:** This section is the **integrated priority and dependency map**, not a grant to begin the next Issue. Read together with the established 2026-10-21 product sequence P5→P6→P7→P8→P9→P10, which remains intact. The existing P1–P4 Child81–84 milestones are historical completed/operationally closed tasks, **not** the four new GI-P1–P4 internal steps. Current authorized work is strictly serial; each Issue phase and every merge/Production change still needs its own safety and owner approval.

**Live snapshot verified 2026-10-29:** GitHub main `74c816edf22446bf0668d01d1164e1780d7f6899`, Production www Vercel deployment `dpl_3pqrySDQaK7fsDPpSaKQccmMcQjB` READY on old/main SHA, Supabase ACTIVE_HEALTHY PG17.6. Open Issues **#137, #138, #139, #140, #141, #142, #143, #144, #154** and Draft PRs **#108, #131, #150, #153, #155**. The Next.js/Sharp emergency Issue #148 and PR #149 are closed/merged: do **not** leave them as the active security task. Any SHA/count here is a snapshot and must be re-fetched prior to execution.

| Integrated priority | Workstream / authoritative object | Current blocking dependency and next permitted decision | Completion evidence (not currently assumed) |
| --- | --- | --- | --- |
| **R0-1 — immediately next substantive fix** | [#137](https://github.com/sriipu1004-wq/duonovel/issues/137) B2 / [Draft #153](https://github.com/sriipu1004-wq/duonovel/pull/153): R18 authorization, AI-vs-Human recording ownership, safe private-media/Storage handling. Include #137 public cache AbortError root-cause evidence and [Draft #150](https://github.com/sriipu1004-wq/duonovel/pull/150) performance **FAIL** as separate release gates. **S2/S4/S1** | Independent FIX at #153 HEAD `b1d97ba5059ff5f672d8bade135dd7340b2385f0` demands F2-A/B: distinguish Human/AI/reader owner, end unsafe duplicate DB DELETE, prevent concurrent lost updates with scoped synthetic negatives. **Source-write approval still needed.** Then new SHA CI/Preview and truly independent fixed-HEAD review. F1 stream race, F3 authenticated Reader and F4 backup/Storage-byte restore, migration/old-public URLs, p95/5xx and performance remain HOLD. | Genuine independent GO for fixed HEAD where applicable, R18 deny/allow and Human ownership negative tests; measured migration/rollback and Production review with separate exact approvals. No automatic #153/#150 merge. |
| **R0-2 — next security audit** | [#138](https://github.com/sriipu1004-wq/duonovel/issues/138): Supabase Auth, SECURITY DEFINER RPCs, grants/RLS/owner isolation, leaked-password protection and account deletion. **S2** | QUEUED; may start only after #137 phase is safely stopped/checkpointed and parent authorizes its scope. | Per-RPC owner/other-user tests, documented privilege decisions, independent security review; Production Auth/RLS/provider writes separately approved. |
| **HIGH-1 — before interpreting growth** | [#154](https://github.com/sriipu1004-wq/duonovel/issues/154) **GI-P1**: actual Vercel Analytics and denominators, real signed-in use vs anonymous daily-IP hashes, raw/suspected/uncertain counts. **S4/S1/S2** | QUEUED; short **read-only evidence** phase after urgent R0 safety gates or an explicitly authorized serial stop/reprioritization. October anomaly statistics supplied by the owner are **unreproduced SQL**, not verified human or Bot totals. | Repeatable source/provider/authorized aggregate definitions, time zones, privacy/retention and sample/exclusion uncertainty recorded without a false unique-human claim. |
| **HIGH-2 — ranking integrity** | [#154](https://github.com/sriipu1004-wq/duonovel/issues/154) **GI-P2**: `series_view_events` → `series_popularity_daily` → ranking score, direct-POST abuse, dedupe, ranking bias. **S1/S2** | After GI-P1; start with source/synthetic evidence. Do not alter Production historical events, public ranks, privileges or API access without separate approval and review. | Legitimate multi-chapter reader, NAT, real crawler vs scripted/distributed clients, forged POST/replay, visibility/R18 and reversible comparison negatives. |
| **HIGH-3 — monitor first; minimize effort** | [#154](https://github.com/sriipu1004-wq/duonovel/issues/154) **GI-P3**: first-party Vercel monitoring and conditional proportionate bot/API defenses. **S4/S2** | After GI-P2; observe first and implement only if abuse evidence warrants. **Nonblocking for P5** when risk is unconfirmed and reversible monitoring is adequate. No paid tools, blanket CAPTCHA, indiscriminate crawler block, extra IP/UA storage or live Firewall without exact approval. | Verified genuine-reader/Googlebot false-positive envelope, costs/limits and rollback; proposed direct-POST/429 controls independently reviewed. |
| **P5 — expand rights-cleared content** | [#139](https://github.com/sriipu1004-wq/duonovel/issues/139) Public Domain edition/source/rights **S3**, then [#140](https://github.com/sriipu1004-wq/duonovel/issues/140) Aozora notation and Original/Bilingual/Translation Reader fidelity **S1**; staged approved Draft imports. | After R0 gates and bounded HIGH risk triage, explicitly dispatch **one of #139/#140 at a time**. Ten prepared candidate manifests do not equal approved public rights. | Individually verified exact source/edition/permissions, Reader fidelity, small selected 3–6 work cohort and distinct rights/Production publication approval; stage further 30–60 only after acceptance. |
| **P6 — scale and recovery** | [#141](https://github.com/sriipu1004-wq/duonovel/issues/141): real post-expansion Search/Reader performance, DB+Storage byte restore, cache and observability. **S4** | Only after approved staged 30–60 corpus Production growth and direct dispatch; **does not delay** immediate R0 B2 F4 safe restore planning. | Actual p95/p99, 5xx denominators, Search parity, authenticated visibility and independently demonstrated DB+media restore. |
| **P7 — login conversion** | [#142](https://github.com/sriipu1004-wq/duonovel/issues/142): Google OAuth with current email accounts/identity-owner preservation. **S2** | P6 acceptance and separate provider/config/secrets/merge approvals. | Authenticated sign-in/collision/error/redirect/R18/RLS tests plus genuine independent Auth review. |
| **P8 — measured, policy-compliant ads** | [#143](https://github.com/sriipu1004-wq/duonovel/issues/143) AdSense publisher approval and placements + [#154 GI-P4](https://github.com/sriipu1004-wq/duonovel/issues/154) invalid-traffic readiness. **S4/S2/S1** | After P7 under the approved product sequence. GI-P4 uses #143, not another ad Issue; cannot infer live ads from `ads.txt` or usage events. Actual ad serving/consent requires distinct approval. | Verified account/site eligibility, compliant public non-R18 inventory and consent, true impression/click/invalid-traffic evidence and explicit site activation review. |
| **P9 — user acquisition** | Existing roadmap P9: readers/authors, language-learning communities, distribution/SEO, retention. **S1/parent** | After viable rights-cleared supply, capacity, account/security and measurement/ranking signal sanity; avoid optimizing inflated view events. Maintain P9 **after P8** in canonical relative order. | Human engagement, legitimate sign-ups, returning users, acquisition channel outcome, measured without false bot attributions. |
| **P10 — deeper usage analytics** | Existing roadmap P10: minimal ongoing product metrics, **not another broad analytics platform**. **S4/S1** | GI-P1 provides early trust baseline; P10 adds only needed product analytics once genuine traffic makes it useful. P9→P10 relative order preserved. | Low-cost data-minimized repeatable retention/funnel reporting. |

**OPS/legacy PR queue (explicitly accounted for, outside critical-path ordering):** [#144](https://github.com/sriipu1004-wq/duonovel/issues/144) canonical state drift / obsolete child-PR organization and prior legacy chat cleanup: read-only/document review first, no automatic PR closes or chat UI actions. [Draft #131](https://github.com/sriipu1004-wq/duonovel/pull/131) old localized Work SEO: compare with current main, do not merge obsolete code by green historical CI. [Draft #108](https://github.com/sriipu1004-wq/duonovel/pull/108) scheduled Cron: **NO-GO / HOLD**, never activate scheduled jobs or migrate automatically. These may be dispatched one-at-a-time after urgent work or on explicit owner reprioritization; no hidden concurrent execution.

**Documentation gate:** [Issue #154](https://github.com/sriipu1004-wq/duonovel/issues/154) / [Draft #155](https://github.com/sriipu1004-wq/duonovel/pull/155) maintains this priority map. This current **docs-only Draft** needs exact new HEAD/CI/Preview checks and **separate user merge authorization** before replacing main's canonical roadmap. It is not license to begin any queued Issue or fix #137. Every source/permission/ranking/rights/Production action has an independent narrower approval gate.

**Owner-approved 2026-10-29 high-priority addition — [Growth Integrity / Bot・集客計測 #154](https://github.com/sriipu1004-wq/duonovel/issues/154):** introduce a **safety-adjacent HIGH-priority R1-GI gate** after unresolved R0 security/data-integrity checks, and before claims based on acquisition/retention/popularity or AdSense effectiveness. It contains ordered **GI-P1 Measurement → GI-P2 Ranking → GI-P3 Monitor-first Bot defense → GI-P4 AdSense invalid-traffic readiness**. These are *internal phases of Issue #154*, not renumbered roadmap P1–P4. Existing P5 Child85, P6 Child86, P7 Google OAuth, P8 AdSense, P9 acquisition and P10 minimal analytics remain in their own relative order; #154 reuses #141's observability, #143's advertising readiness and P10's minimal-metrics intent without duplicating or automatically dispatching those Issues.

**Fresh-state precedence (2026-10-29 verification):** The 2026-10-22 R0-SEC #148 and #137-paused paragraphs **below are dated historical dispatch evidence**, not instructions to reactivate #148 or to stop authorized #137 B2 work. Latest observed main `74c816edf22446bf0668d01d1164e1780d7f6899`; #137 Draft PR #153 fixed HEAD `b1d97ba5059ff5f672d8bade135dd7340b2385f0` received separate-session **FIX / MERGE HOLD** [#6476788926](https://github.com/sriipu1004-wq/duonovel/pull/153#issuecomment-6476788926) for Human/AI recording-row collisions and concurrent writes; #150 performance gate remains unresolved. #138 Auth/RLS safety remains queued. Re-fetch GitHub/Production before dispatch. **Adding #154 does not displace #137 repair, waive #138, create concurrent writers, authorize remediation or any Production change.**

**Owner-approved 2026-10-21 priority insertion:** keep P5 Child85 rights/edition review and P6 Child86 scale gate; queue P7 Google OAuth sign-in and P8 publisher-side Google AdSense review/controlled ad placements. Displaced Acquisition and minimal analytics remain P9 and P10, not canceled. These priorities authorize planning only; OAuth provider activation, consent and ad scripts require their own evidence/review/approvals. This supersedes Draft PR #136 if this PR is approved.

**Owner-directed urgent override — 2026-10-22 (one active work item, NO automatic merge):**

1. **R0-SEC FIRST — [Issue #148, October 2026 Next.js/Sharp emergency dependency hardening](https://github.com/sriipu1004-wq/duonovel/issues/148)**, S2 security + S4 release scope, current authorized preparation on dedicated security branch / Draft PR. Fixed Production/main at dispatch: `a5773a367faed2915b16391d0cdc01b7ead6f7c7`; vulnerable locked `next@16.3.3`, `sharp@0.35.4`, and Server Actions present. Vendor-patched minimum Next `16.4.1`, Sharp `0.35.5`. Urgency is **affected component/version exposure**, **not a confirmed exploit or user-data breach**. Produce exact vendor-verified lockfile, actual tests/build, matching-HEAD Preview, *genuine independent* security review; then obtain **explicit owner merge approval**. Production and DB/Auth changes are separately gated. No unattended auto-update or merging on CI green.
2. **R0 reliability — [Issue #137](https://github.com/sriipu1004-wq/duonovel/issues/137) remains OPEN but PAUSED** under [2026-10-22 serial preemption checkpoint](https://github.com/sriipu1004-wq/duonovel/issues/137#issuecomment-6333990334). Late public Supabase/Next `unstable_cache` revalidation errors are **not fixed** by previous merged PR #146; timer root cause and request status/duration denominator remain unknown. Security version change must preserve and regression-test public cache/Reader/Search behavior; after #148 safety gate, #137 resume/priority is owner-directed, not automatic.
3. **R0 Auth — [Issue #138](https://github.com/sriipu1004-wq/duonovel/issues/138) stays QUEUED**: inspect authenticated `SECURITY DEFINER` RPC and cross-user/RLS boundaries, leaked-password protection, secrets separation. 54/54 current public tables have RLS enabled, but this is not signed-in negative-case E2E. No Auth/RLS/provider write is permitted as part of #148.
4. **Planned P5–P10 order preserved**, including Child85 rights/edition, Child86 scale/restore, Google OAuth, AdSense, acquisition and minimal analytics. Draft #131 (older metadata) and Draft #108 (Cron NO-GO) remain unapproved, unmerged, unmodified.

**Approval boundary:** This urgent owner priority insertion authorizes only serial, scoped preparation and diagnostic work. The separately approved high-risk implementation/merge/Production gates in AGENTS.md and PROJECT_MASTER.md still apply.


### R1-GI — HIGH priority: Bot疑いトラフィック・集客分析精度・ランキング信頼性 (#154)

**Authorization and status (2026-10-29):** owner-approved **priority registration and planning only**; [Issue #154](https://github.com/sriipu1004-wq/duonovel/issues/154) is **QUEUED / DO NOT START IMPLEMENTATION** until expressly dispatched following the applicable R0 risk and one-work-item lock. This work does not confer permissions for SQL backfill, database/Storage mutation, reclassification, Vercel Firewall changes, new logging/personal-data collection, AdSense activation, merge or deployment. New paid services/API contracts prohibited. Avoid a disproportionate custom anti-bot system.

**Why high priority:** internal series-view counts can be inflated by anonymous multi-episode sweeps, so the platform cannot call them unique human visits, unique users, paid ad impressions or genuine popularity. This affects SEO hypotheses, growth decisions, ranking manipulation risk and future ad invalid traffic. User's 2026-10-29 investigation provided October 18–19 and 27–28 suspicious patterns, a 5,217-event October 1–28 total, and four *sensitivity-only* retained-event scenarios (2,425/2,262/1,444/838). **These numbers are OWNER-SUPPLIED / NOT independently SQL-reproduced in this planning change.** They are not certified bot counts, proof of compromise, actual humans, or a PHP2Shell attribution. Any later formal report must independently re-query explicitly scoped aggregate SQL and document Tokyo/UTC day definition, event IDs/joins, selection bias and unique-IP/day hash limitations; never publish raw IP, IDs, paths or user identifiers.

**Existing SOURCE controls (main at planning):** `src/app/api/popularity/events/route.ts` validates series/episode/recording publication, hashes authenticated user or forwarded IP with Tokyo day, then upserts `series_view_events` on `session_id,episode_id` ignoring duplicates. This is not an actual session/visitor identity or limit on distinct episodes per day and does not prevent forged direct POSTs. The browser `src/lib/popularityEvents.ts` sessionStorage dedupe is advisory. `src/lib/popularity.ts` consumes `series_popularity_daily` and weighs viewCount/100 plus likes and bookmarks, but end-to-end aggregation, source authenticity, adversarial resistance and UX impacts remain to be independently traced. `src/app/layout.tsx` includes Vercel Analytics, not proof of provider-side measured humans; `src/components/ads/PublicAdSlot.tsx` currently returns null. `robots.ts` and `sitemap.ts` are SEO crawl paths to preserve; compliant bots and malicious scrapers must not be conflated. Separate site approval/ad impressions/earnings verification is required.

**Internal serial phases, not existing numbered P1–P4 (do not run in parallel):**

1. **GI-P1 — Measurement reliability (S4 data/analytics; S1 SEO; S2 privacy).** Independently verify actual Vercel Web Analytics availability and Production reception. Define disjoint metrics: page views, event rows, unique signed-in accounts, verified email, actively engaged/returning readers, subscriptions/conversions and genuine ad impressions. Produce reproducible *raw / suspected-automation-excluded / undecided* comparative counts with assumptions, confidence and false-positive limits, not an invented "human view" figure. Review existing first-party metrics before adding instrumentation. **Completion:** dated evidence sources, definitions and time zones, explicit limitations and repeatable read-only report; synthetic edge cases for NAT/shared IP, login changes, a reader finishing many chapters, good crawler and distributed bots; no new sensitive raw logs/long retention by default.

2. **GI-P2 — Popularity/ranking integrity (S1 Reader/Search/Ranking + S2 security).** Trace `series_view_events` → jobs/functions/triggers → `series_popularity_daily` → `popularity.ts` scoring/facets. Independently assess current dedupe under anonymous mass-page sweeps, directly forged `/api/popularity/events` POST, IP sharing, signed-in versus anonymous, episode changes, R18/private visibility, and legitimate deep reading. Design **reversible** scoring/filter/reporting using explicit bot-suspected and uncertain groups; test normal-reader and Googlebot false-positive risk. **Completion:** source/SQL lineage, abuse feasibility, synthetic before/after ranking and documented thresholds/denominators, with NO Production counter reprocessing/deletion absent separate owner authorization.

3. **GI-P3 — Bot detection and proportionate defense (S4 Vercel + S2 API/privacy).** Check actually entitled Vercel plan features/price and first-party security/log facilities; monitor-only first, scoped event API abuse controls second. Verify good crawlers through reliable methods, never User-Agent alone. Avoid broad CAPTCHA, blanket blocking, extra personal-data collection and unapproved paid tools. If requesting UA/IP aggregates, set precise necessity, access, retention, privacy and false-positive acceptance before implementation. **Completion:** bounded monitor-only baseline, successful good-crawler/reader cases, malicious POST/429/retry/concurrency negatives, cost/performance and rollback; firewall configuration separately approved.

4. **GI-P4 — AdSense invalid-traffic readiness (S4 publisher + S2 privacy + S1 UX).** Coordinate with [P8 / Issue #143](https://github.com/sriipu1004-wq/duonovel/issues/143), not a duplicate ad activation. Independently verify actual AdSense account approval/site review, `ads.txt`, whether any ad code serves in Production, ad impressions/invalid-traffic handling and privacy/consent/UGC/R18 rules. Do not equate event rows with impressions, clicks, earnings or Google-qualified ad traffic. **Completion:** account-provider-confirmed status, separate usage and ad metrics, no unauthorized publisher script/serving.

**Dispatch/gates:** #137 R18/Storage/DB-owner FIX and other material R0 holds are superior release/security dependencies; #150 performance issue and #138 Auth/RLS remain open work, not silently closed. GI-P1 is the first *read-only* action when #154 is expressly dispatched, before publicly interpreting P9 acquisition or P8 monetization. Preserve relative P5→P6→P7→P8→P9→P10 product order and dependencies; GI is a cross-cutting accuracy gate, **not** P10 cancellation or automatic preemption of active authorized work. Each phase requires a bounded permission; changed code needs source/regression, TypeScript/build, Draft PR and same-HEAD Preview; policy affecting ranking, user privacy, SEO or security needs genuine separate-session review. Production DB backfills/recalculations/deletions, Firewall/config, consent/log changes and actual ad activation each require separately identified object scope/count/impact, rollback and explicit authorization.

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

Status: **operationally closed 2026-10-21 with explicit deferrals; not full verification**

**2026-10-21 superseding closure decision:** Child84 is operationally CLOSED at the user's direction; Child85 is unblocked for staged, rights-verified planning and limited execution under existing safety gates. Historical paragraphs below record earlier blocked states and are not current status. See docs/child84-operational-closure.md. Unexecuted E2E, independent restore, Search SQL cutover, and unresolved timer cause remain explicitly unverified.

**2026-10-11 acceptance gate update (status only; backlog order unchanged):** #123 temporary fail-closed self-service account deletion guard and truthful Privacy/Terms were explicitly approved and merged as `fa86529be99f167df9e673724adb4be6f8189ebf`; matching Vercel Production `dpl_BKpqovPvodbLBYvmHSZzKTUjvLBd` is READY. The published support mailbox `libread08@gmail.com` was actually connected, incoming harmless test email found, reply sent, and its receipt at the source inbox confirmed; restricted intake labeling established. Real user deletions are disabled pending verified manual identity/rights/retention review. Previous Auth soft-delete did not guarantee data erasure. This change does **not** authorize permanent B/C/A policy, automatic erasure, Stripe cancellation on a support request or live destructive E2E. #124 public DB late-timer evidence, #121 Search SQL NO CUTOVER, #122 saved Search filter, and #126 read-only RLS audit were previously merged. Independent DB + ~30GB Storage *file-byte* restoration, real authenticated author/Reader/Human/R18 E2E, production timeout root cause, Cron #108 and metadata optimization #128 remain separately gated. Existing Search JS ranking/facets/pagination, rights, ownership, AI/Human provenance, R18 and public cache freshness must remain intact. **Child84 NOT DONE; Child85 BLOCKED.**

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

**2026-10-10 Child84 PR #97/#98 checkpoint (no priority change):** PR #97 was approved, merged and Production READY at `5812deca12fd1549a03329124d30b37cfbde7dc2`, fixing public Human-narration aggregate candidate overfetch and 1,000-row silent truncation. Its necessary DB prefilter matches 97 of 2,277 records, but 0 passed the required Human audio-path provenance in the verified Production snapshot; do not invent a Human narration inventory. PR #98 was approved, merged and deployed READY at `927b79964cfe8761d5a9b91a6b09ab5ccdca6194`, adding strictly sanitized local public-read timeout diagnostics without changing the 2,500-ms deadline or retry behavior. Child84 remains open for secure cache invalidation, Search SQL pagination with exact facets/ranking, longitudinal upstream error classification, independent backup/restore evidence and interactive Reader/R18/translation acceptance. Child85 stays blocked.

**2026-10-10 canonical source-language fallback checkpoint:** connected Production proves 120 public series have explicit JA/EN/KO (40 each); 3 private NULL rows are unaffected. Draft public-catalog source-language-only cutover eliminates the unused public episode-body guessing path and fails closed for future public rows lacking canonical source metadata. This is a subtask within Child84, not a change in roadmap priority. Merge and Production verification require explicit approval; Child85 remains blocked.

**2026-10-10 Child84 author edit mutation boundary (Draft; backlog order unchanged):** implemented a candidate owner-authenticated Server Action for *existing-series edits only*, with explicit RLS owner filter, constrained editable fields and Next.js 16 immediate `updateTag` expiration of the 60-second public base-card cache. Author creation, episode mutation, deletion, scheduler and other direct-client paths remain outside this bounded candidate; DB commit and cache expiration are not atomic. This improves one mutation path only and must not be characterized as a complete publication/tombstone system or used to unblock Child85 without the remaining gates. Await CI, Preview, user approval, then Production authenticated edit/unpublish verification.

**2026-10-11 Child84 consolidated author mutation release checkpoint (no priority change):** following approved #98/#99/#101 Production deployment, test previously Draft #102/#103/#104/#107 together against current canonical main in one bounded release candidate. Preserve R18/permissions, author RLS, Public Domain provenance, canonical language/Reader behavior, short cache TTL. Publication, cache expiry and DB commit remain non-atomic; deleted/externally written content, authenticated E2E, Cron activation and SQL Search equivalence are still separate gates. Child85 remains blocked.

**2026-10-11 Child84 Production release checkpoint (no roadmap reorder):** User approved the verified Child84 code releases: #98 diagnostic `927b7996`, #99 canonical public-source catalog `640e3cd8`, #101 owner-series action + public card tag `ab3615aa`, and #109 consolidated owner episode/create/R18/language/AI-permission mutation cache boundaries `10764dec`. All reached Vercel Production READY, final anonymous Home/Search/Work/Reader smoke 200/200/200/200. The #102/#103/#104/#105/#107 Draft PRs were closed unmerged as shipped via #109; #100/#106 were rejected/closed. Remaining non-atomic mutation/cache race, deletions, signed-in E2E, Search semantic equality, backup restore and scheduler remain explicit gates. #108 Cron remains Draft/unmerged/unapplied: independent DB/backup required; no Supabase branch or local dump CLI available. **Child84 open; Child85 blocked.**

**2026-10-11 Child84 independent DB/Storage recoverability gate:** verified Supabase Pro organization status, but not a project-specific backup restore; ~30.19 GB in 4,728 Storage objects is outside standard database backups. 2,277/2,277 recordings had matching audio objects; 2,443 other objects are only *potential* cleanup candidates and must not be deleted without a full provenance audit. The new `docs/child84-backup-and-storage-recovery.md` runbook and read-only SQL do not satisfy the off-site restore requirement or unblock #108 Cron / Child85. No priority reorder.

**2026-10-11 Child84 scheduled author UI consistency (no reprioritization):** owner-side read links require committed posted+published rather than due clock alone. Due clock is shown separately as `予約時刻経過・公開待ち`. This changes no Reader/RLS/permission policy and does not replace Draft #108 Cron, restore gates or signed-in E2E. Child85 blocked.

**2026-10-11 Child84 isolated Supabase Cron milestone (no priority change):** real `pg_cron 1.6.4` on a short-lived paid development branch successfully published a synthetic due episode, audited one exact ID, respected draft/future rows and was unscheduled. The temporary branch was deleted and Production remains unchanged. The branch's canonical migration chain could not replay due to missing `public.series` baseline; DB and ~30 GB Storage backup/restore, full-schema E2E and 2.5s timeout monitoring are still blocking; #108 remains Draft. Evidence: `docs/child84-cron-isolated-supabase-evidence.md`. Child85 blocked.

**2026-10-11 Child84 Search DB candidate eligibility milestone (no reprioritization):** read-only Production compares canonical summary vs directly posted/published episode-eligible public source-language work IDs: 120 vs 120, zero mismatch, ja/en/ko 40 each. A 1,803-row synthetic Search case prevents premature 1,000-row/24-item SQL LIMIT, protects fuzzy/saved/date and self-excluded source/genre/tag facet parity, but does not constitute final exact ranking/metric parity or SQL pagination rollout. See `docs/child84-search-sql-eligible-parity.md`. Child84 open; Child85 blocked.

**2026-10-11 Child84 optional Work translation badge query prefilter (no priority change):** current 120 public works/3284 episodes but only 12 ready AI translation rows. A Draft head-only inner join can avoid fetching full episode bodies for badges known to have zero ready cached translations, without changing full translation version page, AI/Human permissions, credit use or R18. Zero-count is a performance hint only; auth/cache/hash and gateway-failure behavior remain canonical. CI+Preview and Production latency verification needed; Child85 stays blocked.

**2026-10-11 Child84 Work layout optional streaming checkpoint (no reorder):** a bounded Work-only `Suspense` isolates the optional translated-language badge after the existing R18/series-publication safety checks. The head-only ready-row filter avoids unnecessary full body scans only on verified zero count, with error fallback. Production impact unmeasured until deployment. Child84 open; Child85 blocked.

**2026-10-11 Child84 deadline-versus-abort-settlement diagnostic checkpoint (no reprioritization):** current Production public-series/episode-summary fetches still occasionally abort; observed total elapsed sometimes far exceeds the 2,500ms deadline. Source-only instrumentation separates delayed timer callback from delayed promise rejection, with no endpoint key/URL disclosure or timeout policy change. No performance win/root-cause claim before Production logging. Backup/restore, signed-in E2E, Search full SQL semantic parity and deferred Cron remain the Child84 gates; Child85 blocked.

**2026-10-11 Child84 localized Work metadata fail-closed checkpoint (no priority change):** a transient global public catalog cache revalidation error must not crash localized Work metadata. Candidate catches failure and emits only generic noindex/nofollow rather than stale private/R18 work data; success path remains unchanged, as do core Work/Reader permissions. This reduces optional error propagation but is not proof of Production latency improvement or completion of SQL Search, backup/restore or authenticated E2E. Child85 blocked.

**2026-10-11 Child84 confirmed late timeout callback evidence (no roadmap reorder):** shipped #116 telemetry distinguishes 2,500ms local deadline from callback dispatch delay and post-abort settlement. An actual Production `series` warning reported 83,379ms total, with 80,876ms late callback and 3ms settlement, while cumulative Supabase SQL exec times were far shorter. This single incident does not identify the cause (event-loop block vs runtime pause); no timeout extension, region switch or unsafe stale-public fallback adopted. Evidence `docs/child84-public-db-timeout-phase-evidence.md`; other Child84 gates remain. Child85 blocked.

**2026-10-11 Child84 account soft-delete public cache coherence checkpoint (no priority reorder):** add immediate public work-card tag expiration after confirmed Auth soft-delete without confusing cache expiry for deletion of authors' published works. Account content retention/tombstones, irreversible deletion E2E and out-of-band DB writes remain separate security/product-decision gates. No DB mutation in the Draft. Child84 open, Child85 blocked.

### P5 — Child85: staged Public Domain expansion

Status: **next — Child84 operational closure accepted; staged rights-verified batch only**

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

### P7 — Google account login via Supabase Auth

Status: **queued — after Child86 Production scale acceptance**

Owner: **S2 (Auth / Authors / User Data)**, with a distinct security reviewer.

Goal: let users sign in with their Google account as an additional authentication method, without replacing the existing sign-in path or silently changing account ownership.

Acceptance gates:
- inspect the actual current Supabase Auth/login/callback/session/account lifecycle first; use the supported Google OAuth provider instead of building a parallel identity store;
- configure and review the authorized Google Cloud OAuth client, Supabase provider, exact Production/Preview redirect allowlist and secrets, without disclosing credentials or assuming account-side settings are already enabled;
- preserve existing user IDs, profiles, works, author permissions, subscriptions/credits, R18 preferences, private libraries, RLS and account-deletion safeguards; define safe handling for an existing email, account linking and duplicate identities before shipping;
- test new Google sign-in, existing-account paths, cancellation/error/expired-code flows, callback/redirect tampering and logged-in/out state against the approved security contract, including an appropriate authenticated Preview flow;
- pass independent auth/security review, matching-HEAD Preview, explicit user merge approval and Production smoke. Do not enable uncontrolled provider/identity changes on a documentation-only decision.

Primary integration reference: https://supabase.com/docs/guides/auth/social-login/auth-google

### P8 — Google AdSense eligibility, review and controlled site ad placement

Status: **queued — after P7; ad serving is conditional on AdSense site approval and policy acceptance**

Owner: **S4 (Infrastructure / Reliability / Release)** with S1 UX and S2 privacy/R18 independent review. This means **publisher-side Google AdSense**, not paid acquisition through Google Ads.

Goal: connect the LIB read domain to AdSense and, when eligible and approved, place a small number of measured, policy-compliant ads without degrading the reading experience.

Acceptance gates:
- check whether the operator actually has an AdSense account, its site verification/review status and official supplied publisher ID; never fabricate an AdSense account, approval or estimated earnings;
- examine Google Publisher Policies for user-generated novels, sexual/explicit or R18 content and potential rights problems; start with explicitly eligible public pages, exclude private, unapproved, R18 or unknown-risk content and avoid indiscriminate global ad injection;
- agree specific ad placements and interaction limits before implementing; protect Reader text/translation/audio controls, mobile readability, accessibility, load time, CLS, indexability and paid Premium differentiation;
- review Privacy/Terms disclosures, regional consent/cookies/CMP requirements including EEA/UK/Switzerland where applicable, and appropriate ads.txt/site verification; never activate tracking before the required gate;
- only use official AdSense integration and approved site/placement configuration; staged Preview and independent policy/security/UX review precede explicit merge and any separate live-ad activation;
- verify live ad eligibility/status, actual behavior and performance after authorization; if the account or site is not approved, leave the work BLOCKED without claiming ads are serving.

Official references: https://support.google.com/adsense/answer/7584263 and https://support.google.com/adsense/answer/48182

### P9 — Acquisition

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

### P10 — Real usage observation and minimal analytics

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
