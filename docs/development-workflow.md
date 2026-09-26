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

The parent chat owns:

- ordered roadmap
- cross-feature consistency
- product-level decisions
- durable constraints
- accepting child completion reports
- verifying Git/Production state when possible
- deciding when an issue interrupts the roadmap
- maintaining canonical docs

The parent should not re-derive the product from old conversation memory when repository docs are available.

## 5. Child-chat role

One child chat should normally own one coherent workstream.

At start, the child must:

- read canonical docs
- verify latest main
- state branch/base
- inspect existing implementation before designing replacements
- preserve out-of-scope canonical behavior

During implementation:

- avoid unrelated cleanup
- keep migration/data changes explicit
- do not merge before user Preview approval
- update feature-specific regression tests when durable behavior changes

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
