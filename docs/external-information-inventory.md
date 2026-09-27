# LIB read — External information inventory

Last updated: **2026-09-27**
Child: **82 — external information update**
Status: **in progress**
Baseline main: `efd8a7b5f3e138c417c04befb4f4c00ac7e376f5`
Production: https://www.syosetu-libread.com

This document records external public descriptions of LIB read that are under the user's control or that materially affect how the product is found. It does not change product behavior.

## Canonical product summary

LIB read is a multilingual web-novel posting and reading platform.

Reader modes:

- Original
- Bilingual
- Translation only

Translation provenance is separate from Reader mode:

- AI translation
- Human translation

AI novel/story generation is retired. AI is currently used for reading/translation support, principally AI translation and word explanation.

Human translation:

- separate provenance and permission from AI translation
- does not call OpenAI
- does not consume AI allowance, credits, or AI unlocks
- free to read
- selectable in Reader only when a published Human translation exists

Published Human translations in the current Production snapshot: **0**.

Do not market Human narration as abundant or fully verified. Genuine real-audio Production E2E remains unverified.

Do not claim account-specific OpenAI data sharing, ZDR, or MAM state. Those settings remain unverified.

## Verified Production state

Authenticated live Vercel fetch on 2026-09-27 returned current Child81 copy:

- title: `長編・Web小説を原文付きで多言語読書 | LIB read`
- description describes Original / Bilingual / Translation only
- AI translation and Human translation are described as separate sources
- current Production deployment is READY on main `efd8a7b5f3e138c417c04befb4f4c00ac7e376f5`

Some external search/cache results still return the retired AI-story version of the Home page. That is not treated as current Production state. Index/cache diagnostics belong to Child83.

## External surface inventory

### GitHub repository

Repository:
https://github.com/sriipu1004-wq/duonovel

Verified through the connected GitHub account:

- visibility: public
- repository description: **unset**
- README: already aligned by Child81; no rewrite needed
- homepage URL / topics: not exposed by the current connector response and therefore not claimed as verified

Canonical repository description:

> Multilingual web-novel posting and reading platform with Original, Bilingual, and Translation-only Reader modes; AI and Human translation are separate sources.

Canonical website:

> https://www.syosetu-libread.com

Topic candidates, only if the existing topic list is reviewed in the GitHub UI:

- web-novel
- multilingual
- bilingual
- translation
- reading
- nextjs
- typescript

Remove stale topics such as `ai-story` or `story-generator` if they actually exist. Do not assume they exist.

Write status: **user/login UI action required** with the currently available GitHub connector because repository metadata mutation is not exposed.

### Note profile

Profile/account:
https://note.com/dandy_shrew8963

Public article footer/search snapshot currently exposes the stale profile text:

> 色々できる小説投稿サイトを鋭意運営中。 ↓できること 対訳。朗読。

This does not explicitly revive AI Story, but it is materially behind the current positioning.

Canonical replacement:

> 多言語Web小説投稿・読書サービス「LIB read」を運営中。Original / Bilingual / Translation onlyで読書。AI翻訳とHuman translationは別扱い。AI小説生成は廃止済み。

Write status: **user/login UI action required**.

### Note — 2026-09-03 language-learning article

URL:
https://note.com/dandy_shrew8963/n/n3517b7472720

Title:
`長編ネット小説を対訳して多読するという語学学習アプローチを試してみたい方へ`

Verified stale claims include:

- "主に3つの機能" as parallel translation / personal library / **AI story generation**
- a dedicated `AI生成物語` section
- summary bullet promoting AI-generated stories for study
- embedded LIB read card/search snapshot using an old description containing `AI物語生成`

Required change:

- remove AI Story from the active feature set
- describe Reader as Original / Bilingual / Translation only
- keep AI translation and Human translation as separate translation provenance
- describe My Library without implying arbitrary third-party books may be imported merely because the user can obtain a file
- state that AI story generation has been retired
- reinsert/refresh the LIB read link card if possible after editing

Write status: **user/login UI action required**.

### Note — 2026-04-23 launch article

URL:
https://note.com/dandy_shrew8963/n/n2bb4ddc729f7

Title:
`聞く、読む、読む。すべてが気軽に可能な小説投稿サイト（試作）を作りました。`

This is a historical launch article and contains multiple statements that no longer represent current product state, including:

- narration-first positioning
- statement that current readable works are Official public-domain works
- implication that Official works are all rights-cleared
- planned monetization and R18 wording from the prototype stage
- product architecture that predates the current Reader/translation model

Required treatment:

- preserve it as a historical record rather than rewriting its original historical body as though it were current
- add a prominent 2026-09-27 update at the top
- state that current product is a multilingual web-novel posting and reading platform
- state the three Reader modes
- state AI/Human translation separation
- state AI story generation is retired
- distinguish Human narration from synthetic TTS
- state that Official alone is not a Public Domain basis
- link to current site documentation

Write status: **user/login UI action required**.

### X

Account identified from public references:

`@ReadLib28667`

Historical display name observed in third-party embedding:

`LIB read＠朗読&小説投稿サイト`

The current X profile bio and current pinned-post state could not be fetched reliably from the public Web in this workstream. Do not claim the current bio/pin is stale without direct account/UI verification.

Canonical profile candidate:

> 多言語Web小説投稿・読書サービス。Original / Bilingual / Translation only。AI翻訳とHuman translationは別扱い。AI小説生成は現在提供していません。

Canonical introduction/pinned-post candidate:

> LIB readは、多言語Web小説投稿・読書プラットフォームです。
>
> 同じ作品を Original / Bilingual / Translation only の3つのReader modeで読むことができます。
>
> 翻訳はAI translationとHuman translationを別に扱います。
>
> 以前提供していたAI小説・AI物語生成は廃止済みで、現在AIは翻訳や単語・表現の説明など、読書支援を中心に利用しています。
>
> https://www.syosetu-libread.com

Write status: **current state verification + user/login UI action required**.

## Third-party surfaces found

These are not under the user's direct control and are not modified in Child82.

### Hano / Note article

URL:
https://note.com/hanoween0523_r5/n/ned258333c641

A third-party historical article still embeds the April 2026 X post and an old LIB read link-card description. No outreach is performed in Child82.

### eveningmoon.net novel-site directory

URLs:

- https://eveningmoon.net/novelsite/
- https://eveningmoon.net/novelsite/statistics/

The directory currently describes LIB read mainly as a narration/read-aloud site and tags it with `AI小説`. This is third-party data. No correction request is sent in Child82 because the current scope is existing user-controlled external public information only.

## Canonical claim guardrails

Do not publish unsupported claims such as:

- many users
- rapid growth
- many authors
- many Human translations
- abundant Human narration
- worldwide usage
- industry-largest
- high-accuracy AI translation
- human-level translation
- perfectly consistent long-form translation

Do not state:

- "AI is never trained on this"
- "nothing is stored"
- "Zero Data Retention is enabled"

unless account-specific evidence is verified.

## Completion gate

Child82 remains **in progress** until the user-controlled external surfaces above are updated or explicitly reviewed and left unchanged.

When those actions are complete:

1. re-check public Note/X/GitHub display where possible;
2. update this inventory with final state;
3. update `docs/project-state.md` only if needed;
4. update `docs/roadmap.md` to mark Child82 complete and Child83 next;
5. do not add a durable decision entry unless a new durable product decision was actually made;
6. validate latest main / Production / external state;
7. obtain explicit approval before merging the docs PR.

Child83 indexing/webmaster work must not start inside Child82.
