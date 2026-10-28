# LIB read — Durable Decision Log

Last updated: **2026-10-07**

This log records decisions that future chats must not casually reverse. It is not a chronological implementation diary. Add an entry only when the decision has lasting product/architecture consequences.

## D001 — Reader has three modes

Decision:
- Original
- Bilingual
- Translation only

AI vs Human is a translation-source choice, not a fourth Reader mode.

Reason:
The reading presentation mode and the provenance of the translation are separate concepts. Keeping them separate prevents UI and state explosion.

Do not:
- add “Human mode”
- add “AI mode” as a Reader mode
- tie bookmark identity to translation source

## D002 — UI locale, source language, and target reading language are separate

Decision:
These remain three distinct concepts.

Consequences:
- Search filters source language, not “read language”
- changing UI locale must not change the source-language corpus
- translation target belongs to Reader/translation state

Do not restore the retired `read_language` Search model without a new explicit product decision.

## D003 — AI novel/story generation is retired

Decision:
LIB read does not provide first-party AI generation of novel/story prose.

Removed:
- story generator
- continuation generator
- generated-story Reader/runtime
- generated-story translation runtime
- AI Story pricing/quota
- persisted LIB read-generated AI stories
- AI-generated special-case runtime branches

Reason:
Observed usage was very low while the feature imposed significant trust/brand cost for a fiction-posting platform. AI remains useful as reading/translation support.

Do not reintroduce AI Story generation as an incidental feature.

## D004 — AI translation remains, but author-controlled

Decision:
AI translation is a reading/translation support feature. New provider calls require author AI-translation permission.

Important behavior:
- posting/publishing/open permission does not automatically call the provider
- provider call occurs when a reader requests a missing translation and server checks pass
- closed permission blocks new AI translation and new AI word-explanation provider calls
- cached/existing assets are not silently destroyed when permission changes

## D005 — Human translation is separate provenance

Decision:
Human translation is user-generated translation content, not an AI-cache variant.

Consequences:
- separate permission from AI translation
- separate storage/provenance
- translator identity
- draft/publish/withdraw workflow
- free to read
- no AI allowance/credit/unlock
- no OpenAI call in Human translation workflow
- multiple Human translators may coexist for one episode/target

## D006 — Existing general works were not silently Human-opened

Decision:
When Human translation was introduced:
- existing general works defaulted Human translation closed
- rightsChecked Public Domain works were opened
- legacy rights-unverified Official works remained closed
- new works default Human open

Reason:
Avoid changing author permissions retrospectively.

## D007 — Translation consistency is work-level and bounded

Decision:
Long-form AI translation uses:
- work-level glossary
- target-language-specific terms
- author/editor locked terms
- limited previous published-episode context

Do not send hundreds of episodes/the whole novel on every request.

Do not claim perfect consistency or human-level translation quality.

## D008 — Shared AI translation cache is not model training

Decision:
Generated public AI translations may be stored and reused for the same source version/language entitlement path.

This is an application-level translation asset/cache and must not be described as training the model.

Private Library translation remains separate and owner-scoped.

## D009 — Public Domain requires provenance, not “Official” status

Decision:
A work is not rightsChecked merely because LIB read Official publishes it.

Current Public Domain flow requires provenance/rights review and tracked manifest evidence.

Consequences:
- rightsChecked and legacy Official cohorts remain distinct
- no fabricated source/edition/translator metadata
- no mass-open based only on Official ownership
- rights-unverified legacy works are handled individually

## D010 — Public Domain repartition must be lossless

Decision:
Where rights/dependency gates permit repartition:
- target ~8,000 chars
- hard max 10,000 chars
- source body preserved by contiguous slices
- hash verification required
- original episode ID remains on Part 1 where applicable

Do not normalize/strip source text merely to make translation easier.

## D011 — Translation segmentation v3 is canonical

Decision:
Public translation uses the Child75 segmentation baseline:
- max batch 3,000 source chars
- max 60 segments per provider batch
- `TRANSLATION_SEGMENT_VERSION=3`
- compact Reader markers, max lookahead 80
- punctuation-only translated segments are valid

Performance work must not silently roll this back.

## D012 — Pricing and quota model

Decision:
Free:
- ¥0
- public AI translation unlock + My Library import share 3/day
- My Library capacity 3

Premium:
- ¥680/month
- public AI translation unlock 30/day
- My Library import no daily count
- My Library capacity 20

Credits:
- 5 = ¥300
- 8 = ¥450
- 12 = ¥600
- 150-day validity
- 1 credit = one public episode × target-language AI translation unlock

Human translation is free and uses none of these credits/allowances.

AI Story quota is retired.

## D013 — Human narration and TTS are separate

Decision:
Human narration means actual human-recorded/uploaded audio.

Aivis / VOICEVOX / browser speech are synthetic playback, not Human narration.

Do not relabel synthetic audio as Human narration.

## D014 — Performance strategy is progressive, not destructive

Decision:
Prioritize above-the-fold content and reduce blocking fetches while preserving correctness.

Do:
- parallelize independent fetches
- stream secondary content
- avoid overfetching episode bodies
- fetch selected Human translation payload only when needed

Do not:
- truncate correct result counts
- weaken auth/R18/publication/permission gates
- trade correct >1000-row behavior for speed

## D015 — Search stays lightweight and explainable

Decision:
Search currently uses source-language filters, dynamic facets, normalized/fuzzy metadata matching, and URL pagination.

Do not add AI semantic/vector search or generated aliases without a new explicit product decision.

Cross-language aliases must come from real metadata, not per-title hardcoding.

## D016 — AI data-use claims must stay within verified facts

Decision:
Do not say “nothing is stored” or “AI never sees the work” when AI translation requires provider processing.

Current audited facts include:
- foreground OpenAI Responses requests use `store:false`
- OpenAI published API policy says API inputs/outputs are not used for training by default
- standard abuse-monitoring retention may be up to 30 days
- LIB read OpenAI account-specific data-sharing/ZDR/MAM status is unverified

Public copy must keep this distinction.

## D017 — Preview approval is the merge gate

Decision:
Normal feature workflow is:

latest main -> branch -> implementation -> validation -> Draft PR -> Vercel Preview -> user review -> explicit approval -> merge -> Production verification

Do not merge before explicit user approval unless the user has explicitly changed this workflow.

## D018 — Chat history is not the only source of truth

Decision:
Future parent/child chats should read:
- `docs/project-state.md`
- `docs/roadmap.md`
- this file
- relevant feature-specific docs

The repository state is used to preserve priority and canonical decisions across chat replacement/context compression.

## D019 — Public pages must isolate optional dependency failure

Decision:
A failure in optional/viewer-specific data must not make unrelated public content unusable.

Examples of optional/viewer-specific data:
- public-page Auth/viewer state
- subscription personalization
- bookmarks
- recording/narration aggregates
- related works
- popularity metrics

Consequences:
- public Hero/core content must render independently where its own critical data is available
- optional sections use local fallback/retry states
- loading must be bounded; do not leave indefinite spinners
- limited retries are permitted only for safe read-only transient-network failures

Do not blindly retry mutations, credits, unlocks, payments, permission changes, or publishing.

Reason:
The 2026-10-03 Supabase/network incident showed that broad dependency coupling can turn an upstream partial outage into a whole-page LIB read outage.

## D020 — Optimize by reducing work, not by weakening correctness

Decision:
The reliability/performance workstream keeps the current UI/feature semantics by default and first reduces query count, rows, columns, N+1 calls, raw-event processing, cache rebuilds, and critical-path dependencies.

Do not:
- remove UI solely because it is currently expensive
- weaken R18/auth/ownership/publication/translation-entitlement checks
- trade correct Search result counts for speed
- create a duplicate popularity aggregate when `series_popularity_daily` already exists without evidence that it is insufficient

UI removal requires a separate explicit user decision after isolation/narrow-query/lazy-load options are measured.

## D021 — Public Domain corpus growth is gated by capacity verification

Decision:
Do not jump from the current corpus directly to hundreds of additional Public Domain works while broad all-corpus reads remain.

Order:
1. Child84 reliability/performance hardening
2. controlled 30–60 rights/provenance-verified Public Domain works
3. Production scale verification
4. further staged growth only after the gate passes
5. Acquisition after the initial scale gate

This priority change was explicitly approved by the user after a Production incident and therefore satisfies the roadmap priority-change protocol.

Public Domain rights/provenance rules are unchanged.

## D022 — Dependency unavailability is not a valid business-state value

Decision:
A failed or timed-out read must not be silently reinterpreted as a real zero/false state when that distinction affects user meaning.

Examples:
- Auth unavailable is not proof that the viewer is signed out;
- public-work data unavailable is not proof that zero public works exist;
- bookmark/subscription data unavailable is not proof that the user has none;
- popularity data unavailable is not proof that popularity is zero.

Consequences:
- use explicit availability state or section-local unavailable UI where the distinction matters;
- fail closed for security-sensitive gates such as private ownership and R18;
- do not weaken permission checks to preserve rendering during an outage.

Reason:
The 2026-10-03/04 incident showed that treating dependency failure as ordinary empty data can avoid a global error while still presenting materially false state.

## D023 — A public-read deadline must stop underlying work when supported

Decision:
A bounded public read is not considered contained merely because the UI stops awaiting it. When the database/client API supports cancellation, the underlying HTTP/PostgREST request must receive an AbortSignal and be aborted at the deadline.

Consequences:
- locally generated read deadlines are not retried;
- immediate terminated transient failures such as explicit 522/503/connection-reset responses may still use a small read-only retry budget;
- a narrow-query compatibility fallback to `select("*")` is permitted only for recognizable schema/column mismatch, not for network/gateway/timeout/abort failures;
- public route layers that independently query Supabase must each have their own bounded/cancelable failure path.

Reason:
Preview measurement during the 2026-10-04 incident showed that a `Promise.race` timeout could render fallback UI while an un-aborted Supabase request kept a streamed Work response open for about 40 seconds. Adding request cancellation and bounding the Work layout reduced the sampled failure response to about 5.7 seconds without weakening publication, ownership, R18, or translation permission checks.


## D024 — Browser-direct Reader fallback is not adopted under the current failure mode

Decision:
Do **not** ship the Child84b anonymous browser-direct Supabase Reader fallback.

The prototype established a security contract that could keep the fallback public-source-only and R18 fail-closed, but Preview failure simulation showed that the browser path does not recover the current outage. The end-user browser reached the Supabase/Cloudflare gateway and completed the CORS preflight, while the actual public Data API GET remained unanswered. A separate direct GET from the authorized validation machine also timed out after 15 s with 0 response bytes / HTTP 000.

Therefore the current failure is not isolated to the Vercel -> Supabase hop. Shipping the fallback would add another browser-side data-access surface and another bounded wait without providing demonstrated availability.

Security findings retained from the prototype:
- frontend Supabase access must use only the publishable/legacy anon credential; `service_role` remains forbidden;
- canonical repository RLS restricts anonymous series reads to `publication_status = 'public'` and episode reads to public series plus `posting_status = 'posted'` and `is_published = true`;
- live Production policy/grant verification is still blocked by the same SQL connection timeout and must be repeated after recovery;
- RLS is not the R18 viewer-preference gate. Any future browser fallback must verify series rating before an episode/body request and exclude R18 when viewer preference cannot be proven;
- private/owner-only, draft, scheduled, unpublished, deleted/unverified content, translations, entitlement/credits, narration, bookmarks/reactions, publishing, and all mutations remain outside any such fallback.

Re-entry conditions:
- only reconsider browser-direct after a future incident demonstrates that representative browser Data API GETs remain healthy while the server-side Reader path is transiently unavailable;
- require live RLS/grant verification and security regression before adoption;
- do not treat 404/not-found, permission denial, invalid IDs, or business-state absence as an outage trigger.

Infrastructure alternatives:
- Vercel region relocation alone remains rejected because the prior `sin1` Preview reproduced the failure;
- Supabase Read Replica remains unadopted for outage failover: eligibility/cost still require project-specific verification, and asynchronous replication can produce stale publication state that conflicts with the requirement not to expose deleted/unpublished content;
- stale public snapshots/mirrors remain blocked until publish/edit/unpublish/delete have a complete server-controlled invalidation/tombstone boundary.

Reason:
Child84b was created to diversify the actual failure domain, not merely to add another code path. The observed browser/direct-GET timeout proves that this prototype did not establish the required independence, so non-adoption preserves a smaller attack surface and lower incident latency without giving up a demonstrated recovery path.

## D — 2026-10-21 Child84 operational closure with accepted verification gaps

At the user's explicit direction, Child84 is operationally closed without claiming full certification. Authenticated E2E is deferred; independent DB/Storage restoration was previously declined in favor of managed backups. The unresolved late-timer cause and Search SQL parity are not presumed resolved. Child85 may proceed in canonical roadmap order with staged rights-verified ingestion, without relaxing any authorization, R18, provenance, translation, credit, or Production-write safeguards. See docs/child84-operational-closure.md.

## D-GOV-20261021 — Reusable specialist chats and crash-recoverable parent control

Decision (2026-10-21): Separate roadmapped Child Work IDs from persistent specialist chat roles. Reuse the same **S1 Reader/Translation/Search**, **S2 Auth/Authors/User Data**, **S3 Public Domain/Provenance**, and **S4 Infrastructure/Reliability/Release** conversations for successive coherent tasks. Independent review requires a distinct reviewing actor; a fifth dedicated QA chat is optional, not automatically created. The user has already created the Child85 chat; it is S3's current Child85 assignment, not a trigger for a duplicate child.

Keep [PROJECT_MASTER.md](../PROJECT_MASTER.md) as the root permanent parent recovery entrypoint, discoverable from [AGENTS.md](../AGENTS.md) and [parent-chat-bootstrap.md](parent-chat-bootstrap.md). If the parent chat abruptly reaches its limit, the replacement independently reconstructs live main/PRs/Production, accepted residual risks and specialist assignment from the repo. No farewell handoff is required; the index is last-reviewed and must not be mistaken for a live auto-sync.

One coherent workstream may span several PRs within one specialist chat. Children do not autonomously reprioritize, create new task chats, merge without exact approval or mark source/mock success as live E2E. Only replace a chat instance at its limit or when a specialist's long-term scope genuinely requires one. Update this state with accepted durable changes; preserve the existing ordered roadmap, Product safety invariants, strict Preview → explicit user merge approval, and independently authorized Production data changes.

Reason: old root PROJECT_STATUS.md and parent-chat bootstrap were stale, Child84a–l were unnecessarily disposable per-PR/task threads, and the parent had no single fixed crash-recovery link. The user's intent is specialist depth and low-overhead continuity, not a growing collection of one-off chats. This decision changes collaboration governance, **not** existing Product behavior or Child85 ingestion rights.

## D-PRIORITY-20261021-GOOGLE — Queue Google sign-in and publisher advertising

The user explicitly requested adding **Google login** and **Google advertising placement** to LIB read's ordered backlog on 2026-10-21. Canonical `docs/roadmap.md` now places P7 Google OAuth sign-in (S2) and P8 Google AdSense publisher monetization readiness/placement (S4) after P5 Child85 and P6 Child86. Acquisition and minimal usage analytics become P9/P10 respectively; they are postponed, not canceled. This is an authorized priority insertion, **not** permission to implement OAuth, enroll in AdSense, inject advertisement scripts, merge code or activate ads.

Google sign-in must preserve existing Supabase Auth identity/ownership, permissions, R18, subscriptions and deletion boundaries. AdSense must be separately assessed for publisher approval, UGC/sexual-content policy compliance, advertising inventory and consent/privacy before placement; never presume approval or ads revenue. No unconditional ads on R18/private/unknown-risk Reader or UGC pages; a distinct follow-up review will define placements. Child85 rights approvals/Production imports are independent and untouched.

## D-GOV-RESET-20261021 — Retire all previous child chat instances; retain Work IDs and controls

The user explicitly chose on 2026-10-21 to retire/archive **all previously used child conversations** rather than reuse old instances, and to address immediately actionable oversight/security/reliability problems while queuing longer tasks to freshly created specialist chats. This supersedes only the old **conversation instance assignment** part of D-GOV-20261021; persistent *role slots* S1–S4 and all stable product/release contracts remain.

Create only new S1/S2/S3/S4 specialist conversations. Old Child85 PR #135 merged on `37650ac9`, but that delivered source preparations/security guards only: rights approvals 0, Production imports 0; work P5 remains open. The new S3 picks up Child85 using Issues and canonical docs. GitHub Issues #137–#144 are durable task cards with urgency, owner, independent reviewer, evidence and stopping conditions. A GitHub task does **not** launch a ChatGPT chat; the user must create/activate new chats and archive old conversations through ChatGPT UI. Do not assert UI archive completion.

As a parallel urgent safety work lane (not a silent P5/P6/P7 order waiver), S4 checks Production public-cache `AbortError` and S2 audits Supabase exposed DEFINER RPCs and Auth leaked-password setting. Findings are triage signals, not confirmed exploits. No speculative cache/RLS/Provider changes or Production writes; maintain independent review and explicit Preview/merge/data approval. Obsolete Draft PRs must be reconciled rather than blindly merged. Operator evidence: `docs/parent-ops-audit-2026-10-21.md`.

## D-GOV-DISPATCH-20261021 — Use active post-reset children; replace only missing/archived/capped slots

User clarification (2026-10-21): **real work belongs to the specialist child conversations**. The 2026-10-21 pre-reset legacy child chats remain retired and are to be archived. For each S1–S4 role, an **already active post-reset** chat receives the next Issue-specific instruction in that same conversation. Create one new same-slot conversation only where none exists, or where the active instance reached its context limit and has been archived. Do not create duplicate chats per PR/Issue or automatically start tasks by writing GitHub Issues. This clarifies the lifecycle rule in D-GOV-RESET-20261021 without reopening any retired pre-reset chat or changing the parent-controlled review/merge/Production gates. Dispatch texts and successor handling: `docs/chat-launch-2026-10-21.md`.

## D-GOV-SERIAL-20261021 — One active child at a time, parent as dispatcher

User clarification (2026-10-21, after creation of Draft PR #145): **no new child chat has yet been started**, and the desired work method is **parent → one child → stop/checkpoint → parent-directed independent review or acceptance → next child**. This overrides D-GOV-RESET's and the prior dispatch packets' suggestions of parallel S4/S2 incident triage and S1/S3 concurrent Child85 work. The ordered P5/P6/P7/P8 roadmap is not renumbered; urgent safety work may be first in a sequential queue.

The first/only assignment eligible to be sent now is S4 [#137](https://github.com/sriipu1004-wq/duonovel/issues/137) Production cache investigation and any evidence-based scoped Draft/Preview. S1 will be assigned **review-only** on S4's frozen PR HEAD afterward; only then parent chooses the next Issue (S2 #138, S1 #140, S3 #139). No other child runs until explicitly invoked. If a chat does not exist, create only that currently assigned specialist; if it reaches context cap, archive that instance and create a same-slot successor. Archived pre-reset chats never resume.

For conflict avoidance keep one active Issue/child phase, no cross-author branch push, no simultaneous edits to canonical docs, exact branch/HEAD/CI/Preview checkpoint, latest main/Production recheck before every baton handoff, and keep other PRs Draft/parked. This is a procedural parent-level lock; GitHub has **no automated mutex** installed by this decision. Review happens in a separate child as a serialized independent step; missing QA is not PASS. No user merge/Production/rights/Auth/ad approval has been granted.

## D-GOV-WINDOW-20261021 — user adopts single-window operation, preserves review/release gates

**Owner decision 2026-10-21:** “基本それでいい。では一致させて。その後続けて。” Accept the **single ordinary ChatGPT operator window** model: S1 Reader/Translation/Search, S2 Auth/Permissions/User Data, S3 Public Domain/Provenance, S4 Infrastructure/Performance/Release are **internal specialist responsibility and test-checklist labels**, NOT ordinary physical child chat assignments. No default Codex, Work, permanent background agent, automated orchestration, or new paid build infrastructure. The operator performs permitted direct GitHub source/branch/PR/CI/Preview and provider read-only investigation, one active Issue/phase at a time.

This **overrides only conversation-routing clauses** in D-GOV-RESET-20261021, D-GOV-DISPATCH-20261021, and D-GOV-SERIAL-20261021; strict serial work, domain boundaries, roadmap priority P5/P6/P7/P8 and all original product/rights/data/release constraints remain unchanged. Historical S4 #137 code was authored in a distinct child and stopped with Draft PR #146 exact HEAD `2d8cae74edea88e3425011d9a7b3950260e8aea6`. The planned S1 independent review is **still required and not yet done**, and changing “role” in this same window can never certify independent review. A real separate reviewer session/person must inspect the frozen HEAD and post GO/FIX/NO-GO to GitHub; failure to obtain it is REVIEW_PENDING and blocks merging. All other Issues remain queued.

User acceptance of this *operation design* authorizes proposed canonical documentation alignment, but **does not by itself constitute explicit merge authorization for PR #145/#147/#146 or a Production/DB/RLS/Auth/rights/publication/ads/Cron activation**. The actual ChatGPT Project Settings instruction is a separate user UI action; a GitHub edit does not update it. Approved operating copy: `docs/chatgpt-project-instructions.md`; process: `docs/chat-operations.md`; recovery: `PROJECT_MASTER.md`.

On a chat context limit or sudden loss, recover from GitHub canonical docs plus all live open PRs, exact HEAD/CI/Preview/Production and relevant DB; record pending review, approval and stop states in Issue/PR. A chat-only unstored approval cannot be safely recovered, so STOP/reconfirm rather than make up state. Codex use for a truly unavailable local test is task-scoped and opt-in, not implicit.

## D-GOV-ANSWER-STATUS-20261024 — Keep mandatory three-line action states in GitHub and Project Settings

**Owner request 2026-10-24:** Make the user-provided `共通作業状態・次の行動プロトコル v1.0` durable against ChatGPT context limits, then extend it with one state for **truly exhausted roadmap/open tasks** and distinct states for **separate-session independent reviewer requested vs pending**. The detailed normative v1.1 text and exact **17 allowed state names** are [docs/response-status-protocol.md](response-status-protocol.md). Reports end with exactly three final lines `【現在】`, `【次の行動】`, `【状態】`, one state only, no trailing text. The GitHub file is the durable source for crash recovery; exact ChatGPT Project Settings copy is [docs/chatgpt-project-instructions.md](chatgpt-project-instructions.md), which a user must paste/save/verify in the actual Project UI. GitHub alone does not update UI instructions.

This is a reporting/coordination decision, **not a new approval, source code permission, roadmap priority, automatic new Issue, cross-chat dispatch, reviewer identity or release gate waiver**. CONTROL-R4 still requires one authorized Issue/phase, separate genuinely independent security review of a fixed HEAD for high-risk changes, exact user merge approval and separately authorized Production/rights/Auth/RLS/data writes. Backlog paused/blocked/approval pending is **never** equivalent to no priority work; `続けて` only resumes permitted work. Low-risk governance text travels as Draft PR and requires its own explicit merge approval. Owner-facing three-line footer should also be applied during Draft review, so next user operation is obvious.

## D-GI-20261029-BOT-MEASUREMENT — High-priority Growth Integrity without relaxing R0 or release gates

**Owner-approved decision, 2026-10-29; coordination Issue [#154](https://github.com/sriipu1004-wq/duonovel/issues/154).** Register Bot-suspected browsing, growth-metric credibility and ranking integrity as a high-priority safety-adjacent **R1-GI** backlog track, not as evidence of a confirmed attacker or exploit. The four **internal sequential phases GI-P1 measurement, GI-P2 popularity/ranking, GI-P3 proportionate monitor-first anti-bot, GI-P4 AdSense invalid-traffic readiness** do not renumber the existing roadmap P1–P10. GI work is prioritized for evidence credibility before claims about acquisition, engagement, popularity, and future advertising economics; it does not automatically launch, preempt #137 B2, bypass #138 Auth, clear #150 performance hold, or reorder/cancel P5 Child85 → P6 Child86 → P7 OAuth → P8 AdSense → P9 Acquisition → P10 minimal analytics. Release and actual work dispatch remain strictly serial.

**Basis and evidence level:** User supplied suspicious anonymous multi-episode sweeps on October 18–19 and 27–28, October 1–28 event aggregate 5,217 and sensitivity-only retained-event counts 2,425 / 2,262 / 1,444 / 838. The planning phase **did not independently run Production SQL**, so these are **owner-reported, NOT authenticated current Production facts or a valid human unique-user estimate**. The server-side daily IP/user hash in `src/app/api/popularity/events/route.ts` is not a real visitor/session ID; client-side `sessionStorage` dedupe does not prevent a forged direct POST. Suspected distributed crawlers, normal reader binge, shared IP/NAT, verified search bots and human-vs-automated uncertainty must be separated by observable evidence. Neither PHP2Shell attribution nor a successful intrusion was established. Any numerical claims later relied upon operationally must first be re-derived from bounded reproducible and appropriately authorized SQL with date/timezone/event definitions and limitations recorded.

**Existing systems and overlaps:** `src/lib/popularity.ts` consumes existing `series_popularity_daily` view counts as one score factor, so do not build a duplicate ranking counter or destroy historical series-view events. First verify the processing chain and present uniqueness policy. Vercel Web Analytics is included in code, not verified to be receiving/bot-filtering data. `PublicAdSlot.tsx` is presently disabled, not proof of no other ads; ads.txt and publisher metadata do not prove approval or ad impressions/revenue. Integrate with queued S4 P6 diagnostics [#141](https://github.com/sriipu1004-wq/duonovel/issues/141) and existing S4 P8 AdSense [#143](https://github.com/sriipu1004-wq/duonovel/issues/143) without duplicating their scopes; preserve P10 minimal analytics and P9 real-user acquisition.

**Controls and acceptance:** Start with existing first-party capabilities, READ-ONLY provider/source evidence and non-personal aggregate metrics. Compare raw/excluded/undecided counts and report classification confidence, not a fabricated "human" series-view count. Verify proper Googlebot/crawler access and normal long-form binge-reading before any threshold, 429 or firewall action. Prevent direct-POST rankings manipulation with independently assessed controls; respect the origin of client/request IP headers. No new paid APIs, services, blanket CAPTCHA, unauthorized User-Agent/IP retention or privacy changes. Production DB event deletion/backfill/ranking re-score, Vercel Firewall setting, new tracking or AdSense/ad-code activation require separate exact-scope user authorization and test/rollback. Material changes to visibility/ranking/auth/privacy require actual isolated negative cases and separate author-independent fixed-HEAD review. For ordinary planning docs, a separate Draft PR is required and **must not merge merely because the user approved the priority request**; exact-HEAD PR and Preview merge approval remains distinct.

**Canonical:** `docs/roadmap.md` R1-GI and Issue #154 are the implementation backlog; this decision records why the user inserted it and what was **not** authorized. The user instruction does not lift ongoing PR #153 independent FIX / MERGE HOLD or any Production permissions.
