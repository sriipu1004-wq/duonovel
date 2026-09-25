# AI story generation demand review and removal

Reviewed: **2026-09-25**

## Decision

LIB read removes its first-party AI story generation feature, continuation generation, generated-story session reader, and generated-story-specific translation/save/publish routes.

AI translation and word explanation are treated separately as reading/accessibility/translation support and remain available under the existing permission and data-flow controls.

Previously saved or published works created by LIB read's first-party AI story generator are deleted. Historical generation logs may remain for security, billing, and audit purposes, but generated story content is not retained as a user-facing work.

## LIB read Production usage snapshot

Production aggregate review on 2026-09-25 found:

- time-fit story generation logs: 44 requests total, 35 successful, 2 distinct signed-in users;
- last 30 days: 2 generation requests, both successful, from 1 signed-in user;
- persisted AI-generated series: 9 total, of which 3 were public and 6 non-public, across 2 authors;
- persisted episodes belonging to those series: 9.

The newer shared AI-action log contained 2 counted story-generation actions from 1 user. This table covers a different time window from the older time-fit generation log and should not be used as the denominator for the lifetime figures above.

## External demand / platform review

Current platform policy points toward separating or restricting generated fiction rather than making first-party full-text generation a core publishing feature. Sources reviewed on 2026-09-25:

- 小説家になろう 2026-06-09 Terms update: https://blog.syosetu.com/article/view/article_id/5157/
- 小説家になろう 2026-08-24 AI-use Q&A: https://blog.syosetu.com/article/view/article_id/5224/
- カクヨム 2026-05-27 AI guideline update: https://kakuyomu.jp/info/entry/gen_ai_guideline
- Royal Road AI content policy / knowledge base: https://www.royalroad.com/support/knowledgebase/114
- Authors Guild 2023 author survey (usage mix; older than the platform-policy sources above): https://authorsguild.org/news/ai-survey-90-percent-of-writers-believe-authors-should-be-compensated-for-ai-training-use/

Observed direction:

- 小説家になろう requires AI-use disclosure and prohibits fully AI-generated text under its 2026 rules.
- カクヨム introduced explicit AI-text usage tags in 2026.
- Royal Road requires AI-Assisted / AI-Generated labelling.
- Amazon KDP requires disclosure of AI-generated text, images, and translations.

Author surveys also suggest that generative AI demand is materially stronger for assistance such as grammar, brainstorming, structuring, and marketing than for generating publishable prose itself. Authors Guild survey reporting found only a small minority using AI to generate text, while disclosure and rights concerns were widespread.

## Product implication

For LIB read, first-party story generation had low observed usage and created a disproportionate brand/trust burden for a service whose core proposition is reading, multilingual access, long-form translation consistency, author publishing, and narration.

The removal therefore targets **creative text generation**, not every feature that happens to use an AI provider.

## Data cleanup rule

Delete persisted works whose provenance identifies LIB read's retired first-party generator (`time_fit_ai_story`), including work-scoped child rows through existing foreign-key cascades. Keep generation logs only as non-content audit/security history; series references become null through the existing foreign-key rule. Do not treat those logs as publishable works or restore deleted generated prose from them.


## Final runtime cleanup and deployment verification

PR #76 removed the remaining runtime-only branches that special-cased works from the retired first-party AI story generator. The cleanup covers Reader attribution, work pages, My Page, author workspace, episode creation, posting behavior, and translation eligibility. Active source code must not reintroduce `time_fit_ai_story`, `isAiGeneratedSeries`, or AI-story-specific attribution/permission behavior.

Merged cleanup commit: `fa94f0d7e431c01bfc3230c12daedbdb95bfe8b6`.

After any Vercel build-rate-limit interruption, verify that the Production deployment is based on this commit or a descendant before closing the removal work. Then smoke-check that `/generate` and the retired generation APIs return 404, normal translation/word-explanation endpoints remain present, and Production contains zero persisted first-party AI-generated works.
