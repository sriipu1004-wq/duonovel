# LIB read AI data-flow audit

Reviewed at: **2026-09-25**
Base commit: `557c770beb9cefe3428727aaf8f624a12b75e2b9`
Scope: Production-reachable AI/model/speech paths present in the repository at the review date.

This document distinguishes four different things that must not be described as if they were the same:

1. LIB read sending content to an AI provider to perform a requested feature.
2. The provider retaining API request/response data.
3. The provider using API data for model training or improvement.
4. An unrelated public-Web crawler fetching a publicly accessible work.

## Provider inventory

| Feature | Provider / product | Model / engine | Call site | Trigger | Content sent | Internal result storage | Permission boundary |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Public work AI translation | OpenAI Responses API | `EPISODE_TRANSLATION_MODEL`; code default `gpt-5.4-mini` | `src/lib/translation/publicEpisodeTranslation.ts` | Reader requests a missing translation after access/entitlement checks | Current episode translation batches (max 3,000 source chars / 60 segments each), work/episode title, selected glossary/profile, limited previous published episode context | `episode_translations`, token/cost metadata in translation logs, suggested glossary terms | `translation_permission_mode=open`; closed is rejected before provider call and before new credit/unlock consumption |
| Public bilingual word explanation | OpenAI Responses API | `WORD_EXPLANATION_MODEL`; code default `gpt-5.6-luna` | `src/app/api/word-explanations/route.ts` | Reader taps a word/phrase and no cached explanation exists | One aligned source sentence + translated sentence, selected text/offset and language pair | `bilingual_word_explanations` | Cached explanations may be read; new provider calls require current AI translation permission |
| Private Library translation | OpenAI Responses API | `EPISODE_TRANSLATION_MODEL`; code default `gpt-5.4-mini` | `src/app/api/library/translations/generate/route.ts` + `src/lib/translation/openAITranslation.ts` | Owner requests translation; subscriber prefetch may request the next chapter | Current private chapter batches; title; existing glossary; short terminology excerpts when new glossary candidates are prepared | owner-scoped `private_library_chapter_translations`, `private_library_glossary_terms`, translation logs | authenticated owner boundary; private and public translation tables are separate |
| Synthetic narration (Aivis) | Configured AivisSpeech Engine endpoint | engine speaker settings | `src/lib/recording/aivisClient.ts` | narration generation route is invoked | episode text chunks to configured engine | rendered audio in LIB read storage/recording rows | `recording_permission_mode`, not translation permission |
| Synthetic narration (VOICEVOX Nemo) | Configured VOICEVOX Nemo Engine endpoint | engine speaker settings | `src/lib/recording/nemoClient.ts` | narration generation route is invoked | episode text chunks to configured engine | rendered audio + timing manifest in LIB read storage/recording rows | `recording_permission_mode`, not translation permission |
| Browser speech | Browser / operating-system SpeechSynthesis implementation | selected browser voice | `src/features/playback/WebSpeechEpisodePlayback.tsx` | user presses play | LIB read client passes text to `window.speechSynthesis` | no LIB read server AI response cache | browser/platform behavior; LIB read server does not send this text to OpenAI |

AI story generation, AI story continuation, the generated-story session reader, and generated-story translation routes were removed from the active application surface on the `remove/ai-story-generation` branch. Historical database rows and provenance markers are retained so previously saved/published AI-generated works are not silently relabelled as human-authored works.

No active Anthropic/Gemini LLM call, embedding corpus, fine-tuning export, model-training dataset export, or separate moderation/classification provider was identified in the audited Production source paths. A future feature/provider addition requires a fresh review.

## Public author translation flow

Posting, publishing, or merely setting AI translation permission to open does **not** itself call OpenAI.

A new provider request occurs when a reader requests a translation that is not already available and all server-side permission, access, entitlement and reservation checks pass. The current public translator sends only the current episode batches plus consistency material selected for that work/target language. It does not attach the author's email, user ID, billing data, IP address, or Private Library ownership metadata to the OpenAI translation payload.

The public batch contract remains:

- max 3,000 source characters per batch;
- max 60 source segments per batch;
- translation segment version 3.

The consistency context is bounded. The previous-episode helper selects only an earlier episode from the same public series that is publicly visible at request time. Its source/target tail is limited to 2,000 characters. Future, unpublished, or unrelated private episodes are not selected by this path.

## Glossary and shared translation storage

Public AI translation can return up to 12 suggested glossary candidates per generation. LIB read stores these as work-level translation consistency data (`origin=ai`, initially `status=suggested`), not as a model-training dataset. Confirmed/locked glossary data and translation profile data may be sent back to the translator on later requests for the same work/language when relevant.

`episode_translations` stores aligned source and translated segments so an already-generated translation can be reused for the same source version and language pair. This shared translation cache is a LIB read service optimization and is distinct from giving the source work to a model-training corpus.

Private Library translations use separate owner-scoped tables and do not write to the public `episode_translations` cache.

## Logging and error handling

Diagnostic logging should contain identifiers/status/timing/token/cost/retry metadata, not raw episode text or full prompts. Child76 timing instrumentation does not intentionally log source text.

At this audit, raw provider error strings could flow into some application exceptions/log records. Child79 removes direct propagation of OpenAI response error messages from the audited calls and uses generic application errors instead. OpenAI Responses requests in the audited foreground paths explicitly set `store: false`.

## OpenAI published data policy

Official source (reviewed 2026-09-25):

- https://platform.openai.com/docs/guides/your-data
- https://help.openai.com/en/articles/10306912-sharing-feedback-evals-and-api-data-with-openai

Published OpenAI API policy says API inputs/outputs are not used to train models by default. An organization may explicitly opt in to share data. Standard abuse-monitoring logs may retain customer content for up to 30 days. Eligible customers may obtain Modified Abuse Monitoring or Zero Data Retention. Responses API application state has separate storage behavior; LIB read therefore sends `store:false` for the audited Responses requests, while recognizing that `store:false` does not by itself mean Zero Data Retention or eliminate applicable abuse/security/legal retention.

**LIB read account-specific status:** the repository and available Vercel project access do not expose the OpenAI organization/project data-sharing toggle or ZDR/MAM approval state. Those account-level settings remain **unverified** in this audit. Do not replace that statement with “ZDR is enabled” or “data sharing is disabled” unless the OpenAI organization/project settings are checked directly.

The audited paths do not use OpenAI Files, Batch, Assistants, or vector-store endpoints for author works.

## Aivis / VOICEVOX note

The code talks to configurable engine URLs. Defaults point to loopback/local engines. Production endpoint/account configuration was not proven from the source audit, so this document does not assert that Production uses a particular hosted Aivis/VOICEVOX service or its retention policy. Recording permission remains the governing product boundary for synthetic narration.

## Public Web crawlers are separate

Current `src/app/robots.ts` has a general `userAgent: "*"` rule that allows public pages while disallowing API/private-library surfaces. There are no dedicated GPTBot, Google-Extended, ClaudeBot, or Bytespider rules in the audited file.

Official controls reviewed:

- OpenAI crawler documentation: https://platform.openai.com/docs/bots
- Google-Extended: https://developers.google.com/search/docs/crawling-indexing/google-common-crawlers#google-extended
- Anthropic crawler documentation: https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler

Crawler policy is not the same as LIB read's own API processing. A robots rule is also not a guarantee that no third party can obtain or use a public page. Child79 intentionally does **not** change crawler policy because doing so has discoverability/SEO/AI-search trade-offs and requires a separate product decision.

## Terms / Privacy assessment

Current Terms keep copyright in the posted work with the user/rightsholder and grant LIB read a non-exclusive service-operation license. The audited Terms do not contain an explicit broad grant allowing LIB read to use ordinary author works as model-training/fine-tuning datasets.

The Privacy page now focuses on active Private Library and public-work AI translation/word-explanation processing. The obsolete active-AI-story-generation disclosure was removed together with that feature. Child79 retains a focused public-work AI translation/word-explanation disclosure.

## Human translation handoff

The current `translation_permission_mode` is, in operational reality, the server boundary for **new AI translation processing**. Child80 should split provenance and permission so that:

- AI translation permission governs external AI processing;
- Human translation permission governs whether human translators may create/publish a translation;
- cached AI translations retain AI provenance;
- Human translations retain translator identity/provenance;
- neither permission is inferred from the other.

Human translation itself is not implemented by Child79.
