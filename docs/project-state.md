# LIB read — Project State

Last updated: **2026-09-26**
Last product-changing main commit: `ca216ac38f4e1150859ef3bc28b4ee60f1f2be58`
Production: https://www.syosetu-libread.com
Repository: `sriipu1004-wq/duonovel`

This document is the compact canonical state for future parent/child chats. It should describe the current product, not the full history. Historical rationale belongs in `docs/decisions.md`.

## Product definition

LIB read is a multilingual web-novel posting and reading platform. A work is posted in its source language and can be read through the same work/Reader surface in:

- Original
- Bilingual
- Translation only

Translation source is separate from Reader mode:

- AI translation
- Human translation, when a published Human translation exists

Private Library is a separate personal-reading feature for user-owned/imported books.

Core slogan: **読む、聴く、学ぶ。**

## Non-negotiable product boundaries

- AI novel/story generation has been removed from the active product and must not be reintroduced accidentally.
- AI is currently used for reading/translation support, principally AI translation and word explanation.
- AI translation and Human translation are separate provenance and separate permissions.
- Human narration and synthetic TTS are separate concepts.
- UI locale, work source language, and target reading language are separate concepts.
- Security, ownership, publication visibility, R18 gates, and permission checks must not be bypassed for UX or performance.

## AI translation

Author setting: AI translation permission.

Posting, publishing, or merely leaving AI translation permission open does not itself send the work to OpenAI.

A provider call occurs when a reader requests a missing AI translation and server-side access/permission/entitlement checks pass.

Current public translation contract:

- provider path: OpenAI Responses API
- audited requests use `store:false`
- source batches: max 3,000 source chars / 60 segments
- translation segment version: 3
- Reader marker max: 80 chars
- punctuation-only translated segments are valid
- limited previous published-episode context; do not send the whole series
- work-level glossary / target-language consistency data may be included
- `translation_permission_mode=closed` blocks new AI translation and new AI word-explanation provider calls
- closed rejection must not consume allowance, credit, or create an unlock

OpenAI published API policy was last audited 2026-09-25: API data is not used for training by default; standard abuse-monitoring logs may retain content for up to 30 days. LIB read account-specific data-sharing / ZDR / MAM settings remain unverified and must not be claimed otherwise.

See `docs/ai-data-flow.md`.

## Human translation

Implemented in Child80.

- separate Human translation permission: `series.human_translation_permission_mode`
- separate Human translation storage: `episode_human_translations`
- workflow: draft -> edit -> publish -> withdraw
- one active translator/episode/target-language record by unique constraint
- multiple translators may publish separate translations
- public identity uses display name / author attribution, never email fallback
- Human translation uses canonical source segmentation and source-hash stale protection
- Human translation does not call OpenAI
- Human translation does not consume AI allowance, credits, or AI unlocks
- Human translation is free to read
- Reader keeps the same three modes; translation-source selector appears only when published Human translations exist
- published Human translations in Production at this snapshot: **0**
- real-user Production E2E (draft -> publish -> Reader -> withdraw) is still unverified

Permission baseline after Child80:

- rightsChecked Public Domain works: Human translation open
- existing general works: Human translation closed unless explicitly changed by author
- legacy rights-unverified Official works: Human translation closed
- new works: AI translation open, Human translation open, narration open by default

## Reader

Canonical modes:

- Original
- Bilingual
- Translation only

Canonical position/bookmark anchor is source-side and must survive mode and AI/Human source switching.

Child75 translation segmentation and Child68 Reader position behavior are canonical.

## Pricing / quota

### Free

- ¥0
- shared daily allowance: public AI translation unlock + My Library import = **3 uses/day total**
- My Library capacity: **3 works**

### Premium

- ¥680/month
- public AI translation unlock: **30/day**
- My Library import: no daily count
- My Library capacity: **20 works**

### Credits

- 5 credits = ¥300
- 8 credits = ¥450
- 12 credits = ¥600
- valid 150 days
- 1 credit unlocks one public episode × one target language for AI translation
- Original does not need an unlock
- Bilingual and Translation only share the same entitlement
- same episode + target re-read is free
- Human translation never consumes credits

AI Story quota is retired and must not return.

## Public Domain / Official

Current snapshot:

- Official total: **120 works**
- current rightsChecked Public Domain: **84**
  - JA 4
  - EN 40
  - KO 40
- legacy / rights-unverified Official: **36**
- site-wide public source-language counts at the latest verified Search snapshot:
  - JA 43
  - EN 40
  - KO 40

Do not equate all Official works with rightsChecked Public Domain works.

Public Domain approval requires tracked provenance and rights review. “Official” alone is never a rights basis.

Child75 Public Domain translation constraints:

- target episode size: 8,000 chars
- hard max: 10,000 chars
- lossless repartition only
- rights-unverified legacy works must not be bulk-opened or bulk-repartitioned

## Search

Child78 is canonical.

- source-language multi-select only; do not restore `read_language`
- filter changes do not auto-scroll to results
- dynamic self-excluding facet counts
- lightweight normalized/fuzzy title/author matching
- no AI semantic/vector search
- 24 results/page
- URL page state
- localized “Back to filters”
- Search cards do not show views/likes/bookmarks/narration-play/popularity metrics
- PostgREST >1000-row correctness must be preserved

## Performance

Child76 is canonical.

- prioritize above-the-fold content
- use progressive loading / Suspense for secondary sections
- avoid fetching all episode bodies when current episode + metadata is sufficient
- preserve >1000-row pagination correctness
- do not trade security/permission correctness for streaming
- do not load all Human translation payloads on initial Reader load

## Human narration / TTS

- Human narration = actual user-recorded/uploaded human voice
- Aivis / VOICEVOX / browser speech are not Human narration
- work-page top-level Human narration creation CTA was removed in Child77
- Human narration feature itself remains
- genuine real-audio Production E2E remains unverified
- do not market Human narration as abundant or fully verified

## AI Story removal

Removed from active product:

- `/generate`
- AI short-story generation
- AI continuation
- generated-story Reader/runtime
- generated-story translation runtime
- AI Story pricing/quota
- persisted LIB read-generated AI works
- AI-generated runtime special cases

Historical audit/migration records may remain for accountability. Active product behavior must not depend on them.

## Current unresolved verification items

These are not automatic priority changes; they are release/claim gates:

1. Human translation real-user Production E2E has not yet been performed.
2. Human narration genuine-audio Production E2E has not yet been performed.
3. OpenAI account-specific data-sharing / ZDR / MAM settings are unverified.
4. 36 legacy Official works remain rights/provenance-unverified and must not be bulk-approved.

## Current roadmap

The current ordered roadmap lives in `docs/roadmap.md`. Do not reconstruct priority from old chat history when that file is available.

## Operating rule

For implementation work, read this file, `docs/roadmap.md`, `docs/decisions.md`, and the relevant feature-specific audit/doc before coding. Verify the current Git main/Production state rather than trusting an old chat SHA.
