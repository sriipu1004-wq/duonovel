# ChatGPT Project Instructions — LIB read

Paste the block below into the ChatGPT Project instructions for the LIB read / 小説投稿サイト制作 project.

---

This Project is used to develop and operate the multilingual web-novel platform **LIB read**.

Repository:
`sriipu1004-wq/duonovel`

Production:
`https://www.syosetu-libread.com`

For every implementation task and parent-chat replacement:

0. Read the repo-root `PROJECT_MASTER.md`, `AGENTS.md`, and `docs/chat-operations.md` first. These provide a durable parent-crash recovery point and persistent specialist roles S1–S4; live refs still need independent verification. Child task numbers (e.g. Child85) must NOT be treated as automatically disposable specialist chat identities.
1. Read `docs/project-state.md`, `docs/roadmap.md`, `docs/decisions.md`, and `docs/development-workflow.md` first.
2. Verify the latest Git main and relevant Production state instead of trusting an old chat SHA.
3. Normal workflow is: latest main -> work branch -> implementation -> tests/build -> Draft PR -> Vercel Preview -> user review -> explicit approval -> merge -> Production verification.
4. Do not merge before explicit user approval unless the user explicitly changes that workflow.
5. Do not silently change the roadmap. `docs/roadmap.md` is the canonical ordered backlog.
6. Existing canonical behavior must be preserved unless the current task explicitly changes it.

Stable product rules:

- AI novel/story generation is retired and must not be reintroduced accidentally.
- AI is currently used for reading/translation support.
- AI translation and Human translation are separate provenance and separate permissions.
- Human translation must not consume AI allowance/credits or call OpenAI.
- Human narration and TTS are separate concepts.
- Reader modes are Original / Bilingual / Translation only. AI/Human is a translation-source choice, not a fourth mode.
- UI locale, source language, and target reading language are separate concepts.
- Search uses source-language filtering; do not restore the retired `read_language` model without an explicit new decision.
- Public Domain status requires provenance/rights evidence. Never treat “LIB read Official” alone as a Public Domain basis.
- Do not fabricate source URLs, edition/translator information, rights status, hashes, usage numbers, Human-translation inventory, or narration inventory.
- Security, ownership, publication visibility, R18, and permission checks must not be weakened for UX/performance.
- Do not make stronger OpenAI training/retention claims than verified facts support.

Workstream coordination:

- The parent alone selects roadmap priorities and dispatches **ONE specialist child task at a time** (CONTROL-R3). Other children are queued, and independent review is separately dispatched after author stops at exact PR HEAD. No child self-starts its next Issue. The parent approves release gates and records accepted decisions.
- **2026-10-21 CONTROL-R2 one-time reset:** all previous child chats, including old Child85, are retired; the user archives them via ChatGPT Project UI. For each S1–S4 slot, reuse the matching active post-reset specialist child chat if available; create a new one only if missing, archived, or at its context limit, as instructed by `docs/chat-launch-2026-10-21.md`. Maintain at most one active chat per slot. Child85 *work* continues in NEW S3; old PR #135 is merged but rights approval/imports remain zero.
- On sudden parent-chat limit, do not ask for a previous-chat farewell message. Start from `PROJECT_MASTER.md`, then verify live GitHub main/open PRs and Production. Differentiate source/mock proof from authenticated E2E, and accepted deferral from restored/verified capability.
- When durable state changes, update `PROJECT_MASTER.md` and relevant canonical docs in the same branch/PR. No chat assignment or GitHub comment starts background work.
- An independent reviewer must be distinct from the implementer for security, ownership, R18, translation/rights or Production data work.

Working style:

- Prefer direct repository inspection and consolidated implementation over asking the user for manual code edits.
- Avoid unrelated cleanup in a child workstream.
- Production DB/data writes must be exact, auditable, and count-checked.
- Child completion reports must include Git/Production, Changed, DB/Data, Preserved, Validation, Remaining, Canonical docs updated, and Next.
- When a child changes durable product state or roadmap, update the canonical repository docs in the same workstream.

If chat history conflicts with current repository docs or verified Production state, prefer the current repository/Production evidence and explicitly surface the conflict.

---
