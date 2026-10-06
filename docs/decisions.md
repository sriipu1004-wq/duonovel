# LIB read — Durable Decision Log

Last updated: **2026-10-06**

This log records decisions that future chats must not casually reverse. It is not a chronological implementation diary. Add an entry only when the decision has lasting product/architecture consequences.

## D001 — Reader has three modes

Decision:
- Original
- Bilingual
- Translation only

AI vs Human is a translation-source choice, not a fourth Reader mode.

Reason:
The reading presentation mode and the provenance of the translation are separate concepts. Keeping them separate prevents UI and state explosion.

Do not:
- add “Human mode”
- add “AI mode” as a Reader mode
- tie bookmark identity to translation source

## D002 — UI locale, source language, and target reading language are separate

Decision:
These remain three distinct concepts.

Consequences:
- Search filters source language, not “read language”
- changing UI locale must not change the source-language corpus
- translation target belongs to Reader/translation state

Do not restore the retired `read_language` Search model without a new explicit product decision.

## D003 — AI novel/story generation is retired

Decision:
LIB read does not provide first-party AI generation of novel/story prose.

Removed:
- story generator
- continuation generator
- generated-story Reader/runtime
- generated-story translation runtime
- AI Story pricing/quota
- persisted LIB read-generated AI stories
- AI-generated special-case runtime branches

Reason:
Observed usage was very low while the feature imposed significant trust/brand cost for a fiction-posting platform. AI remains useful as reading/translation support.

Do not reintroduce AI Story generation as an incidental feature.

## D004 — AI translation remains, but author-controlled

Decision:
AI translation is a reading/translation support feature. New provider calls require author AI-translation permission.

Important behavior:
- posting/publishing/open permission does not automatically call the provider
- provider call occurs when a reader requests a missing translation and server checks pass
- closed permission blocks new AI translation and new AI word-explanation provider calls
- cached/existing assets are not silently destroyed when permission changes

## D005 — Human translation is separate provenance

Decision:
Human translation is user-generated translation content, not an AI-cache variant.

Consequences:
- separate permission from AI translation
- separate storage/provenance
- translator identity
- draft/publish/withdraw workflow
- free to read
- no AI allowance/credit/unlock
- no OpenAI call in Human translation workflow
- multiple Human translators may coexist for one episode/target

## D006 — Existing general works were not silently Human-opened

Decision:
When Human translation was introduced:
- existing general works defaulted Human translation closed
- rightsChecked Public Domain works were opened
- legacy rights-unverified Official works remained closed
- new works default Human open

Reason:
Avoid changing author permissions retrospectively.

## D007 — Translation consistency is work-level and bounded

Decision:
Long-form AI translation uses:
- work-level glossary
- target-language-specific terms
- author/editor locked terms
- limited previous published-episode context

Do not send hundreds of episodes/the whole novel on every request.

Do not claim perfect consistency or human-level translation quality.

## D008 — Shared AI translation cache is not model training

Decision:
Generated public AI translations may be stored and reused for the same source version/language entitlement path.

This is an application-level translation asset/cache and must not be described as training the model.

Private Library translation remains separate and owner-scoped.

## D009 — Public Domain requires provenance, not “Official” status

Decision:
A work is not rightsChecked merely because LIB read Official publishes it.

Current Public Domain flow requires provenance/rights review and tracked manifest evidence.

Consequences:
- rightsChecked and legacy Official cohorts remain distinct
- no fabricated source/edition/translator metadata
- no mass-open based only on Official ownership
- rights-unverified legacy works are handled individually

## D010 — Public Domain repartition must be lossless

Decision:
Where rights/dependency gates permit repartition:
- target ~8,000 chars
- hard max 10,000 chars
- source body preserved by contiguous slices
- hash verification required
- original episode ID remains on Part 1 where applicable

Do not normalize/strip source text merely to make translation easier.

## D011 — Translation segmentation v3 is canonical

Decision:
Public translation uses the Child75 segmentation baseline:
- max batch 3,000 source chars
- max 60 segments per provider batch
- `TRANSLATION_SEGMENT_VERSION=3`
- compact Reader markers, max lookahead 80
- punctuation-only translated segments are valid

Performance work must not silently roll this back.

## D012 — Pricing and quota model

Decision:
Free:
- ¥0
- public AI translation unlock + My Library import share 3/day
- My Library capacity 3

Premium:
- ¥680/month
- public AI translation unlock 30/day
- My Library import no daily count
- My Library capacity 20

Credits:
- 5 = ¥300
- 8 = ¥450
- 12 = ¥600
- 150-day validity
- 1 credit = one public episode × target-language AI translation unlock

Human translation is free and uses none of these credits/allowances.

AI Story quota is retired.

## D013 — Human narration and TTS are separate

Decision:
Human narration means actual human-recorded/uploaded audio.

Aivis / VOICEVOX / browser speech are synthetic playback, not Human narration.

Do not relabel synthetic audio as Human narration.

## D014 — Performance strategy is progressive, not destructive

Decision:
Prioritize above-the-fold content and reduce blocking fetches while preserving correctness.

Do:
- parallelize independent fetches
- stream secondary content
- avoid overfetching episode bodies
- fetch selected Human translation payload only when needed

Do not:
- truncate correct result counts
- weaken auth/R18/publication/permission gates
- trade correct >1000-row behavior for speed

## D015 — Search stays lightweight and explainable

Decision:
Search currently uses source-language filters, dynamic facets, normalized/fuzzy metadata matching, and URL pagination.

Do not add AI semantic/vector search or generated aliases without a new explicit product decision.

Cross-language aliases must come from real metadata, not per-title hardcoding.

## D016 — AI data-use claims must stay within verified facts

Decision:
Do not say “nothing is stored” or “AI never sees the work” when AI translation requires provider processing.

Current audited facts include:
- foreground OpenAI Responses requests use `store:false`
- OpenAI published API policy says API inputs/outputs are not used for training by default
- standard abuse-monitoring retention may be up to 30 days
- LIB read OpenAI account-specific data-sharing/ZDR/MAM status is unverified

Public copy must keep this distinction.

## D017 — Preview approval is the merge gate

Decision:
Normal feature workflow is:

latest main -> branch -> implementation -> validation -> Draft PR -> Vercel Preview -> user review -> explicit approval -> merge -> Production verification

Do not merge before explicit user approval unless the user has explicitly changed this workflow.

## D018 — Chat history is not the only source of truth

Decision:
Future parent/child chats should read:
- `docs/project-state.md`
- `docs/roadmap.md`
- this file
- relevant feature-specific docs

The repository state is used to preserve priority and canonical decisions across chat replacement/context compression.

## D019 — Public pages must isolate optional dependency failure

Decision:
A failure in optional/viewer-specific data must not make unrelated public content unusable.

Examples of optional/viewer-specific data:
- public-page Auth/viewer state
- subscription personalization
- bookmarks
- recording/narration aggregates
- related works
- popularity metrics

Consequences:
- public Hero/core content must render independently where its own critical data is available
- optional sections use local fallback/retry states
- loading must be bounded; do not leave indefinite spinners
- limited retries are permitted only for safe read-only transient-network failures

Do not blindly retry mutations, credits, unlocks, payments, permission changes, or publishing.

Reason:
The 2026-10-03 Supabase/network incident showed that broad dependency coupling can turn an upstream partial outage into a whole-page LIB read outage.

## D020 — Optimize by reducing work, not by weakening correctness

Decision:
The reliability/performance workstream keeps the current UI/feature semantics by default and first reduces query count, rows, columns, N+1 calls, raw-event processing, cache rebuilds, and critical-path dependencies.

Do not:
- remove UI solely because it is currently expensive
- weaken R18/auth/ownership/publication/translation-entitlement checks
- trade correct Search result counts for speed
- create a duplicate popularity aggregate when `series_popularity_daily` already exists without evidence that it is insufficient

UI removal requires a separate explicit user decision after isolation/narrow-query/lazy-load options are measured.

## D021 — Public Domain corpus growth is gated by capacity verification

Decision:
Do not jump from the current corpus directly to hundreds of additional Public Domain works while broad all-corpus reads remain.

Order:
1. Child84 reliability/performance hardening
2. controlled 30–60 rights/provenance-verified Public Domain works
3. Production scale verification
4. further staged growth only after the gate passes
5. Acquisition after the initial scale gate

This priority change was explicitly approved by the user after a Production incident and therefore satisfies the roadmap priority-change protocol.

Public Domain rights/provenance rules are unchanged.

## D022 — Dependency unavailability is not a valid business-state value

Decision:
A failed or timed-out read must not be silently reinterpreted as a real zero/false state when that distinction affects user meaning.

Examples:
- Auth unavailable is not proof that the viewer is signed out;
- public-work data unavailable is not proof that zero public works exist;
- bookmark/subscription data unavailable is not proof that the user has none;
- popularity data unavailable is not proof that popularity is zero.

Consequences:
- use explicit availability state or section-local unavailable UI where the distinction matters;
- fail closed for security-sensitive gates such as private ownership and R18;
- do not weaken permission checks to preserve rendering during an outage.

Reason:
The 2026-10-03/04 incident showed that treating dependency failure as ordinary empty data can avoid a global error while still presenting materially false state.

## D023 — A public-read deadline must stop underlying work when supported

Decision:
A bounded public read is not considered contained merely because the UI stops awaiting it. When the database/client API supports cancellation, the underlying HTTP/PostgREST request must receive an AbortSignal and be aborted at the deadline.

Consequences:
- locally generated read deadlines are not retried;
- immediate terminated transient failures such as explicit 522/503/connection-reset responses may still use a small read-only retry budget;
- a narrow-query compatibility fallback to `select("*")` is permitted only for recognizable schema/column mismatch, not for network/gateway/timeout/abort failures;
- public route layers that independently query Supabase must each have their own bounded/cancelable failure path.

Reason:
Preview measurement during the 2026-10-04 incident showed that a `Promise.race` timeout could render fallback UI while an un-aborted Supabase request kept a streamed Work response open for about 40 seconds. Adding request cancellation and bounding the Work layout reduced the sampled failure response to about 5.7 seconds without weakening publication, ownership, R18, or translation permission checks.


## D024 — Browser-direct Reader fallback is not adopted under the current failure mode

Decision:
Do **not** ship the Child84b anonymous browser-direct Supabase Reader fallback.

The prototype established a security contract that could keep the fallback public-source-only and R18 fail-closed, but Preview failure simulation showed that the browser path does not recover the current outage. The end-user browser reached the Supabase/Cloudflare gateway and completed the CORS preflight, while the actual public Data API GET remained unanswered. A separate direct GET from the authorized validation machine also timed out after 15 s with 0 response bytes / HTTP 000.

Therefore the current failure is not isolated to the Vercel -> Supabase hop. Shipping the fallback would add another browser-side data-access surface and another bounded wait without providing demonstrated availability.

Security findings retained from the prototype:
- frontend Supabase access must use only the publishable/legacy anon credential; `service_role` remains forbidden;
- canonical repository RLS restricts anonymous series reads to `publication_status = 'public'` and episode reads to public series plus `posting_status = 'posted'` and `is_published = true`;
- live Production policy/grant verification is still blocked by the same SQL connection timeout and must be repeated after recovery;
- RLS is not the R18 viewer-preference gate. Any future browser fallback must verify series rating before an episode/body request and exclude R18 when viewer preference cannot be proven;
- private/owner-only, draft, scheduled, unpublished, deleted/unverified content, translations, entitlement/credits, narration, bookmarks/reactions, publishing, and all mutations remain outside any such fallback.

Re-entry conditions:
- only reconsider browser-direct after a future incident demonstrates that representative browser Data API GETs remain healthy while the server-side Reader path is transiently unavailable;
- require live RLS/grant verification and security regression before adoption;
- do not treat 404/not-found, permission denial, invalid IDs, or business-state absence as an outage trigger.

Infrastructure alternatives:
- Vercel region relocation alone remains rejected because the prior `sin1` Preview reproduced the failure;
- Supabase Read Replica remains unadopted for outage failover: eligibility/cost still require project-specific verification, and asynchronous replication can produce stale publication state that conflicts with the requirement not to expose deleted/unpublished content;
- stale public snapshots/mirrors remain blocked until publish/edit/unpublish/delete have a complete server-controlled invalidation/tombstone boundary.

Reason:
Child84b was created to diversify the actual failure domain, not merely to add another code path. The observed browser/direct-GET timeout proves that this prototype did not establish the required independence, so non-adoption preserves a smaller attack surface and lower incident latency without giving up a demonstrated recovery path.
