# LIB read — Permanent Parent Recovery / Project Control

**Status entrypoint: CONTROL-R1 (2026-10-21).** This is the one-file bootstrap for an abruptly terminated parent chat. Read [AGENTS.md](AGENTS.md), this document, and then the linked canonical files. **This is a last-reviewed snapshot, not an automatically synchronized live dashboard.**

- Repository: [sriipu1004-wq/duonovel](https://github.com/sriipu1004-wq/duonovel)
- Production: https://www.syosetu-libread.com
- Last independently observed main before this governance branch: 9c34659ca167ead0c860456437bd5fe8fe9086d2 (2026-10-21).
- Last independently observed Production: dpl_3DVLLda3DYfcZ8cQKJwLXFmmN6H2, READY, same commit.
- **FIRST ACTION ON EVERY RESTART:** fetch LIVE main, all open PR HEADs/status, Production state and any relevant DB state. Never assume this snapshot is current.
- Product facts: [docs/project-state.md](docs/project-state.md); backlog order: [docs/roadmap.md](docs/roadmap.md); binding product decisions: [docs/decisions.md](docs/decisions.md); execution rules: [docs/development-workflow.md](docs/development-workflow.md).
- Specialist ownership and chat lifecycle: [docs/chat-operations.md](docs/chat-operations.md). Findings from reviewing earlier gaps: [docs/governance-audit-2026-10-21.md](docs/governance-audit-2026-10-21.md).

## Current accepted workstream disposition (verify GitHub live)

1. **P4 / Child84:** operationally CLOSED with accepted verification deferrals, **NOT** technically certified. Decision: [docs/child84-operational-closure.md](docs/child84-operational-closure.md); main merged PR #133. Historic text deeper in project-state/roadmap saying Child84 NOT DONE is a dated snapshot, not an order to restart it.
2. **P5 / Child85:** NEXT/assigned to the existing conversation **子85_Public Domain権利・出典確認済み作品の段階的追加**. The user confirms this chat was already created. A Child85 pilot-preflight Git branch and queued/building Preview deployments were independently observed on 2026-10-21, but no child completion or validated final Preview has been accepted here; **do not create another Child85 chat by default**. The standing specialist is **S3 Rights & Content**.
3. **P6 / Child86:** after Child85, Production scale/performance acceptance. Do not pre-certify post-expansion performance.
4. **Child84 deferrals:** authenticated Owner/Reader/R18/Human-translation E2E NOT VERIFIED; independent DB restoration and ~30GB Storage byte recovery **user-deferred** (not RESTORE PASS); public DB timer callback root cause UNKNOWN; Search full SQL ranking/facet parity unproven and **NO SQL CUTOVER**; permanent user-erasure workflow unimplemented; scheduled-publication Cron #108 not deployed. Do not silently revive any closed workstream or confuse risk acceptance with successful testing.

Production read-only corpus snapshot from 2026-10-21, **not a guaranteed live count**: 123 works / 120 public / 3 private; 84 public rightsChecked; 36 public without that flag (never batch-approve); public JA/EN/KO 40 each. Rights provenance and source details require item-by-item current verification.

## Open PR control — last observed 2026-10-21 (always re-query)

| PR | Position at last check | Re-entry disposition |
| --- | --- | --- |
| [#68](https://github.com/sriipu1004-wq/duonovel/pull/68) | Legacy Draft; old base, non-mergeable | Compare current Human-translation code; archive/close or replace only after explicit review, never merge stale permission code. |
| [#79](https://github.com/sriipu1004-wq/duonovel/pull/79) | Legacy one-file governance Draft; old base, non-mergeable | Audit against latest roadmap; do not overwrite current priority/status. |
| [#108](https://github.com/sriipu1004-wq/duonovel/pull/108) | Scheduled-publication Cron Draft; old base, non-mergeable | **NO-GO / do not deploy** without separate security/release decision. |
| [#130](https://github.com/sriipu1004-wq/duonovel/pull/130) | Child84k backup-deferral documentation Draft; old base, non-mergeable | Some content now covered by merged #133; compare precisely before close, cherry-pick or merge; no duplicate or contradictory decision. |
| [#131](https://github.com/sriipu1004-wq/duonovel/pull/131) | Work SEO single-ID optimization Draft; last checked mergeable | Exact-HEAD GitHub CI PASS, matching-head Vercel Preview **not established** (Hobby quota at that time); rebase/retest/review before considering merge. |

**A Draft PR is neither approved nor Production.** The presence of an open PR does not itself justify interrupting the Child85 roadmap. Parent assigns a reviewer and decides scope; never blindly merge old work.

## Permanent specialist conversations (roles, not task numbers)

| Slot | Reuse this same conversation for | Current routing |
| --- | --- | --- |
| **S1 — Reader / Translation / Search UX** | Reader, AI-vs-Human translation presentation, localization, Search correctness, reading UI | Available when parent assigns; no need to start a replacement immediately. |
| **S2 — Auth / Authors / User Data & Rights Enforcement** | Author publishing, ownership, R18, consent, deletion, private library, data security | Available; high-risk changes require independent review. |
| **S3 — Public Domain / Content Provenance** | Original texts, source/licence audits, manifests, cautious batches, text rights | **Child85 assigned to the already-created 子85 conversation**. |
| **S4 — Infrastructure / Reliability / Release** | Next.js/Vercel, Supabase, performance, caches, deploy, backup risk, observability | Available; Cron remains NO-GO. |

Independent QA/security review is a **separate reviewer role**, usually parent or a non-author specialist. Create a separate persistent QA conversation only when recurring independent reviews justify it; naming the author twice does not provide independence. Parent owns priority, conflicts and final acceptance.

**A specialist continues on multiple relevant PRs and future roadmapped tasks**. When a chat reaches length limits, create **Sx successor v2** retaining the same slot; leave a checkpoint in GitHub and update the slot's locator if provided. Do not create a new chat for each Child84a/b/c or PR. Existing historical chats stay as references. No stable ChatGPT conversation URL has been supplied; never invent one.

## Parent crash / replacement — deterministic recovery

1. Open this fixed file from repository root; do not wait for the previous parent to author a handoff.
2. Verify live main SHA, 100% of open PRs, relevant PR diffs/CI, Vercel Production and (when material) Supabase. Obtain provider evidence, not just child claims.
3. Reconcile accepted decisions and gates against the top of project-state and the roadmap. **Last checked != currently verified.** Resolve contradictory history explicitly.
4. Review the open PR control table and update it from observed reality; distinguish CLOSED, OPEN, superseded, blocked, reviewed, approved, MERGED, Preview READY and Production READY.
5. Confirm which persistent S1–S4 specialist owns the next roadmap step. Check its last PR/comments and specialist checkpoint; do not duplicate work or automatically start a new chat.
6. If the previous chat stopped between a user approval and a merge, verify exact approval scope and live HEAD; do not infer authority from this document. When uncertain, leave Draft and ask only for that specific release decision.
7. Write accepted new state back into this file **in the same PR** as durable work, and adjust feature docs and decisions/roadmap only as warranted. For a sudden parent crash, reconstruct from GitHub; files cannot auto-update from unseen chat messages.

**Truth precedence:** latest explicit user intent and signed-off choices (within authorized scope) → independently verified GitHub/Production/DB facts about actual execution → [docs/decisions.md](docs/decisions.md) for binding product contracts and [docs/roadmap.md](docs/roadmap.md) for ordered priority → [docs/project-state.md](docs/project-state.md) for current product description → named source audit/release evidence → dated historical docs → chat summaries. Operational reality does not by itself authorize a new product decision, data write, merge or rights reclassification.

## Acceptance and checkpoint contract

- Before branch/PR: specify Work ID, specialist Sx, exact scope, base SHA, owner, **independent reviewer**, risk level, evidence requirements and stop/return conditions.
- At meaningful checkpoints: attach exact commit/Preview/CI and remaining conditions to the same task PR/Issue, **not a chain of disposable chat transcripts**.
- On finish or accepted deferral: record Git/Production, Changed, DB/Data, Preserved, Validation, Remaining, Canonical docs updated, Next; distinguish user waiver from test PASS.
- Parent decides when to change roadmap, accept release, revisit deferred risks, and assign the next milestone. A child does not assign another child or reprioritize itself.
- No background processing follows from assignment; execution happens only when the selected conversation is actually invoked.
- Every implementation follows existing Draft → Preview → explicit approval → merge → Production smoke. Every Production data/rights permission change additionally needs exact cohort, count, reversibility and separate explicit authorization.

This page stays short/current. Long rationale is in [decisions](docs/decisions.md), previous evidence in audit files and PRs, not appended forever to this entrypoint.
