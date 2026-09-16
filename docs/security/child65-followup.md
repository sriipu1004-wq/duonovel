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

## Supabase Security Advisor re-check

Current security advisor state was re-read after the deployed Child 65 migrations.

- `rls_enabled_no_policy`: INFO only for 27 intentionally server/internal tables. With RLS enabled and no policy, browser roles receive no row access; these are not treated as exposure findings by themselves.
- `authenticated_security_definer_function_executable`: 10 remaining notices were re-checked against live function metadata. All have `search_path=public`; neither `anon` nor `authenticated` can `CREATE` in the `public` schema, so a caller cannot use a public-schema object shadowing attack. Nine functions explicitly reference `auth.uid()`. The tenth, `count_private_library_import_usage()`, is a `RETURNS trigger` function rather than a normal client RPC and is therefore an advisor false-positive for direct RPC execution. The dangerous server-contract RPCs found in the original Child 65 audit remain unavailable to browser roles.
- Supabase Auth leaked-password protection remains disabled. This stays P2 account hardening and requires an Auth configuration change rather than an application-code security patch.

Read-only grant/policy verification also reconfirmed that `episode_translations` and `bilingual_word_explanations` have no browser SELECT/mutation grants, financial ledger/lot/unlock tables expose at most user-scoped reads through RLS, and canonical public/owner policies remain on `series`, `episodes`, and `recordings`.

## Remaining bounded P2 / P3

P2:
- generated-story translation still accepts generated-story source text supplied by the browser rather than a server-issued proof binding it to the immediately preceding generation. Existing source-size, AI action, translation request and cost limits bound the impact; this is not a public-translation credit entitlement bypass.
- time-fit save/publish quota checks remain count-then-write and can exceed the nominal limit under concurrent requests.
- time-fit private-save still accepts an editor display-name candidate from the client for the same user's profile path; DB uniqueness prevents duplicate normalized display names, but canonical server profile data would be cleaner.
- Supabase Auth leaked-password protection remains disabled.
- the episode-translation status GET route can perform timeout cleanup of a shared `translating` row after the stuck threshold when the original episode is readable. This is bounded shared-state cleanup, but moving timeout finalization to the generation/worker boundary would reduce mutation in a GET path.
- selected server error paths still return underlying storage/reservation error messages. No secret value exposure was established, but normalizing those responses remains low-risk information-minimization work.

P3:
- legacy reader-card-like structures and performance-advisor warnings remain deferred unless they become operationally relevant;
- `search_path=public` on the remaining reviewed SECURITY DEFINER functions is safe under current schema CREATE grants, but schema-qualified references plus an empty/minimal search path would be stronger defense-in-depth if those functions are rewritten later;
- the Turbopack dynamic ffmpeg output-tracing warning remains an operational/build-hardening item, not an authorization finding.

## Validation plan

The follow-up branch adds `npm run test:security-authz` and includes it in the security validation workflow together with the existing auth, Stripe webhook, public/workspace schema, translation permission, public search, billing locale, dependency audit, diff lint, and Production build checks.

The authorization regression now covers:
- translation entitlement before service-role cached translation reads;
- canonical public-work filtering after service-role profile aggregation;
- R18 and episode visibility on reader aggregation;
- authentication before `human-publish` multipart parsing;
- blocked R18 reader payload and metadata minimization.

No database migration is required for SEC-21 through SEC-24.

## Deployment state

This follow-up branch is not merged to `main` and is not deployed to Production. No real-card Stripe E2E is performed by this follow-up.
