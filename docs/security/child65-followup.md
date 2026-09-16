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

## Supabase Security Advisor re-check

Current security advisor state was re-read after the deployed Child 65 migrations.

- `rls_enabled_no_policy`: INFO only for 27 intentionally server/internal tables. With RLS enabled and no policy, browser roles receive no row access; these are not treated as exposure findings by themselves.
- `authenticated_security_definer_function_executable`: 10 remaining functions. These are the previously reviewed private-library/session-self/read RPCs (`begin/append/complete/abort/import private library`, private-library section/progress helpers, and self credit/unlock reads). The dangerous server-contract RPCs found in the original Child 65 audit are no longer browser-executable. No new privilege escalation was established in this follow-up.
- Supabase Auth leaked-password protection remains disabled. This stays P2 hardening and requires an Auth configuration change rather than an application-code security patch.

## Remaining bounded P2 / P3

P2:
- generated-story translation still accepts generated-story source text supplied by the browser rather than a server-issued proof binding it to the immediately preceding generation. Existing source-size, AI action, translation request and cost limits bound the impact; this is not a public-translation credit entitlement bypass.
- `human-publish` still parses multipart form data before its later authenticated ownership check. The upload is size/type checked after parsing; moving auth ahead of multipart parsing remains resource-hardening work.
- Reader metadata for an R18 work is assembled from the same server payload that later returns `r18Blocked`; the layout blocks the content body, but metadata minimization for a blocked viewer remains a privacy-hardening item.
- time-fit save/publish quota checks remain count-then-write and can exceed the nominal limit under concurrent requests.
- leaked-password protection remains disabled in Supabase Auth.

P3:
- legacy reader-card-like structures and performance-advisor warnings remain deferred unless they become operationally relevant.

## Validation plan

The follow-up branch adds `npm run test:security-authz` and includes it in the security validation workflow together with the existing auth, Stripe webhook, public/workspace schema, translation permission, public search, billing locale, dependency audit, diff lint, and Production build checks.

No database migration is required for SEC-21 or SEC-22.

## Deployment state

This follow-up branch is not merged to `main` and is not deployed to Production. No real-card Stripe E2E is performed by this follow-up.
