# LIB read AI data-flow audit

Reviewed at: **2026-09-26**
Product-state baseline: `ca216ac38f4e1150859ef3bc28b4ee60f1f2be58`
Scope: Production-reachable AI/model/speech paths present in the repository at the review date.

This document distinguishes four different things that must not be described as if they were the same:

1. LIB read sending content to an AI provider to perform a requested feature.
2. The provider retaining API request/response data.
3. The provider using API data for model training or improvement.
4. An unrelated public-Web crawler fetching a publicly accessible work.

## Provider inventory

| Feature | Provider / product | Model / engine | Trigger | Content sent | Internal result storage | Permission boundary |
| --- | --- | --- | --- | --- | --- | --- |
| Public work AI translation | OpenAI Responses API | `EPISODE_TRANSLATION_MODEL`; code default `gpt-5.4-mini` | Reader requests a missing AI translation after server checks | Current episode translation batches, work/episode title, selected glossary/profile, limited previous published-episode context | `episode_translations`, translation logs, suggested glossary terms | AI translation permission; closed blocks provider call and new allowance/credit/unlock consumption |
| Public bilingual word explanation | OpenAI Responses API | `WORD_EXPLANATION_MODEL`; code default `gpt-5.6-luna` | Reader requests an uncached explanation | One aligned source sentence + translated sentence, selected text/offset and language pair | `bilingual_word_explanations` | new provider calls require current AI translation permission |
| Private Library translation | OpenAI Responses API | `EPISODE_TRANSLATION_MODEL`; code default `gpt-5.4-mini` | Owner requests translation; supported private prefetch may request next chapter | Current private chapter batches, title, private glossary/terminology context | owner-scoped private translation/glossary tables and logs | authenticated owner boundary |
| Human translation | **No AI provider** | none | User creates/edits/publishes their own translation | no translation text is sent to OpenAI by the Human-translation workflow | `episode_human_translations` | separate Human translation permission |
| Synthetic narration (Aivis) | configured AivisSpeech engine endpoint | engine speaker settings | narration generation route is invoked | episode text chunks | rendered audio/recording rows | narration permission |
| Synthetic narration (VOICEVOX Nemo) | configured VOICEVOX Nemo engine endpoint | engine speaker settings | narration generation route is invoked | episode text chunks | rendered audio/timing manifest | narration permission |
| Browser speech | browser / OS SpeechSynthesis | selected browser voice | user presses play | client passes text to `window.speechSynthesis` | no LIB read server AI-response cache | browser/platform behavior |

AI novel/story generation, AI story continuation, generated-story Reader/runtime, generated-story translation runtime, active AI Story quota, and persisted LIB read-generated AI stories have been removed from the active product. Historical audit/migration records may remain for accountability, but active runtime behavior must not depend on retired AI-story provenance.

No active Anthropic/Gemini LLM call, embedding corpus, fine-tuning export, model-training dataset export, or separate moderation/classification provider was identified in the audited Production source paths. A future provider/feature addition requires a fresh review.

## Public author AI-translation flow

Posting, publishing, or merely leaving AI translation permission open does **not** itself call OpenAI.

A new provider request occurs when a reader requests a translation that is not already available and all server-side permission, access, entitlement, and reservation checks pass.

The public batch contract remains:

- max 3,000 source characters per batch;
- max 60 source segments per batch;
- translation segment version 3.

The translator sends the current episode batches plus bounded consistency material selected for that work/target language. It does not attach the author's email, user ID, billing data, IP address, or Private Library ownership metadata to the OpenAI translation payload.

Previous-episode context is limited and drawn only from eligible earlier public content. Future, unpublished, or unrelated private episodes are not selected by this path.

## AI vs Human translation

These are separate provenance.

### AI translation

- governed by AI translation permission;
- may call OpenAI when a missing translation is requested;
- may use work-level glossary/profile/limited previous context;
- may consume AI allowance/credit according to the entitlement path;
- generated translation assets may be stored/reused in LIB read.

### Human translation

- governed by `human_translation_permission_mode`;
- created by a user through the Human translation editor;
- does not call OpenAI;
- does not consume AI allowance, credit, or AI unlock;
- stores translator identity/provenance and source-hash/segment-version state;
- draft content is not public;
- published Human translations can be selected in Bilingual / Translation only without adding a fourth Reader mode.

A Human translation must never be relabelled as an AI translation or vice versa.

## Glossary and shared AI-translation storage

Public AI translation can return suggested glossary candidates. LIB read stores work-level translation-consistency data so later translations for the same work/language can remain more stable.

`episode_translations` stores aligned AI translation assets for reuse under the existing source/version/language rules. This application-level cache is not a model-training dataset.

Private Library translations use separate owner-scoped storage and do not write to the public translation cache.

Human translation uses separate storage and does not share AI cache provenance.

## Logging and error handling

Diagnostic logging should contain identifiers/status/timing/token/cost/retry metadata, not raw episode text or full prompts.

Child76 timing instrumentation is intended to log phase timing, not source text.

Audited foreground OpenAI Responses calls use `store:false`. Raw provider errors should not be propagated directly to clients or generic logs when they could contain request/response content.

## OpenAI published data policy

Official sources reviewed 2026-09-25:

- https://platform.openai.com/docs/guides/your-data
- https://help.openai.com/en/articles/10306912-sharing-feedback-evals-and-api-data-with-openai

Published OpenAI API policy says API inputs/outputs are not used to train models by default. An organization may explicitly opt in to share data. Standard abuse-monitoring logs may retain customer content for up to 30 days. Eligible customers may obtain Modified Abuse Monitoring or Zero Data Retention.

`store:false` reduces Responses application-state storage but does not itself mean Zero Data Retention or eliminate applicable abuse/security/legal retention.

**LIB read account-specific status:** the repository and available Vercel project access do not expose the OpenAI organization/project data-sharing toggle or ZDR/MAM approval state. Those account-level settings remain **unverified**. Do not claim “ZDR is enabled” or “data sharing is disabled” unless the OpenAI account/project settings are checked directly.

The audited author-work paths do not use OpenAI Files, Batch, Assistants, or vector-store endpoints.

## Aivis / VOICEVOX note

The code talks to configurable engine URLs. Defaults point to loopback/local engines. Production endpoint/account configuration was not proven from the source audit, so this document does not assert that Production uses a particular hosted Aivis/VOICEVOX service or its retention policy.

Human narration remains separate from these synthetic engines.

## Public Web crawlers are separate

Current crawler policy was not changed by Child79/80.

The site has general public crawling rules rather than an AI-specific crawler-blocking product decision. Public-Web crawler behavior is separate from LIB read's own OpenAI API processing.

A robots rule is not a guarantee that no third party can obtain or use a public page.

Any future GPTBot / Google-Extended / ClaudeBot / other crawler policy change should be treated as an explicit product/discoverability decision, not as a hidden side effect of AI-translation privacy work.

## Terms / Privacy assessment

Current Terms keep copyright in posted works with the user/rightsholder and grant LIB read a non-exclusive service-operation license.

Human translation is treated as user-generated content with its own contributor rights/responsibilities; it is not a transfer of ownership to LIB read.

The audited Terms do not contain an explicit broad grant allowing LIB read to use ordinary author works as model-training/fine-tuning datasets.

The Privacy surface should describe active AI translation/word-explanation processing without reviving retired AI Story disclosures.

## Re-audit triggers

Re-audit this document if any of the following changes:

- AI provider
- model/API product with materially different storage behavior
- account-level OpenAI data-control settings
- new AI feature
- embedding/vector/fine-tuning pipeline
- crawler policy
- permission semantics
- Human translation provenance/billing model
