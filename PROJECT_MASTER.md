# LIB read — durable recovery / single operator control

**CONTROL-R4 (accepted single-window operating design, 2026-10-21).** Root entrypoint for an unexpectedly ended operator conversation. Status values here are dated snapshots: **ALWAYS independently recheck live GitHub/Production/Supabase before taking action.** User approval to *adopt an operating method* does not authorize merging any pending PR or performing Production changes.

- Repo: https://github.com/sriipu1004-wq/duonovel
- Production: https://www.syosetu-libread.com
- Read: [AGENTS.md](AGENTS.md), [project-state](docs/project-state.md), [ordered roadmap](docs/roadmap.md), [decisions](docs/decisions.md), [development workflow](docs/development-workflow.md), [chat operations](docs/chat-operations.md).
- Stable product and safety boundaries are in AGENTS and canonical docs; prefer live evidence to old chat claims.

## Live-verified snapshot (2026-10-21, update only after external checks)

- GitHub main `37650ac9b391c1a76f597751ea44c6110541a697` and Vercel Production `dpl_3Zhkw9WLfYmdzChM2LRRQDNLpXCL` READY on that same commit. No governance Draft or Issue #137 fix is yet Production.
- Supabase `nyxbnccuvmlzffgtdadi`: ACTIVE_HEALTHY as last checked. Last READ-ONLY database checkpoint: 123 series, 120 public, 3 private; 84 public rightsChecked and 36 JA legacy unverified; 3,284 episodes, zero Human-translation rows, zero active/trialing subscriptions; Storage ~30 GB snapshot. These are not unique-user or real-audio claims and not proof of restore/E2E.
- PR #135 **MERGED** into current main, source-prepared 10 Aozora manifests / 39 chapters; all `rights_status=pending` / `approved=false`; zero new rights approvals, Production Draft imports or publications. P5 Child85 remains open.
- Production cache revalidation `AbortError` and unusually late timer callbacks still not root-caused; an `ACTIVE_HEALTHY` DB doesn't prove 5xx-free application operation.
- Accepted historical deferrals: real signed-in Owner/Reader/R18/Human E2E; full independent DB and ~30 GB Storage bytes restore; Search SQL >1000 full parity (NO CUTOVER); timer root cause; deletion process; scheduled Cron PR #108 **NO-GO**.

## CURRENT WORK LOCK — STOP at independent-review gate

**User-approved operating method is now ONE ordinary ChatGPT operator window with internal S1–S4 scope labels.** Old pre-reset child conversations are historical references. S4 completed a **physical legacy-author phase** for Issue #137 and STOPPED. No new Issue authoring/implementation has been authorized on the basis of this switch.

- Active Work ID: [Issue #137](https://github.com/sriipu1004-wq/duonovel/issues/137), authored/frozen S4 [Draft PR #146](https://github.com/sriipu1004-wq/duonovel/pull/146), base main `37650ac9b391c1a76f597751ea44c6110541a697`, exact HEAD `2d8cae74edea88e3425011d9a7b3950260e8aea6`.
- PR #146 exact-head GitHub workflow checks 3/3 SUCCESS; Vercel Preview `dpl_GUCibV6ZNM6zBZAqP6BqfDChRaid` READY. Scope: EN/KO one-ID Work metadata and JA episode-public SEO predicate; **not a fix for the global AbortError/timer root cause**. No Production data/DB/config writes.
- **Next required gate: genuinely independent Reader/Search/rights/visibility review of PR #146's frozen HEAD.** Same-window switching to “S1” does NOT count. Until separate reviewer evidence is recorded, REVIEW_PENDING, no merge or release; other Issues still queued. Reviewer must not push author's branch. On FIX, return the task to operator for bounded implementation/new-HEAD review; on GO, seek explicit user merge approval and verify Production after approved merge.
- Old [Draft #131](https://github.com/sriipu1004-wq/duonovel/pull/131) is candidate reference only, not automatically merged.

## Governance / Draft PR resolution (not yet merged)

- [PR #147](https://github.com/sriipu1004-wq/duonovel/pull/147): **OPEN/DRAFT, targeted directly at main**; single-window CONTROL-R4 governance and Project Settings copy, 13 documentation files, pending user-specific explicit merge approval. Project Settings UI is **not automatically synchronized**.
- [PR #145](https://github.com/sriipu1004-wq/duonovel/pull/145): **CLOSED UNMERGED**, superseded by #147 after exact changed-file coverage check.
- [PR #136](https://github.com/sriipu1004-wq/duonovel/pull/136): **CLOSED UNMERGED**, Google OAuth/AdSense plan carried forward into #147's roadmap/decisions; no provider/ad activation authorized.
- [PR #108](https://github.com/sriipu1004-wq/duonovel/pull/108): Cron Draft NO-GO. Never activate without separate security/release decision.
- Issue #144 tracks outstanding ChatGPT Project UI instruction alignment and legacy chat archival; a GitHub commit cannot change the actual Project Settings text.
- Approved *planning* order: P5 Child85 rights/edition, P6 Child86 scale, P7 Google OAuth, P8 publisher AdSense, P9 acquisition, P10 minimal analytics; R0 incident/security safety triage may precede but **not execute concurrently**. `docs/roadmap.md` is canonical and not changed by one-window adoption.

## Internal specialist responsibility register

| Role label (not a separate ordinary chat) | Area | Queued issue |
| --- | --- | --- |
| S1 | Reader, AI/Human translation fidelity, Search/source-language, SEO UX | #140; independent PR #146 review is **separate reviewer SESSION**, not self-review |
| S2 | Supabase Auth, author/user permissions, account data, R18, billing boundaries | #138 urgent security audit; #142 Google OAuth after P6 |
| S3 | Public Domain rights, exact sources/editions, manifests and controlled Draft cohort | #139, Child85 P5 |
| S4 | Vercel/DB performance, caching, infra, release | #137 review pending; #141 after expansion; #143 AdSense after P7 |

No Issue begins simply because it is on this table. One active Work ID; parent/user authorization and a stored checkpoint before any next action. No parallel writers.

## Independent reviews and user approvals

- A separate review session or genuinely independent human **must** retrieve the fixed source PR/HEAD and test failure, private/public, R18, owner and locale semantics. It writes GO/FIX/NO-GO to that PR/Issue directly. Do not invent a review if none was executed.
- User explicitly approves the **actual change and Preview** for each merge; for high-risk Production DB/Storage, Auth/RLS/provider, rights approval, publication, payment or advertising activation, require **separate** authorization of exact scope/cohort. Green CI alone is insufficient.
- Routine lower-risk docs/UI changes can pass source self-checks/tests/Preview and user merge approval; self-check must be labeled as self-check, not independent review.

## Crash or context-limit bootstrap

1. Read this file, AGENTS and all four canonical files plus chat-operations; this replaces asking prior operator/child for a handoff.
2. Verify latest main and every Open PR HEAD/status/CI/Preview, Production deployment SHA/READY and relevant Supabase read-only counts; check if any external reviewer/action is actually pending. A snapshot here is not a live dashboard.
3. Read active Issue and PR comment/checkpoint. Recover Work ID, phase, allowed actions, branch/base/HEAD, test evidence, exact pending reviewer, user approval evidence and exclusions.
4. If missing independent review, approval or preserved data rights, STOP and request only that gate. A sudden context loss can lose uncommitted in-chat work, so recovery is **fail closed**, not perfect replay.
5. Update durable accepted decisions only in [docs/decisions.md](docs/decisions.md) and appropriate project-state/roadmap files; ephemeral runs/HEAD belong to Issue/PR. Avoid shared-doc changes on unrelated work branches.

Completion report: **Git/Production; Changed; DB/Data; Preserved; Validation by type; Remaining; Canonical docs updated; Next; Explicit approvals consumed/outstanding.** No direct main commits or automatic background execution.
