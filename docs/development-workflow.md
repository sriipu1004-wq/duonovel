# LIB read — development, validation and release workflow

**CONTROL-R4, 2026-10-21. Single-operator ChatGPT window accepted.** Preserve ordered roadmap and explicit user release approvals. Historical CONTROL-R1/R2/R3 child dispatch text is superseded by this version. Use [operator control](../PROJECT_MASTER.md) and [risk/review classification](chat-operations.md).

## 1. Every new Issue, branch, major decision or restarted chat

Read `AGENTS.md`, `PROJECT_MASTER.md`, `docs/project-state.md`, `docs/roadmap.md`, `docs/decisions.md`, this file and `docs/chat-operations.md`; then independently verify current main, all open PRs/HEAD/CI/Preview, Production state and relevant Supabase. Do not treat dated counts, SHA, chat memory or unverified assumptions as current.

Check current roadmap objective and active checkpoint **before** adopting an issue: anti-tunnel-vision check for unresolved risks, dependencies, authorship, owner permission and rollback. Do not silently reprioritize roadmap; urgent incident override requires explicit recorded reason and previous task freeze.

## 2. Operator roles, serial phases and permitted direct tools

One ordinary ChatGPT window directly performs authorized investigation, code inspection, narrow implementation and GitHub/Vercel/Supabase work. S1 (Reader/Search), S2 (Auth/permissions), S3 (rights), S4 (reliability) are internal specialization checklists, not separate writers/reviewers.

**Always one authorized Issue/phase at a time.** Record active Work ID, scope, branch/base/HEAD, review requirement and STOP in Issue/PR. Draft PR/CI/Preview do not automatically initiate next Issue. Freeze current task before any incident preemption.

Workflow: latest main → isolated branch → bounded implementation → actual tests/typecheck/lint/build (record what could not execute) → Draft PR → matching-head CI/Vercel Preview → relevant independent review when risk gate requires → user sees exact change/Preview and **explicitly approves merge** → re-check HEAD and merge → verified Production SHA/READY and HTTP/user smoke → checkpoint.

No direct main commit in normal development, no automatic merge, no implicit user consent for Live DB/Auth/rights/ads/Cron, and no Production write from a docs-only PR. Source review ≠ CI pass ≠ Preview HTTP 200 ≠ real Owner/Reader/R18 E2E ≠ independent restore. No AI-generated invented test claims.

## 3. Independent review boundary

- For pure docs/ordinary nonpolicy copy/low-risk UI, self-check plus tests, Preview and user merge approval is normally sufficient.
- For changes to Auth/ownership/RLS, R18, private/public boundary, Human/AI permissions or credits, pricing, payments, deletion, content rights, Publication, Production data/schema/Storage, ads/privacy/provider/Cron, or indexing/cache/Search behavior that can alter visibility, **a genuinely distinct reviewer session/person must inspect a fixed PR HEAD**. Separate legal/domain review is mandatory where rights hinge on edition/source agreements.
- Switching the same window to another Sx role is SELF-CHECK, never independent review. GitHub Actions/Preview are machine evidence, not independent semantic/security review.
- Freeze author HEAD, supply independent reviewer exact diff/CI/Preview and scope of negative-case checks; it posts GO/FIX/NO-GO directly to PR/Issue without pushing author's branch. New commit after FIX invalidates review on previous HEAD, requiring targeted re-review. If no reviewer can be invoked, leave REVIEW_PENDING and don't merge.

## 4. Sensitive data and release

Require separately approved exact cohort/IDs and before/after count/audit for Production DB and Storage writes, migrations/backfills, deletion, permissions/rights approvals, Auth/RLS/provider activation, publication and ad/Cron activation. Maintain rollback route where appropriate. Do not blindly approve legacy `LIB read Official` rights or 36 rights-unverified public works.

Never improve performance by dropping correct search rows, choosing a wrong source/translation, lowering R18/ownership constraints, serving stale hidden work from a cache or skipping security. Measure before/after and represent sample sizes honestly. Use bounded queries, performance profiles, lazy loading and fine-grained reads when justified.

## 5. Fixed product invariants

AI novel/story generation retired. AI translation and Human translation have different permission/provenance/allowances and Human never calls OpenAI/AI credits. Human narration is not TTS. Reader modes exactly Original/Bilingual/Translation. UI locale, canonical source language and target reading language distinct; Search filters source language. PD rights must be verified with original work/source/edition/translator/correction evidence. No invented source, hashes, R18/author/user usage or unsupported retention claims.

## 6. Chat limits, Github checkpoints and tool choice

Before high-risk actions and at phase completion, write the checkpoint (Work ID/phase, source vs Production truth, branch/base/HEAD, tests, CI/Preview, review identity/outcome, explicit user approvals, unverified gaps, next stop) to Issue/PR and update only relevant canonical docs when durable product/roadmap state changes. If conversation ends unexpectedly, recover from root `AGENTS.md` and `PROJECT_MASTER.md` plus live GitHub/Production. Uncommitted chat-only state cannot be guaranteed; missing approval => STOP.

Prefer normal connected GitHub/Vercel/Supabase tools. Codex only for specific approved steps that cannot be verified/executed through available tools; no default Codex, Work, long-running autopilot or new paid infrastructure. A tool-limited local build/authenticated device test stays unverified until actually run. ChatGPT Project settings are separate from GitHub and require a user UI update.

## 7. Standard completion report

**Git/Production** — main/base, branch, exact PR HEAD, CI, Preview, merge and deployment status.
**Changed** — narrow actual behavior/schema/data.
**DB/Data** — migrations, affected cohort/count, authorized writes or zero.
**Preserved** — source-language, visibility, rights, credits, R18, owners and other invariants.
**Validation** — what executed (SOURCE/MOCK/CI/Preview/Production/E2E), sample sizes and failures.
**Remaining** — unknowns, deferred risks and blockers.
**Canonical docs updated** — exact files and pending UI instructions.
**Next** — precise issue, gate and required approval, no automatic commencement.

Approval such as "良い" must unambiguously concern the exact PR/Preview; when in doubt request scope-specific merge consent. Do not infer Production data authorization from a merge approval.
