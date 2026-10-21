# LIB read — Development Workflow

Last updated: **2026-09-26**

This file defines the stable operating method for parent/child development chats.

## 1. Before any implementation

Read:

1. `docs/project-state.md`
2. `docs/roadmap.md`
3. `docs/decisions.md`
4. the feature-specific doc/audit relevant to the task
5. current Git main / open PR / Production deployment state

Do not trust an old chat SHA when the repository can be checked.

## 2. Standard Git / deployment flow

Normal sequence:

latest main
-> work branch
-> implementation
-> tests / typecheck / lint / build
-> Draft PR
-> Vercel Preview
-> user review
-> explicit approval
-> merge main
-> Production READY
-> Production smoke
-> parent completion report
-> update canonical docs if state/priority changed

Main must not receive direct implementation commits in normal work.

## 3. High-risk changes

Treat these as high-risk and verify explicitly:

- Production DB migrations
- Production data correction/backfill
- rights/provenance status changes
- permission semantics
- pricing/quota/credit behavior
- authentication/authorization/R18 visibility
- irreversible content deletion
- provider/model changes
- crawler blocking/indexability policy
- Terms/Privacy material changes

Use dry-run / exact IDs / count checks where possible. Never use “Official owner” alone as a Public Domain update predicate.

## 4. Parent-chat role

**2026-10-21 CONTROL-R2 reset:** all old child conversation instances retired. Only active post-reset S1/S2/S3/S4 chats may take new assignments; reuse the existing active chat of that slot. When missing, archived, or at context limit, create exactly one same-slot successor using `docs/chat-launch-2026-10-21.md` and Issues #137–#143. Archived pre-reset chats are references, not runnable owners. If no active chat has been invoked, assignment is queued, NOT executing. Existing Preview → separate explicit approval → merge and Production-data gates remain unchanged.


The parent chat owns:

- ordered roadmap, cross-feature consistency and product-level decisions;
- persistent specialist S1–S4 assignment (not disposable chat creation per Child/PR);
- accepting implementer and **independent reviewer** evidence;
- verifying live GitHub main/PRs and Production state before every release;
- maintaining [PROJECT_MASTER.md](../PROJECT_MASTER.md) as an unconditional restart entrypoint;
- durable constraints, accepted verification deferrals and their residual risks;
- explicit user Preview/merge authorization and high-risk Production data release gates;
- recording priority changes in the canonical roadmap only on an approved basis.

The parent should not re-derive the product from old conversation memory when repository docs are available. Parent crashes require no handoff message: start from the root entrypoint, then verify live Git/Production and reconcile any state that could not be persisted.

## 5. Persistent specialist-chat role

**Child85 and similar numbers are roadmapped work IDs, not a reason to create a new chat.** Keep existing chats per specialist domain; roles S1–S4 and current ownership are in [docs/chat-operations.md](chat-operations.md).

At the start/resumption of a coherent workstream, the chosen specialist must:

- read [PROJECT_MASTER.md](../PROJECT_MASTER.md), canonical docs and its feature-specific evidence;
- verify the latest main, open PRs and relevant Production state;
- state work ID, **Sx slot**, branch/base, permitted operations, independent reviewer and stopping criteria;
- inspect existing implementation before designing replacements;
- preserve out-of-scope canonical behavior.

During implementation:

- continue across related PRs within the same specialist conversation instead of asking for a fresh numbered child per task;
- avoid unrelated cleanup and keep migration/data changes explicit;
- keep source-only/mock/live-E2E claims separate;
- do not merge before user Preview approval;
- update feature-specific regression tests and canonical state when durable behavior changes;
- return to parent on accepted completion, genuine blocker, cross-specialty decision, risk/roadmap change or chat length cap.

At a chat length limit, only the **conversation instance** is replaced; record a verifiable PR/Issue checkpoint and retain the specialist role and unfinished Work ID. A reviewer must be a distinct actor/chat when independence is required, not the implementer re-reviewing itself. Child chats cannot independently choose next roadmap priorities or assign other children.

## 6. Priority integrity

`docs/roadmap.md` is the canonical ordered backlog.

Priority may change only for:

- explicit user reprioritization
- urgent Production/security/legal/data-loss issue
- a hard dependency blocking the next task

If priority changes, record the new order instead of merely discussing it in chat.

A newly discovered idea goes into “later / candidate” unless one of the conditions above applies.

## 7. State integrity

`docs/project-state.md` should contain only current state.

Do not turn it into a history log.

When a child changes a canonical value, update it in the same workstream, for example:

- pricing
- counts that matter operationally
- permission model
- Reader modes
- provider/data policy
- current unresolved verification gates
- current last product-changing main commit

Durable rationale goes into `docs/decisions.md`.

## 8. Completion report template

Every child completion report should use this compact structure:

### Git / Production
- base
- branch
- PR
- merge commit
- current main
- Preview / Production state

### Changed
- what behavior/data/schema changed

### DB / data
- migrations
- backfills
- exact affected counts
- safeguards

### Preserved
- important canonical behavior intentionally unchanged

### Validation
- tests
- typecheck
- lint
- build
- Preview
- Production smoke

### Remaining
- known unverified items
- intentionally deferred scope

### Canonical docs
- which of project-state / roadmap / decisions / feature docs were updated

### Next
- exact next item from `docs/roadmap.md`

## 9. Preview approval language

A user message such as:

- “これでいい”
- “問題ない”
- explicit instruction to merge

may serve as approval when clearly referring to the current Preview.

Do not treat unrelated agreement as merge approval.

## 10. Production data rules

Before a Production data write:

- identify exact target rows/cohort
- state the selection predicate
- verify expected count
- protect unrelated users/works
- capture pre-state where practical
- perform post-count/invariant checks

For Public Domain:

- require approved provenance/rights evidence
- never fabricate source URLs/hashes/edition/translator data
- preserve series IDs when migrating existing works unless there is a compelling reason not to

## 11. Performance rules

Performance work must measure before/after where practical.

Never “improve” speed by:

- cutting off correct rows
- skipping permission/auth checks
- preloading private content before authorization
- loading the wrong translation/source
- weakening stale/source-hash checks

Prefer:

- narrower selects
- removal of N+1
- Promise.all for independent dependencies
- progressive rendering
- lazy loading below the fold
- selected-payload loading
- bounded concurrency

## 12. AI / Human-content rules

- AI Story generation is retired.
- AI translation and Human translation remain separate.
- Human translation must not call OpenAI or consume AI quota/credit.
- Human narration must not be conflated with TTS.
- “AI learning/training” claims must match verified provider and account facts.
- Public-Web crawler behavior is separate from LIB read’s own provider API processing.

## 13. User interaction preference

The user prefers consolidated implementation over manual piecemeal editing.

Where tooling permits:

- inspect the repository directly
- implement through a branch/PR
- provide Preview
- ask the user only for actions that require their account/UI judgment or explicit approval

Avoid asking the user to locate functions, adjust indentation, or perform mechanical code edits manually.

## 14. Actions that require user involvement

Typical cases:

- ChatGPT Project instruction settings
- final visual/UX Preview judgment
- merge approval
- login-only third-party webmaster/social account operations
- account-specific OpenAI data-control settings not exposed by repo/Vercel
- subjective brand/copy decisions where multiple valid choices materially differ
- controlled real-user E2E when user identity/login is required and no authorized automation path exists

## 15. Parent crash and durable checkpoint protocol

Repository root [AGENTS.md](../AGENTS.md) and [PROJECT_MASTER.md](../PROJECT_MASTER.md) are permanent discovery entrypoints. Existing [parent-chat bootstrap](parent-chat-bootstrap.md) is an evergreen prompt, never pinned to Child81 or an old SHA.

When any parent chat disappears or reaches message limits:

1. read the root entrypoint and the four canonical files;
2. fetch live main SHA, all open PR HEAD/state, CI/Preview, Production, and any material data facts;
3. recover S1–S4 ownership and the actual workstream from GitHub comments/branches plus recent user instructions;
4. reconcile unfinished approvals, user-deferred risk, stale Drafts, and historical vs current status **without inventing continuity**;
5. persist the accepted current state in the repository before moving on.

Do not equate a manually recorded "last verified" SHA with current GitHub HEAD, a green CI with authenticated E2E, or user-accepted deferral with technical PASS. Review/test status, merge authorization and Production data authorization remain separate.

A parent checkpoint must persist **accepted durable** ownership, explicit user choice, roadmap, release-gate or risk-deferral changes to PROJECT_MASTER.md and the relevant current product/doc decision, ideally in the corresponding PR. A specialist records routine HEAD/CI/Preview progress on its own task PR/Issue; do **not** edit the shared master in every concurrent feature PR merely to update transient metadata. On parent crash, recover newer unrecorded facts from live GitHub/Production. No new third-party database or paid automation is required. Updating repository files does not change external ChatGPT Project settings automatically.

## 16. Bounded commit and Preview budget hygiene

For multiple related documentation/source files in one coherent PR, **batch edits into one logical commit where tooling permits** (e.g., a Git tree/commit update) instead of triggering a Vercel deployment for every individual file update. A large series of per-file pushes can exhaust the Vercel Hobby daily deployment quota and crowd out an active feature child such as Child85.

Do not force-push unrelated contributors' work or bypass HEAD/branch lease checks to achieve fewer commits. Use a dedicated branch, an expected HEAD, one focused commit, and one exact-HEAD CI/Preview validation when possible. If deployment quota is exhausted, record the external blocker and do not buy an unapproved paid upgrade or claim Preview READY.
