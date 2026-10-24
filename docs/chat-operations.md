# LIB read — single-window operations and independent review

**CONTROL-R4, 2026-10-21: USER ADOPTED ordinary ChatGPT single-operator-window workflow.** This overrides earlier CONTROL-R1/R2/R3 requirements for four active physical specialist child chat instances, *not* the ordered roadmap, safety constraints or separate independent review. Old `docs/chat-launch-2026-10-21.md` startup packets are historical only. The GitHub Draft governance PR implements this accepted method; the actual ChatGPT Project Settings instruction requires a separate user/UI edit.

## Operator and role boundaries

- One ordinary ChatGPT conversation is the default operator, capable of direct source analysis, GitHub/Vercel/Supabase read-only inspection, isolated branch edits, tests (when executable), Draft PR and Preview evidence. It is NOT a constantly running background agent or Work.
- S1 Reader/Translation/Search; S2 Auth/RLS/owners/R18/billing; S3 Public Domain/provenance/rights; S4 Infra/performance/releases are **internal responsibility labels**. No ordinary task requires creating or messaging physical child chats. The operator must explicitly list affected labels and use the domain checklists.
- Assign one active Work/Issue and one **writer phase** at a time. Other Issues stay QUEUED. Existing Draft PRs are not implicit authorization to resume unrelated tasks. No sibling branch writer, automatic child dispatch, uncontrolled parallel Preview updates or roadmap reorder.
- The user alone approves product release/merge and high-risk Production actions. The operator tracks branches, PRs, staging, independent reviews and Production acceptance.

## Risk and independence

| Class | Example | Separate reviewer before release? |
| --- | --- | --- |
| Low | pure documentation, non-policy copy, isolated safe UI presentation | Normally not: source self-check, tests/Preview, explicit user merge approval suffice |
| Medium | metadata, SEO, search/Reader cache/performance behavior | Required when indexing, R18, publication, hidden content, entitlements, content-language or search parity could change |
| High | Auth/session, owner permissions, RLS, SECURITY DEFINER, R18, Human/AI credits/translation provenance, personal or private user data, account deletion, pricing/credit/payment | YES: independent session/person, negative-path tests, exact scope approvals |
| Rights/Data | PD source/edition/translation rights, content publication, migration/backfill, Storage/write/delete and irreversible actions | YES: separate rights/provenance/legal or data/security evidence appropriate to risk, human legal judgment where necessary, exact cohort approval |
| Provider/Policy | Google login, ads/consent, privacy/retention policies, Cron, crawler access policy | YES: distinct policy/security reviewer and explicit provider/activation authorization |

Same operator saying “now S1 reviews S4” is **self-review**, not independent. A truly separate review session/human must receive frozen PR HEAD/base, diff, guard checklist, matching CI/Preview; post GO/FIX/NO-GO to GitHub; and NOT modify the author branch. Review sessions are invoked only for an actual gate; the user should not be made to move full work reports between chats. The operator cannot claim it has invoked another ChatGPT conversation automatically. When none is accessible, maintain `REVIEW_PENDING` and do not merge.

**PR #146 / Issue #137 specifically:** S4 authored and stopped on HEAD `2d8cae74edea88e3425011d9a7b3950260e8aea6`. Its true independent Reader/Search/visibility SEO review is still PENDING; #137 does not become COMPLETE by governance adoption. Its remaining global AbortError timer root cause remains unknown.

## Standard phase contract

`QUEUED → READ_ONLY → IMPLEMENTING → DRAFT_PREVIEW → [REVIEW_PENDING / FIX] → USER_APPROVAL_PENDING → MERGED → PROD_VERIFIED` (also `BLOCKED`, `DEFERRED`).

At each phase boundary record in GitHub Issue/PR:
- Work ID, role/checklists, explicit user scope and excluded scope;
- current main SHA, branch, HEAD, PR, CI run IDs, Vercel Preview ID and Production deployment;
- data change class (none/read-only/explicitly approved exact cohort) and source security/rights evidence;
- author identity/context vs reviewer identity/context (distinct if independent required);
- tested paths, failing cases, risks, root causes still unknown and actual evidence level (SOURCE, MOCK, CI, Preview, signed-in E2E, Production);
- user **exact PR/HEAD/scope approval** and any separate Production/rights/ads/DB authorization; if lost/unverifiable, STOP;
- stop condition, rollback plan when applicable and next **authorized** action only.

An Issue label/checkpoint is a coordination record, not an asynchronous automation or guaranteed cross-actor mutex. Parent/operator does not issue two simultaneous writers. For urgent security/Production incident interrupt, freeze current HEAD and record it before switching tasks.

## Source of truth and recovery

Read `AGENTS.md` → `PROJECT_MASTER.md` → canonical `docs/project-state.md`, `docs/roadmap.md`, `docs/decisions.md`, `docs/development-workflow.md` → live GitHub/PR/Production/DB → active Issue evidence. Live provider state overrides dated chat snapshots about execution; explicit user approvals cannot be inferred from provider status. On new Issue, independently recheck full ordered roadmap and unresolved safety gates as an anti-tunnel-vision step. Never depend on previous conversation handoff.

If user interface Project instructions are stale, supply the exact current text from `docs/chatgpt-project-instructions.md`; the user changes ChatGPT Project Settings. GitHub cannot synchronize them through this workflow. Do not assert done until user verifies UI. Codex is optional for an explicitly scoped unsupported local test; do not automatically use Codex or Work/always-on orchestration.

## Mandatory single-answer status footer — response-status v1.1

See [response-status-protocol.md](response-status-protocol.md) for **all 17 exact state names**, precedence, the no-priority-work condition, and separate reviewer session handoff; this linked document is the sole detailed reporting-spec source. Work reports **end** in exactly three final lines: `【現在】`, `【次の行動】`, `【状態】` (one state only; no text after). This does not replace the normal report evidence fields below or supply permissions.

When real separate-session review is still **not requested**, use `独立監査依頼・作業継続/停止`; when a real request was issued to a distinct reviewer and its fixed-HEAD GO/FIX/NO-GO has not returned, use `独立監査待ち・作業継続/停止`. A reviewer who is actually unavailable is not claimed to be reviewing. The author provides the exact review packet and user steps, not a pretend automatic ChatGPT child dispatch. Without permitted same-Issue independent work, report `作業停止` and preserve HOLD. Never treat missing approval/blocked work as an exhausted roadmap.

## Default report

Git/Production, Changed, DB/Data, Preserved, Validation (type + exact evidence), Remaining, Canonical docs updated, Next, and explicit approvals/outstanding gates. Retain the former specialist report fields as work reporting, not physical chat identities.
