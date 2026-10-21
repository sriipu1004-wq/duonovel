# LIB read — Permanent Parent Recovery / Project Control

**Status entrypoint: CONTROL-R2 (2026-10-21).** This is the one-file bootstrap for an abruptly terminated parent chat. Read [AGENTS.md](AGENTS.md), this document, and then the linked canonical files. **This is a last-reviewed snapshot, not an automatically synchronized live dashboard.**

- Repository: [sriipu1004-wq/duonovel](https://github.com/sriipu1004-wq/duonovel)
- Production: https://www.syosetu-libread.com
- Last verified main before this operator-reset review: 37650ac9b391c1a76f597751ea44c6110541a697 (2026-10-21).
- Last verified Production: dpl_3Zhkw9WLfYmdzChM2LRRQDNLpXCL, READY, same commit.
- **FIRST ACTION ON EVERY RESTART:** fetch LIVE main, all open PR HEADs/status, Production state and any relevant DB state. Never assume this snapshot is current.
- Product facts: [docs/project-state.md](docs/project-state.md); backlog order: [docs/roadmap.md](docs/roadmap.md); binding product decisions: [docs/decisions.md](docs/decisions.md); execution rules: [docs/development-workflow.md](docs/development-workflow.md).
- Specialist ownership and chat lifecycle: [docs/chat-operations.md](docs/chat-operations.md). Findings from reviewing earlier gaps: [docs/governance-audit-2026-10-21.md](docs/governance-audit-2026-10-21.md).

## Live-verified operator checkpoint (2026-10-21; reverify before action)

- Last verified `main` **`37650ac9b391c1a76f597751ea44c6110541a697`**; Vercel Production `dpl_3Zhkw9WLfYmdzChM2LRRQDNLpXCL` **READY**, same commit. These are snapshots, not a live sync.
- PR [#135](https://github.com/sriipu1004-wq/duonovel/pull/135) **MERGED** on main: exactly **ten source-prepared, rights-pending Aozora manifests / 39 prepared chapters** plus ingestion preflight. **0 approved / 0 Production imported/published. Child85 P5 remains OPEN.** Never describe the old merged PR as still Draft or confuse source-prepared with rights-approved.
- Read-only Supabase checkpoint: 123 series / 120 public / 3 private, public JA/EN/KO 40 each, 84 public rightsChecked / **36 JA legacy unverified**, 3,284 public posted episodes, 0 Human translations, 0 active billing subscriptions, 9 non-soft-deleted Auth accounts, 4,728 Storage objects (~30.19 GB). These are date-bound counts, not automatic metrics.
- Vercel runtime errors included `AbortError` during public-cache revalidation across Reader/Search/Works: **triage required**, not proof of data leak or global outage. Supabase Advisor listed leaked-password protection disabled and ten authenticated-executable SECURITY DEFINER RPC warnings: **review contracts before changing grants**, not a demonstrated exploit. Independent DB/Storage restoration and real-session E2E remain user-deferred/unverified; #108 Cron still NO-GO.
- User directed on 2026-10-21: **retire/archive ALL old child chat instances (including the old Child85), establish the S1–S4 post-reset specialist roles (reusing any active post-reset instance, creating one only if missing/archived/capped), and triage current problems.** Previous S1–S4 role names remain useful, but **no previous chat instance is active**. ChatGPT UI archive operation is not available through this connector; user-performed per-chat archive remains outstanding and must not be reported complete.
- Ordered roadmap: P5 Child85 → P6 Child86 → **P7 Google sign-in** → **P8 AdSense publisher ads** → P9 acquisition → P10 minimal analytics. Documented in the **Draft governance PR replacing #136** until explicitly merged; no OAuth or ads feature is deployed merely by this decision.

## New-child GitHub work registry

| Priority/owner | Work issue |
| --- | --- |
| R0/S4 | [Production AbortError](https://github.com/sriipu1004-wq/duonovel/issues/137) |
| R0/S2 | [Auth/RPC security audit](https://github.com/sriipu1004-wq/duonovel/issues/138) |
| P5/S3 | [Child85 rights review and 3–6 candidate gate](https://github.com/sriipu1004-wq/duonovel/issues/139) |
| P5/S1 | [Aozora annotation Reader fidelity](https://github.com/sriipu1004-wq/duonovel/issues/140) |
| P6/S4 | [Child86 scale, backup and observability](https://github.com/sriipu1004-wq/duonovel/issues/141) |
| P7/S2 | [Google OAuth sign-in](https://github.com/sriipu1004-wq/duonovel/issues/142) |
| P8/S4 | [AdSense eligibility and cautious placement](https://github.com/sriipu1004-wq/duonovel/issues/143) |
| OPS/Parent | [Legacy PR/docs/chat cleanup](https://github.com/sriipu1004-wq/duonovel/issues/144) |

**Specialist startup:** [docs/chat-launch-2026-10-21.md](docs/chat-launch-2026-10-21.md). User must archive old legacy children individually and send each packet to the matching active post-reset Sx chat; only create a missing or context-limited successor. Assign tasks to post-reset chat ONLY; GitHub issues are not asynchronous agents. Preserve implementation vs independent reviewer roles; parent controls cross-scope approval and merges.

## Open/closed PR audit (2026-10-21 snapshot)

- [#68](https://github.com/sriipu1004-wq/duonovel/pull/68) **CLOSED UNMERGED** (2026-10-21), old Human translation permission/default proposal deemed unsafe to blindly adopt; future S2/S1 design only.
- [#79](https://github.com/sriipu1004-wq/duonovel/pull/79) **CLOSED UNMERGED** (2026-10-21), exact one-line governance status already in main.
- [#108](https://github.com/sriipu1004-wq/duonovel/pull/108) scheduled publication Cron Draft, non-mergeable and **NO-GO**: no activation.
- [#130](https://github.com/sriipu1004-wq/duonovel/pull/130) **CLOSED UNMERGED** (2026-10-21), accepted restore deferral already in #133; detailed source kept as history.
- [#131](https://github.com/sriipu1004-wq/duonovel/pull/131) SEO query Draft, currently non-mergeable after #135: rebase/retest if still useful.
- [#136](https://github.com/sriipu1004-wq/duonovel/pull/136) Google login + AdSense documentation Draft, **superseded by consolidated reset PR on approval**; do not merge both.
- [#135](https://github.com/sriipu1004-wq/duonovel/pull/135) **MERGED**. Do not put it back into open-PR list.

Open PR states, bases, merges and branches must be refreshed from GitHub, never assumed from this register.

## Active post-reset specialist slots — all pre-reset children retired

| New slot | New chat name | Scope / first issue |
| --- | --- | --- |
| S1 | 新子S1_Reader・翻訳・検索品質 | Reader fidelity [#140](https://github.com/sriipu1004-wq/duonovel/issues/140); reviewer for S4 public-cache changes |
| S2 | 新子S2_認証・権限・ユーザーデータ | Security [#138](https://github.com/sriipu1004-wq/duonovel/issues/138), later OAuth [#142](https://github.com/sriipu1004-wq/duonovel/issues/142) |
| S3 | 新子S3_Public Domain・出典・権利 | Child85 continuation [#139](https://github.com/sriipu1004-wq/duonovel/issues/139) after old Child85 archived |
| S4 | 新子S4_インフラ・性能・リリース | Production reliability [#137](https://github.com/sriipu1004-wq/duonovel/issues/137), later Child86 [#141](https://github.com/sriipu1004-wq/duonovel/issues/141), AdSense [#143](https://github.com/sriipu1004-wq/duonovel/issues/143) |

Dedicated S5 audit chat is **not** required now; independent reviewers must be other new specialists and/or parent. All legacy pre-reset child chats are READ-ONLY historical references after archival and must never be treated as active assignees. One active post-reset chat per slot; if it already exists, send instructions there, else create exactly one new successor. No shared chat URLs have been verified.

## Parent crash / replacement — deterministic recovery

1. Open this fixed file from repository root; do not wait for the previous parent to author a handoff.
2. Verify live main SHA, 100% of open PRs, relevant PR diffs/CI, Vercel Production and (when material) Supabase. Obtain provider evidence, not just child claims.
3. Reconcile accepted decisions and gates against the top of project-state and the roadmap. **Last checked != currently verified.** Resolve contradictory history explicitly.
4. Review the open PR control table and update it from observed reality; distinguish CLOSED, OPEN, superseded, blocked, reviewed, approved, MERGED, Preview READY and Production READY.
5. Confirm which persistent S1–S4 specialist owns the next roadmap step. Check its last PR/comments and specialist checkpoint; do not duplicate work or automatically start a new chat.
6. If the previous chat stopped between a user approval and a merge, verify exact approval scope and live HEAD; do not infer authority from this document. When uncertain, leave Draft and ask only for that specific release decision.
7. Record **accepted durable** owner, roadmap, safety/deferral, and release decisions in this file at a parent checkpoint, ideally within the relevant governance/product PR. Record routine per-commit CI, PR and Preview checkpoints in the task PR/Issue instead; do not make every parallel specialist branch edit this shared parent file or burn deployment quota. After an unexpected parent crash, reconstruct intervening work from live PRs/GitHub/Production; files do not update themselves.

**Truth precedence:** latest explicit user intent and signed-off choices (within authorized scope) → independently verified GitHub/Production/DB facts about actual execution → [docs/decisions.md](docs/decisions.md) for binding product contracts and [docs/roadmap.md](docs/roadmap.md) for ordered priority → [docs/project-state.md](docs/project-state.md) for current product description → named source audit/release evidence → dated historical docs → chat summaries. Operational reality does not by itself authorize a new product decision, data write, merge or rights reclassification.

## Acceptance and checkpoint contract

- Before branch/PR: specify Work ID, specialist Sx, exact scope, base SHA, owner, **independent reviewer**, risk level, evidence requirements and stop/return conditions.
- At meaningful checkpoints: attach exact commit/Preview/CI and remaining conditions to the same task PR/Issue, **not a chain of disposable chat transcripts**.
- On finish or accepted deferral: record Git/Production, Changed, DB/Data, Preserved, Validation, Remaining, Canonical docs updated, Next; distinguish user waiver from test PASS.
- Parent decides when to change roadmap, accept release, revisit deferred risks, and assign the next milestone. A child does not assign another child or reprioritize itself.
- No background processing follows from assignment; execution happens only when the selected conversation is actually invoked.
- Every implementation follows existing Draft → Preview → explicit approval → merge → Production smoke. Every Production data/rights permission change additionally needs exact cohort, count, reversibility and separate explicit authorization.

This page stays short/current. Long rationale is in [decisions](docs/decisions.md), previous evidence in audit files and PRs, not appended forever to this entrypoint.
