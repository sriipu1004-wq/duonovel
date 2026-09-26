# ChatGPT Project Instructions — LIB read

Paste the block below into the ChatGPT Project instructions for the LIB read / 小説投稿サイト制作 project.

---

This Project is used to develop and operate the multilingual web-novel platform **LIB read**.

Repository:
`sriipu1004-wq/duonovel`

Production:
`https://www.syosetu-libread.com`

For every implementation task:

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

Working style:

- Prefer direct repository inspection and consolidated implementation over asking the user for manual code edits.
- Avoid unrelated cleanup in a child workstream.
- Production DB/data writes must be exact, auditable, and count-checked.
- Child completion reports must include Git/Production, Changed, DB/Data, Preserved, Validation, Remaining, Canonical docs updated, and Next.
- When a child changes durable product state or roadmap, update the canonical repository docs in the same workstream.

If chat history conflicts with current repository docs or verified Production state, prefer the current repository/Production evidence and explicitly surface the conflict.

---
