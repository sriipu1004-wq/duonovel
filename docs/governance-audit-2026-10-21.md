# LIB read governance / handoff gap audit — 2026-10-21

**Scope:** independent current-repo/GitHub/Production read-only inspection plus comparison of the user's separate [local-agent](https://github.com/sriipu1004-wq/local-agent) and [ai-fund-paper](https://github.com/sriipu1004-wq/ai-fund-paper) governance. **No Production DB, Storage, Auth, Stripe or release mutation.** This document records issues and risk-ranked dispositions; it is **not** authorization to implement every historic item.

## Confirmed recoverability gaps in the previous LIB read setup

| Finding | Verified evidence | Consequence | Disposition |
| --- | --- | --- | --- |
| **G1 HIGH — obsolete root status** | Root PROJECT_STATUS.md listed early play_logs and missing Search, rankings, author page, etc., plus old 1A–4A task owners. | A replacement parent could mistake early prototype work for today's priorities. | Archive its original bytes for history; convert root path into a prominent current-master redirect. |
| **G2 HIGH — bootstrap pinned to Child81** | docs/parent-chat-bootstrap.md told the new parent to proceed from Child80 to Child81/82/83; does not mention Child84 closure or Child85. | Unexpected parent death could restart completed milestones. | Replace with an evergreen, one-page recovery prompt relying on LIVE refs and PROJECT_MASTER.md. |
| **G3 HIGH — no persistent role ownership** | docs/development-workflow.md said one child owns one coherent workstream; Child84a–l were repeatedly created for narrowly split PR tasks. | More conversations, context lost, handoff chatter and self-review ambiguity. | Separate task numbers (Child84/85) from reusable S1–S4 specialist conversations and independent reviewer roles. |
| **G4 HIGH — parent-only chat state** | Operational decisions and approvals appeared in parent/child chats before permanent docs or PRs updated; no root current-control index. | A parent conversation crash can strand approvals or accepted deferrals. | Introduce stable PROJECT_MASTER.md + AGENTS.md, require durable checkpoints as work proceeds, recover live GitHub state rather than assuming an unseen approval. |
| **G5 MED — mixed historical and current claims** | docs/project-state.md now starts with Child84 CLOSED, but contains a long historical Child84 NOT DONE/Child85 BLOCKED snapshot further down; stale Last updated header. docs/roadmap.md also retains dated historical P4 notes. | Naive text search can wrongly reactivate blocked/closed work or claim verification. | Put authoritative recovery link at top, label historical evidence as dated, keep history intact and later slim project-state in a dedicated review (do not silently erase evidence now). |
| **G6 MED — five old Draft PRs not triaged in one place** | LIVE PRs #68/#79/#108/#130/#131 open on 2026-10-21. #68/#79/#108/#130 have old bases and non-mergeable state; #131 had previous Preview quota blockage. | Duplicate or stale changes may be merged into a later milestone. | Explicit pending-PR register in PROJECT_MASTER.md. #108 remains NO-GO; #130 overlaps merged #133, needs differential audit; #131 needs matching-HEAD Preview and independent review; #68/#79 are old governance/permission branches pending disposition. No new merge authorization. |
| **G7 MED — residual risk confusion** | PR #133 accepted Child84 operational closure, not certified E2E, Storage restore, Search SQL equivalence, timer cause, or Cron. | Future parent/child might incorrectly treat deferral as success. | Separate CLOSED / USER-DEFERRED / NOT VERIFIED / NO-GO in the main entrypoint. |
| **G8 MED — project instruction synchronization** | docs/chatgpt-project-instructions.md describes the old four-doc bootstrap; the actual ChatGPT Project settings are not writable from this repo review. | Publishing new repository instructions does not automatically change ChatGPT's configured Project instructions. | Keep the first four canonical files and add prominent root-master pointers there. Propose a matching copy/paste template for a later optional Project-settings update; do not assert settings changed. |

## Cross-project practices assessed

**Local Agent:** A fixed [Issue #257](https://github.com/sriipu1004-wq/local-agent/issues/257) is a permanent live parent entrypoint, backed by root AGENTS.md / PROJECT_MASTER.md and documented stable specialist chat slots. Assignments and separate independent review use **existing** chats. Its GitHub-refs sync distinguishes machine-observed metadata from parent-accepted progress. Adopt the fixed entrypoint, specialist reuse, explicit reviewer, and truth separation. **Do not copy** a very large single Issue narrative or grant its project's different automatic merge policy.

**AI Fund:** A fixed [Issue #63](https://github.com/sriipu1004-wq/ai-fund-paper/issues/63) contains versioned OPS decisions and evidence-specific STOP/GO. Append-only events keep research/accounting provenance separate from chat; stale prior operating modes are explicitly superseded. Adopt explicit current-vs-superseded markers, evidence provenance and frozen decision gates. **Do not copy** market-specific append-only accounting machinery into a novel website.

**For LIB read:** use a short repository-root entrypoint with links to specialized current state, ordered roadmap, binding decisions, and historical audit. This remains Git-reviewable and costs no extra plugin, repository, service or background workflow. Reassess creating a fixed operational Issue only if routine PR cadence shows root-state updates cannot be kept fresh; two concurrent truth stores would otherwise increase drift.

## Already preserved / not lost

- GitHub main PR #133 records Child84 operational closure with acknowledged residual risks; Production READY matches that merge.
- The Child85 chat was already created by the user; it is assigned to S3, not recreated.
- Stable product invariants in docs/decisions.md, rights ingestion guide and safety constraints remain operative.
- Previous PR descriptions, comments and merged commits preserve history and do not need to be pasted into new chats.

## Not proven by this audit

- Exhaustive correctness of **all** historical chat discussions; there is no claim that every past user approval is recoverable from GitHub.
- Authenticated Production Owner/Reader/R18/Human E2E, independent Storage bytes recovery, SQL Search ranking parity, or timer-delay root cause.
- That a ChatGPT chat has auto-received or executed a new assignment, or that any Project setting was updated merely by committing docs.
- That any Draft PR has a currently passing CI/Preview without rechecking its exact HEAD.

## Acceptance check for this governance update

- Root entrypoint exists and references exactly one current parent state page.
- Specialists S1–S4 are distinct from roadmapped Child85 and require parent assignment; review is independent when required.
- Parent recovery requires no farewell handoff; live GitHub/Production checks remain mandatory.
- Historical PROJECT_STATUS.md content is preserved but no longer claims present truth.
- Child84 CLOSED vs NOT VERIFIED and Child85 NEXT are distinguished.
- Current five open PR numbers have evidence-based dispositions, and no merge or DB/Storage write is implied.
- Roadmap order, product safety and original Draft → Preview → explicit approval → Production procedure remain unchanged.

Follow-up housekeeping (not auto-assigned): audit and disposition old PR #68/#79/#130; finish PR #131 Preview/review if still valuable; keep Cron #108 held. Do not interrupt Child85 for non-urgent paperwork once this index is accepted.

## G9 — Avoid self-induced Preview/deployment churn

This governance work initially used repeated per-file GitHub Contents commits. Vercel created or canceled several Preview builds for those successive commits while the separate Child85 implementation branch was also building. No damage or billing overage was verified, but this is unnecessary quota contention. Future coherent multi-file updates should use an atomic Git tree/commit where supported; verify final HEAD once, and do not infer a build/test result from intermediate commits. This process correction is recorded in the development workflow.
