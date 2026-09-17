# Child 65 follow-up security audit

Base main: `e76af08544ce4494bec83c3d0369346ff7f91cad`

Branch: `security/child65-followup`

Scope: post-deployment follow-up of the existing Child 65 authorization/privacy audit. No product feature is added.

## Findings addressed

### SEC-21 — P1 — public translation-derived word explanation access

Surface: `/api/word-explanations` for `contentType=episode`.

Impact: the route validated that the original episode was readable, then used the service-role client to read the saved translated segments. Under public translation credit enforcement, that was a separate authorization boundary from the original text and could expose information derived from a cached translation before the current user had unlocked that episode + target-language entitlement.

Fix: resolve the server-side public translation entitlement before reading `episode_translations.segments`. When credit enforcement is active, only `unlocked` may continue. The check occurs before the service-role translation read. When enforcement is disabled, the existing behavior remains unchanged.

Regression: `scripts/test-security-authz.ts` asserts the entitlement guard exists and precedes the service-role translated-segment read.

### SEC-22 — P1 — service-role public profile metadata isolation

Surface: public author work lists, author narration lists, and reader narration work lists.

Impact: these pages intentionally use an admin/service-role client for aggregation. Some paths filtered by episode/recording state but did not re-apply the canonical series publication boundary after the RLS-bypassing read. In inconsistent or stale rows this could expose title/summary-style metadata for a nonpublic work. The reader narration list also did not consistently re-apply the R18 preference and recording episode visibility boundary.

Fix:
- author work pages now require canonical `publication_status=public` before building public cards;
- author narration aggregation now requires the parent series to be public and respects R18 preference;
- reader narration aggregation now requires public parent series, respects R18 preference, and rejects recordings bound to non-visible episodes.

Regression: `scripts/test-security-authz.ts` statically verifies these server-side guards.

### SEC-23 — P2 — unauthenticated multipart parsing on human narration publish

Surface: `/api/recordings/human-publish`.

Impact: the route parsed `multipart/form-data` before checking the Supabase session. Although the audio file was size/type validated before expensive transcription and publication work, unauthenticated callers could still force multipart parsing and allocation.

Fix: authenticate with the session client before calling `request.formData()`. Existing exact series/episode RLS checks, recording permission checks, consent checks, audio validation, and publication logic remain unchanged.

Regression: `scripts/test-security-authz.ts` asserts that `auth.getUser()` occurs before multipart parsing.

### SEC-24 — P2 — blocked R18 reader payload / metadata minimization

Surface: public reader route `/read/[seriesId]/[episodeNumber]`.

Impact: the parent layout rendered an R18 gate when the viewer preference blocked an R18 work, but the child page and metadata path still received the full server payload and could construct title/summary/body-derived values before the gate was rendered. That was unnecessary data handling at the denied boundary.

Fix:
- blocked R18 metadata now returns generic `noindex, nofollow` metadata before title/summary/author extraction;
- the reader page returns `null` immediately for `r18Blocked`, leaving the parent layout to render the gate and preventing construction/serialization of the child reader payload.

Production currently has no public R18 episode available for a safe live negative test, so this is enforced by regression/build validation rather than a destructive or synthetic Production data test.

### SEC-25 — P2 — time-fit private-save mass-assignment / input / error boundary

Surface: `/api/time-fit-stories/save-private`.

Impact:
- JSON parsing happened before authentication;
- the service-role route accepted a client-supplied `editorName` as the first public display-name candidate and also fell back to the account email;
- direct requests could provide much larger story/profile payloads than the normal generation UI;
- several database errors were returned verbatim to the client.

No existing public profile row with an email-shaped `display_name` was found in the live aggregate-only check. The `users` table has RLS enabled; authenticated users have self-only SELECT/UPDATE policies and anon has no row-select policy. The issue is therefore classified as P2 route hardening rather than an established cross-user exposure.

Fix:
- authenticate before JSON parsing;
- enforce request/title/synopsis/body/tag bounds;
- derive the display name from the existing server profile or authenticated metadata and never from `payload.editorName` or email;
- do not overwrite an existing public profile row merely because the story-save route ran;
- keep detailed database failures in server logs and return stable generic client errors.

Regression: `scripts/test-security-authz.ts` checks ordering, field trust, bounds, and raw-error suppression.

### SEC-26 — P2 — time-fit publish request / service-role mutation hardening

Surface: `/api/time-fit-stories/publish`.

Impact: JSON parsing occurred before authentication, `seriesId` was not explicitly validated as a UUID, and several Supabase error strings were returned verbatim. The route already checked the loaded series owner, but the later service-role updates relied on the earlier application check rather than repeating owner/parent predicates in the mutation query.

Fix:
- authenticate before JSON parsing and bound the request size;
- reject malformed `seriesId` before database access;
- retain `author_id = current user` on the service-role series UPDATE;
- retain `series_id` on the episode UPDATE;
- normalize database failures returned to the client while preserving server diagnostics.

The existing count-then-write publish limit is intentionally not redesigned in this patch; that requires a transactional DB reservation rather than a route-local check.

### SEC-27 — P2 — translation-status storage error disclosure

Surface: `/api/episode-translations/[episodeId]` GET.

Impact: underlying storage error messages from current/stale translation lookups were reflected to the client. No secret value exposure was established, but the responses disclosed unnecessary database/provider detail.

Fix:
- reject malformed episode UUIDs before the database path;
- log detailed storage errors server-side;
- return a stable generic `translation_storage_unavailable` message to the client.

The existing stuck-translation timeout cleanup performed by the GET route remains listed below as bounded shared-state cleanup; moving it to a worker/generation boundary would be a behavioral refactor beyond this follow-up.

## Supabase Security Advisor re-check

Current security advisor state was re-read after the deployed Child 65 migrations.

- `rls_enabled_no_policy`: INFO only for 27 intentionally server/internal tables. With RLS enabled and no policy, browser roles receive no row access; these are not treated as exposure findings by themselves.
- `authenticated_security_definer_function_executable`: 10 remaining notices were re-checked against live function metadata. All have `search_path=public`; neither `anon` nor `authenticated` can `CREATE` in the `public` schema, so a caller cannot use a public-schema object shadowing attack. Nine functions explicitly reference `auth.uid()`. The tenth, `count_private_library_import_usage()`, is a `RETURNS trigger` function rather than a normal client RPC and is therefore an advisor false-positive for direct RPC execution. The dangerous server-contract RPCs found in the original Child 65 audit remain unavailable to browser roles.
- Supabase Auth leaked-password protection remains disabled. This stays P2 account hardening and requires an Auth configuration change rather than an application-code security patch.

Read-only grant/policy verification also reconfirmed that `episode_translations` and `bilingual_word_explanations` have no browser SELECT/mutation grants, financial ledger/lot/unlock tables expose at most user-scoped reads through RLS, and canonical public/owner policies remain on `series`, `episodes`, and `recordings`.

The live `users` table re-check confirmed RLS is enabled with authenticated self-only SELECT/UPDATE policies; anon has no row-select policy. An aggregate-only query found zero email-shaped `display_name` rows at the time of this follow-up.

## Remaining bounded P2 / P3

P2:
- generated-story translation still accepts generated-story source text supplied by the browser rather than a server-issued proof binding it to the immediately preceding generation. The generation endpoint records request/rate/cost metadata but does not persist the generated body; the Reader stores the generated story in browser session/local storage. Correctly binding the translation request therefore requires a new server receipt/state mechanism. Existing authentication, source-size, AI-action, translation-request, and cost limits bound the impact; this is not a public-translation credit entitlement bypass.
- time-fit private-save and publish quota checks remain count-then-write and can exceed the nominal limit under concurrent requests. A correct fix needs a transactional reservation/advisory-lock RPC or equivalent DB constraint, so it is not replaced by another route-local check during feature freeze.
- Supabase Auth leaked-password protection remains disabled and requires an explicit Auth configuration change.
- the episode-translation status GET route can perform timeout cleanup of a shared `translating` row after the stuck threshold when the original episode is readable. This is bounded shared-state cleanup; moving timeout finalization to the generation/worker boundary would reduce mutation in a GET path but changes runtime behavior.
- other legacy AI/generation paths still contain some provider/internal error strings. No secret-key/token exposure was established in the audited paths; broad response normalization should be handled as a separate low-risk hardening pass rather than rewriting every generation route inside this freeze.

P3:
- legacy reader-card-like structures and performance-advisor warnings remain deferred unless they become operationally relevant;
- `search_path=public` on the remaining reviewed SECURITY DEFINER functions is safe under current schema CREATE grants, but schema-qualified references plus an empty/minimal search path would be stronger defense-in-depth if those functions are rewritten later;
- the Turbopack dynamic ffmpeg output-tracing warning remains an operational/build-hardening item, not an authorization finding.

## Validation plan

The follow-up branch adds `npm run test:security-authz` and includes it in the security validation workflow together with the existing auth, Stripe webhook, public/workspace schema, translation permission, public search, billing locale, dependency audit, diff lint, and Production build checks.

The authorization/security regression covers:
- translation entitlement before service-role cached translation reads;
- canonical public-work filtering after service-role profile aggregation;
- R18 and episode visibility on reader aggregation;
- authentication before `human-publish` multipart parsing;
- blocked R18 reader payload and metadata minimization;
- time-fit private-save authentication ordering, profile source, input bounds, and error minimization;
- time-fit publish authentication ordering, UUID/ownership predicates, and error minimization;
- translation-status UUID validation and storage-error minimization.

No database migration is required for SEC-21 through SEC-27.

## Deployment state

This follow-up branch is not merged to `main` and is not deployed to Production. No real-card Stripe E2E is performed by this follow-up.
