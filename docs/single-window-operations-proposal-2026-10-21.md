# LIB read — Single-window ChatGPT operation: feasibility and migration proposal

**Status: USER-ADOPTED OPERATING DESIGN / CANONICAL IMPLEMENTATION IN DRAFT PR #147, NOT YET MERGED (2026-10-21).** The user explicitly accepted the proposed single-window operating method. This document originally began as a proposal stacked on governance Draft #145; the consolidated governance PR #147 is to be retargeted to main, and #145 closed as superseded after scope verification. No merge/Production/DB/rights permission or completion of PR #146 independent review is implied. **Do not interpret this proposal as an instruction to resume #137 or start #138/#139/#140.**

Repository: `sriipu1004-wq/duonovel`; Production: `https://www.syosetu-libread.com`.

## 1. Audited baseline and conflicts

Independent repository/provider snapshot on 2026-10-21; every future entry must recheck it:

- Main and matching Production: `37650ac9b391c1a76f597751ea44c6110541a697`, Vercel `dpl_3Zhkw9WLfYmdzChM2LRRQDNLpXCL`, READY. Supabase project `nyxbnccuvmlzffgtdadi` ACTIVE_HEALTHY, read-only counts 123 total series / 120 public, 3,284 episodes and 0 Human-translation rows. Provider health and HTTP test samples do not certify full authenticated workflows.
- **PR #146**: S4 Issue #137 source/metadata patch at exact HEAD `2d8cae74edea88e3425011d9a7b3950260e8aea6`, Draft/unmerged, 7 changed files, 3 GitHub workflows SUCCESS, Preview `dpl_GUCibV6ZNM6zBZAqP6BqfDChRaid` READY. S4 has **stopped**. The S1 **independent** exact-HEAD review is **NOT DONE**. Global catalog/recording cache AbortError and delayed timer callback root cause remain unresolved. Review gate is not waived.
- **PR #145**: pending Draft CONTROL-R3 governance on HEAD `49dab6e0ff4167d802949209d0dc780d1cba98bc`, not merged. Its proposed model is parent + physically distinct persistent S1–S4 children. The existing main CONTROL-R1 files are stale snapshots (e.g. they still describe PR #135 as Draft); live merged #135 is source preparation, not Public Domain rights approval or Production import. **Do not silently merge #145 or rewrite #146.**
- Other old open Drafts #108 (Cron NO-GO), #131 (prior Work metadata candidate), #136 (predecessor governance) remain held. They are not new assignments.
- Standing deferrals: authenticated Owner/Reader/R18/Human E2E, independent DB/Storage recovery, timer cause, SQL Search full parity and deletion workflow. Accepted deferrals are not PASS.

**Source-of-conflict:** main `AGENTS.md`, `PROJECT_MASTER.md`, `docs/chat-operations.md`, `docs/development-workflow.md` and Draft #145 specify physical specialist child conversations and child-to-parent handoffs. A single-window model **requires an explicit governance override**, but not a product-model or backlog reorder. `docs/roadmap.md` remains canonical for priority; do not use this proposal to skip its P5/P6 or approved P7/P8 sequencing.

## 2. Feasibility decision

**GO FOR A CONTROLLED SINGLE-WINDOW OPERATING MODEL; NOT GO FOR AUTOMATIC OR SELF-CERTIFIED INDEPENDENT REVIEW.**

Use one ordinary ChatGPT conversation as the operator-facing **single window**, not Work, a resident background agent, Codex coordinator or multi-chat execution mesh. The window directly inspects files, uses available GitHub/Vercel/Supabase connectors, consults docs and current sources, proposes fixes, edits isolated branches, verifies CI/Preview and produces a user approval request. The user no longer passes long reports between routine specialist conversations.

S1 (Reader / AI-Human translation / Search), S2 (Auth / Authors / permissions / R18 / user data), S3 (Public Domain source/rights/provenance), and S4 (Reliability / Vercel / Supabase / deployments) become **responsibility/checklist labels within the window**, **not independent actors**. Switching labels or doing a second pass in the same thread is only SELF-REVIEW.

Physical specialist chats are **not required for ordinary operations**. Distinct review sessions may be created only when a gate below requires genuine separate review, and receive the GitHub PR URL, fixed HEAD, risk checklist and STOP conditions. They write evidence to GitHub; the operator window reads the review from GitHub. Do not require the user to copy a lengthy result back. A separate ChatGPT conversation is separate-context review, not automatically a qualified legal examiner or proof of independence from common-model failure; require human/legal review where appropriate.

This design **does not claim** the window can send messages directly to another ChatGPT conversation, create/manage that conversation, run offline in the background, operate inaccessible login-only UIs, or guarantee context continuity without GitHub checkpoints.

## 3. Workflow — one task, one writer, no Codex by default

1. **Operator entry and live preflight (READ-ONLY):** read `AGENTS.md`, `PROJECT_MASTER.md`, `docs/project-state.md`, `docs/roadmap.md`, `docs/decisions.md`, `docs/development-workflow.md`, `docs/chat-operations.md`; check current main, every open PR/HEAD, Production SHA/READY, relevant Supabase state. Resolve file vs live inconsistencies explicitly.
2. **Dispatch lock:** take only a single parent/user-authorized Issue and stage. Record `work_id`, current phase, Sx responsibility, change scope, risk, review policy, exact base/branch/HEAD, stop point and forbidden actions in the Issue. On a new incident, first freeze/checkpoint the current task; no competing branch work.
3. **Source and design:** inspect current source/fixtures, external authoritative docs where necessary, produce evidence-bound root cause and a minimal scope. For rights, do not substitute guessed editions or AI-only review.
4. **Author in the SAME window:** from freshly verified main create an isolated branch, make limited changes through available tools, add meaningful regression tests, run actual test/typecheck/lint/build when accessible. A successful text inspection, a remote CI pass and an authenticated Production E2E have different evidence levels; do not promote one to the other. GitHub tool-only content edits can work; for unsupported local test/browser steps, stop or use an explicitly authorized fallback, not an invented PASS.
5. **Draft PR and Preview:** push a bounded checkpoint, open Draft PR, inspect exact-head GitHub CI and Vercel Preview. Keep branch separate from #145/#146 and do not quietly resolve their review gates. Document untouched product boundaries, DB/Data effects and caveats. Wait for Preview to reach a real READY state; no invented metrics.
6. **Risk gate:** use the table below. For review-required changes, freeze exact author HEAD, invoke a truly separate read-only reviewer (or human reviewer), and have it post GO / FIX / NO-GO with concrete source/Preview evidence to PR/Issue. Do not edit the author branch while independent review is in progress. A FIX return goes back to the operator window and requires a NEW HEAD and re-review as necessary.
7. **Approval and release:** the user inspects the exact Preview/scope and explicitly approves merge. If an approval happened only in a lost chat and cannot be substantiated, request approval again; never infer it from a stale snapshot. After approval recheck current main and exact PR HEAD, merge the approved change only, verify Production deploy SHA/READY and smoke, report what was and was not exercised.
8. **Close:** post a durable checkpoint and resume only the next explicitly authorized Issue. A checkpoint/Issue cannot trigger unattended work.

**No implicit Codespaces/Codex/Work/agent orchestration.** Use built-in GitHub connector and connected tools for repository operations where capable. Use Codex only for **approved** operations that the window cannot complete (e.g. reproducible complex local integration or workstation-only tests), with explicit task scope/budget and without treating Codex as an invisible primary implementer. External app limitations must be stated rather than patched over with unsupported claims.

## 4. Review classification and proof

| Risk class / examples | Window may do | Independent review needed before release | Additional requirement |
| --- | --- | --- | --- |
| A — docs wording, nonpolicy UI copy, localized labels, isolated presentation tweaks | source + self-review, tests, Draft and Preview | normally **no**, unless SEO/crawler visibility/rights/claims/security boundaries change | user Preview/merge approval |
| B — general search/performance/refactor/SEO behavior with visibility, caching or canonical metadata effect | implement + regression tests + Draft/Preview | **yes if** publication, R18, authorization, sensitive SEO indexing, source-language Search completeness, stale private content or cache invalidation could change; otherwise risk-rationale may justify self-review only | evidence-backed tests, before/after where relevant |
| C — Auth/session, ownership/RLS, private data, Human/AI entitlements, credits/billing, account deletion, security-definer, R18 | investigate + isolated fix + Draft/Preview only | **always**, independent permission/security reviewer separate from author context | real/synthetic cross-user and negative-path testing as appropriate; explicit DB/Provider/Production scope approval |
| D — Public Domain rights/edition/licence, publication/takedown, production import/backfill/migration or destructive data | source/rights preflight, exact cohort/count and reversible migration plan | **always**; source/legal/provenance independent of author plus security/data review as applicable | real rights/edition evidence; human legal judgment when material; distinct Production data or publication authorization |
| E — payment/provider/ads/privacy/crawler policy changes, scheduled-publication Cron, retention/training claims | investigate/design/implement isolated proposal only | **always** for relevant security/legal/policy and deployment boundary | provider/consent/legal readiness, explicit activation or config approval |

**Current PR #146 is B with privacy/indexability implications → separate S1/Reader-Search independent review is mandatory.** Its existing S4 author has stopped and the exact Draft HEAD is frozen. This proposed single-window rule does **not** permit the window to self-certify PR #146 as independent or merge it. Until a separate review is actually commissioned/received, the current gate remains BLOCKED/QUEUED.

Distinct machine-executed CI and Preview are necessary evidence but **do not equal** independent human/agent semantic audit. A second message in this same ChatGPT conversation or a changed S1/S2/S3/S4 role label never counts as separate-session review. No reviewer may both author and approve the same version. Escalate unresolved reviewer disagreement to the user instead of averaging it away.

## 5. Practical audit handoff without copy-paste of results

For a gated change, the window posts one GitHub PR/Issue audit packet: stable `repo`, `PR #`, exact `HEAD SHA`, source base, changed files/diff, scoped questions, sensitive invariants, CI & Preview IDs, source assumptions and **READ-ONLY** boundary. User opens a separate independent review session (or names a real reviewer) only for that gate and pastes/supplies the concise PR URL and fixed audit instructions *once*. Reviewer independently fetches live GitHub/Preview, posts its signed/contextualized GO/FIX/NO-GO **directly to that PR/Issue**, then stops. The window retrieves that GitHub review independently and presents one merged decision. The user need not shuttle full analysis between chats.

If a separate session cannot be invoked or cannot publish review evidence, the review remains **PENDING**, not implicit GO. Using Codex for review is optional, not default; reviewer conflicts and rights/legal expertise remain real limits.

## 6. Recovery at chat context limit or unexpected reset

**GitHub is the durable operational ledger, not conversation memory.** Before a major handoff, and before risking chat cap where feasible, store in the active Issue/PR:

- stable task/Work ID and S1–S4 responsibility tag; phase `QUEUED / READ_ONLY / IMPLEMENTING / DRAFT_PREVIEW / REVIEW_PENDING / FIX / USER_APPROVAL_PENDING / MERGED / PROD_VERIFIED / BLOCKED / DEFERRED`;
- user-requested scope and explicit `OUT_OF_SCOPE`; what is known vs inferred;
- base main SHA, branch, *exact current HEAD*, PR URL, CI run identifiers/results, Vercel Preview ID and checked URL/time, Production deployment ID/SHA, material Supabase query count snapshot;
- author identity/session role and separately verifiable reviewer context/evidence, GO/FIX/NO-GO, known unverified gates, rollback/rights/data risks;
- exact user approvals **with PR HEAD/scope and a traceable source** where the record permits; if any approval cannot be verified after a crash, STOP and reconfirm rather than silently execute;
- child/report contract: Git/Production, Changed, DB/Data, Preserved, Validation evidence type, Remaining, Canonical docs, Next, explicit STOP owner.

**Successor window bootstrap:** (1) read `AGENTS.md` and `PROJECT_MASTER.md` plus canonical files; (2) recheck LIVE main and **all** open PRs/HEADs/CI, Production and relevant Supabase; (3) read the most recent Issue/PR gate and approval evidence; (4) reconcile stale top-level docs vs current Git/Production; (5) confirm no already-running action, no conflicting branch, no authorization gap; (6) resume only the same authorized work phase or ask for missing approval. Never assume a previous chat completed a pending action.

**Limits:** A suddenly lost, uncommitted in-chat action or unverifiable chat-only approval cannot be perfectly reconstructed. Recovery is fail-closed by design: preserve verified GitHub work and explicitly re-establish missing decisions. Avoid promising automatic cross-chat continuation.

## 7. Adoption and exact governance changes (prepared in Draft PR #147, not yet merged)

1. User **approved** single-window as the default operating model on 2026-10-21. GitHub canonical CONTROL-R4 changes are prepared in Draft PR #147, but neither GitHub merge nor actual ChatGPT Project Settings UI sync has occurred automatically; those require their existing approval/UI steps.
2. The adoption branch updates **`AGENTS.md`** (one-window operating entrypoint), **`PROJECT_MASTER.md`** (one operator window, active dispatch lock, verified PR statuses and no stale child ownership), **`docs/chat-operations.md`** (replace mandatory physical S1–S4 chats with internal responsibilities and independent-session gates), **`docs/development-workflow.md`** (same release flow and review decision matrix), **`docs/decisions.md`** (durable decision), and **`docs/chatgpt-project-instructions.md`** / bootstrap/launch prompts (optional review session, not routine child prompts). It does **not** reorder `docs/roadmap.md`; user-approved backlog remains.
3. Because PR #145 already carries pending governance changes, retarget consolidated PR #147 to `main` after verifying it includes prior approved #145 additions, and CLOSE #145 UNMERGED as superseded. Still require a separate explicit PR #147 merge authorization. Audit exact changed files, run documentation checks, leave Draft, require explicit user merge approval.
4. Existing PR #146 **does not change owner or approval status**. S4 remains author and stopped. Separate S1 review must still happen before release; its documentation and result go to GitHub. Do not activate another Issue until parent issues an instruction.
5. Conduct one controlled low-risk work item under the window after governance alignment to verify tools, checkpoint completeness, no duplicate commits/Preview churn, and graceful recovery. If performance or audit quality degrades, revert to the existing specialist-chat model by a separately approved governance change.

## 8. Advantages, quality risks and cost boundary

**Benefits:** eliminates everyday manual child dispatch/report copying, reduces chat-count maintenance, removes accidental parallel PR writers, centralizes product-context decisions, and does not intrinsically require any additional Codex tokens, subscription, Work, scheduling or orchestration infrastructure.

**Costs/limits:** (a) a single conversation may become long/context-constrained sooner; rely on GitHub checkpoints, not chat recollection; (b) loss of parallel specialist context can reduce domain depth and increase overlooked interactions, requiring risk matrices and targeted tests; (c) author self-review loses independent challenge and cannot certify high-risk changes; (d) reviewer session invocation or human approval remains occasional manual work; (e) connector/tool limits may block full local builds, browser-authenticated E2E or real-device testing; (f) many small sequential GitHub file updates can trigger unwanted Preview/CI churn, so batch commits when available; (g) a one-window bottleneck can delay unrelated fixes, but this is the user's chosen strict serial execution rule.

**Hard cost policy:** do not introduce a Codex-first workflow, automatic long-running jobs, background Work, new paid build/DB resources, or recurring external services merely to reduce copying. Any fallback must specify its own resource/cost ceiling and be explicitly authorized. Tool availability and plan-specific quotas are not promised.

### Acceptance criteria for adopting later

- A new window reads live state and independently reproduces Issue #137/PR #146 status from GitHub (without the old child's report).
- One work item can go from latest main to bounded Draft/Preview using available tools without Codex; tool limitations are documented.
- A reviewer-required change cannot reach merge on only the window's own self-review; separate session or real reviewer evidence is traceable to fixed HEAD.
- User still approves precise PR/Preview and every high-risk Production data/rights/Auth/ads operation independently.
- A replacement window can reconstruct current work, stop gates and the absence of approval exclusively from repo/Issue/PR, with missing unpersisted decisions treated as STOP.
- Existing product invariants and canonical ordered backlog are unchanged.
