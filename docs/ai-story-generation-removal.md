# AI story generation demand review and removal

Reviewed: **2026-09-25**

## Decision

LIB read removes its first-party AI story generation feature, continuation generation, generated-story session reader, and generated-story-specific translation/save/publish routes.

AI translation and word explanation are treated separately as reading/accessibility/translation support and remain available under the existing permission and data-flow controls.

Previously saved or published AI-generated works are **not deleted**. Their AI provenance remains visible so historical AI-generated content is not misrepresented as human-authored content.

## LIB read Production usage snapshot

Production aggregate review on 2026-09-25 found:

- time-fit story generation logs: 44 requests total, 35 successful, 2 distinct signed-in users;
- last 30 days: 2 generation requests, both successful, from 1 signed-in user;
- persisted AI-generated series: 9 total, of which 3 were public and 6 non-public, across 2 authors;
- persisted episodes belonging to those series: 9.

The newer shared AI-action log contained 2 counted story-generation actions from 1 user. This table covers a different time window from the older time-fit generation log and should not be used as the denominator for the lifetime figures above.

## External demand / platform review

Current platform policy points toward separating or restricting generated fiction rather than making first-party full-text generation a core publishing feature:

- 小説家になろう requires AI-use disclosure and prohibits fully AI-generated text under its 2026 rules.
- カクヨム introduced explicit AI-text usage tags in 2026.
- Royal Road requires AI-Assisted / AI-Generated labelling.
- Amazon KDP requires disclosure of AI-generated text, images, and translations.

Author surveys also suggest that generative AI demand is materially stronger for assistance such as grammar, brainstorming, structuring, and marketing than for generating publishable prose itself. Authors Guild survey reporting found only a small minority using AI to generate text, while disclosure and rights concerns were widespread.

## Product implication

For LIB read, first-party story generation had low observed usage and created a disproportionate brand/trust burden for a service whose core proposition is reading, multilingual access, long-form translation consistency, author publishing, and narration.

The removal therefore targets **creative text generation**, not every feature that happens to use an AI provider.

## Preservation rule

Do not drop the historical generation tables or erase AI provenance merely because the active feature has been removed. Historical logs may be needed for billing/security/audit purposes, and saved user works remain user content. Any later data-retention cleanup should be a separate, explicit migration with a defined retention policy.
