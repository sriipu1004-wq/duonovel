# LIB read — Persistent Specialist Chats and Parent Control

**Effective controls: 2026-10-21, CONTROL-R2 (supersedes prior child conversation assignments).** [Permanent parent-recovery entrypoint](../PROJECT_MASTER.md). This document specifies how to run chats, **not** a new roadmap or permission to perform background work.

## CONTROL-R2 — Legacy chat retirement and NEW specialist instances (user direction, 2026-10-21)

**Override of the previous conversation-reuse assignment:** every existing child ChatGPT conversation, including old Child85, is designated **retired**. This is an operating decision and does **not** itself archive the conversation in the ChatGPT UI. No available connector archives project chats, so the user must perform that operation individually in the Project chat list. Do not use the global archive-all control if it would also archive parent/unrelated chats. Do not falsely claim UI archive success.

For each new specialist slot, **reuse an active post-reset Sx conversation if one exists**. Only when missing, archived, or at the context limit should a new same-slot chat or successor be created using [conditional dispatch packets](chat-launch-2026-10-21.md). Names are `新子S1_Reader・翻訳・検索品質`, `新子S2_認証・権限・ユーザーデータ`, `新子S3_Public Domain・出典・権利`, `新子S4_インフラ・性能・リリース` (append a version suffix for later successors). The slots remain persistent **after this one-time reset**; never reuse pre-reset legacy threads. The old Child85 **workstream is still P5 OPEN** even though its PR #135 merged and its old conversation retired. Existing source/checkpoint state lives in GitHub and remains accessible.

- R0 parallel triage: S4 [#137](https://github.com/sriipu1004-wq/duonovel/issues/137) Production cache `AbortError`, S2 [#138](https://github.com/sriipu1004-wq/duonovel/issues/138) Auth/RPC security. Neither authorizes unsupervised Production change.
- P5: S3 [#139](https://github.com/sriipu1004-wq/duonovel/issues/139) rights and bounded cohort; S1 [#140](https://github.com/sriipu1004-wq/duonovel/issues/140) Reader annotation fidelity.
- P6: S4 [#141](https://github.com/sriipu1004-wq/duonovel/issues/141) scale verification after actual rights-approved corpus expansion.
- P7/P8: S2 [#142](https://github.com/sriipu1004-wq/duonovel/issues/142) Google OAuth; S4 [#143](https://github.com/sriipu1004-wq/duonovel/issues/143) Google AdSense policy/placement.
- Parent [#144](https://github.com/sriipu1004-wq/duonovel/issues/144) tracks obsolete PRs, deferred risks, canonical snapshot and ChatGPT UI archive completion.

**Sending a message to an existing chat and opening a missing or capped successor are ChatGPT UI actions, not GitHub operations.** An Issue/PR, status update, or assignment never starts background work. Assign a distinct reviewer per cross-cutting change; this remains the existing merge/Preview/Production protocol.

## Two separate identifiers

- **Work ID** = roadmap phase/Child85, incident, issue or PR. It identifies the *task*, has an acceptance gate and can be completed, paused or deferred.
- **Specialist slot S1–S4** = persistent *responsibility area*; keep reusing the same actual ChatGPT conversation for successive tasks in that area. The chat has expertise but **no independent release authority**.
- **Conversation instance** = actual ChatGPT chat. It can hit message limits. Replacing that instance should not replace the specialist slot or task history; only a verified successor checkpoint changes.
- Child84a–l are **historical task-instance labels**, not a mandate to create a new specialist conversation for every PR.

## Responsibility / assignment table

| Slot | Core scope | Typical review partner | Current assignment |
| --- | --- | --- | --- |
| S1 Reader / Translation / Search UX | Reader modes, translation source/presentation, source-language Search, UI locale, metadata UX | S2 for auth/entitlement, S4 for performance | Use active post-reset S1 if available; otherwise create successor per launch packet |
| S2 Auth / Authors / User Data | Author posting, publication/ownership, R18, Human permissions, deletion, billing coupling, private library | S1 for UX; S4 or parent for independent security | Use active post-reset S2 if available; otherwise create successor |
| S3 Public Domain / Provenance | Candidate rights, edition/translators, original byte sources and hashes, manifests, staged Official Draft import | S2 for rights/publication/R18; S4 for Production data | Child85 continues in active post-reset S3, or new S3 if missing; old Child85 retired |
| S4 Infrastructure / Reliability / Deployments | Vercel, Supabase, observability, cache, DB reliability, performance, CI and safe releases | S1 or S2 as independent source reviewer | Use active post-reset S4 if available; otherwise create successor; Issue #137 first |

Cross-domain tasks: parent assigns **one implementer slot, one distinct reviewer** and a fixed acceptance contract. For high-risk Auth/credits/rights/data writes, independent reviewer and parent release gate are required. Independent review cannot be the same chat asserting its own tests are independent. Dedicated S5 Audit is **optional**, established only if repeated independent work justifies keeping that conversation active.

## Chat reuse and lifecycle

1. **Parent assignment**: name the roadmap Work ID and permanent specialist slot. Give latest canonical entrypoint, intended outcome, explicit allowed operations, risk level, reviewer, stop conditions and current PR/branch (if any).
2. **Start or resume**: reuse an active **post-reset Sx chat**; create a successor only if it is missing, archived, or at context limit, read the current parent entrypoint, verify main/Production/open PR, and check last checkpoint. The specialist may work through multiple coherent PRs without a fresh chat.
3. **Continue internally** until the defined acceptance or parent-return gate. Do not send the user back to the parent after each passing test, and do not pick a new roadmap item yourself.
4. **Return to parent** only if milestone accepted/blocked, cross-specialty decision needed, release authorization needed, change to roadmap/security/product contract, or context limit reached.
5. **At length limit**: create exactly one successor for the same Sx role, not a new generic Child number. Record pending task, evidence/PR URLs, last verified commit, remaining blockers, and chat locator if provided in the parent-entrypoint registry. Keep old conversation as history; new chat is explicitly a successor.
6. Never claim that a GitHub assignment/comment schedules a ChatGPT child or runs work in the background. The user or agent must invoke that chat; connections are not automatic.

A new specialist conversation should be created only if no appropriate slot exists and recurring expertise materially needs a separate context. Do not proliferate chats solely because one review/PR is long.

## Parent-only responsibilities

- Roadmap order and priorities remain **docs/roadmap.md**. The parent controls every reprioritization or approved exception.
- Parent maintains **PROJECT_MASTER.md** as the recoverable current operational index and selects Sx assignment; one child cannot assign other child chats.
- Parent verifies real merge and Production, handles cross-feature and rights decisions, accepts or rejects child evidence, controls approved deferrals and risk gates.
- Parent reconciles open PRs regularly, especially stale Drafts and superseded branches; statuses are not accepted from old chat reports alone. Routine HEAD/CI/Preview updates belong in the specific PR/Issue; only accepted durable milestone/owner/decision changes require updating the shared PROJECT_MASTER.md. This avoids concurrent specialist merge conflicts and needless Preview rebuilds.
- Parent should not allow its own chat to become the only home for a decision. Persist relevant approved state before ending each consequential interaction.
- If interrupted unexpectedly, any new parent can bootstrap by reading one root file and checking live GitHub/Vercel state. Do not require a specially composed farewell message from the previous parent.

## Compact assignment packet (copy into the existing Sx chat)

- Parent control: PROJECT_MASTER.md; work ID and Sx role; PR/branch if already exists.
- Goal and acceptance tests: measurable outputs, no success by proxy.
- Explicit scope / excluded scope and stability constraints.
- Last independently observed main and Production (date stamped, reverify immediately).
- Exact reviewer and requirement for user Preview/Production/data approval.
- DB/Data: allowed access class, exact cohorts, cost limits and no secret leaks.
- Stop/return conditions and state checkpoint destination (PR/Issue + canonical docs).

## Checkpoint and handoff contract

Every meaningful implementer or reviewer checkpoint reports:

**Git/Production**, **Changed**, **DB/Data**, **Preserved**, **Validation and evidence type** (SOURCE / MOCK / READ-ONLY / Preview / signed-in E2E / Production), **Remaining and blockers**, **Approvals consumed or outstanding**, **Canonical docs updated**, **Next within same scope**.

Use exact HEAD, CI run URL and Preview deployment ID whenever available, plus whether the user approved that exact scope; stale snapshots must be labeled. If a workstream changes a lasting product or operational fact, include its canonical updates in the same Draft PR. **A snapshot marked complete is not evidence of an unexecuted E2E, restore or deploy.**

## Restart and state precedence

Read [PROJECT_MASTER.md](../PROJECT_MASTER.md) → [docs/project-state.md](project-state.md), [docs/roadmap.md](roadmap.md), [docs/decisions.md](decisions.md), [docs/development-workflow.md](development-workflow.md) → relevant feature evidence → **live** GitHub main/PRs, Vercel Production and required data. Report conflicts, resolve by evidence type, and only then act.

The current main is authoritative for what code was merged, but a READY Production SHA verifies what was deployed; neither is proof of a request-specific runtime behavior without a matching test. A file or user choice may close a task with outstanding risk; it must never silently convert missing verification to PASS.
