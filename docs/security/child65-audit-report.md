# Child 65: Authentication / RLS / API / Billing / Webhook Security Audit

Base commit: `d7180c1ebc99b0bdbd5b135467fd1b402b21e4bb`

Audit branch: `security/auth-rls-payment-audit`

PR: #38

Merged main commit: `252f85968c111cd68d0d0b8db58c8231a3738a6a`

Scope: existing Production functionality only. No new product feature was introduced by this audit.

## Critical findings fixed

### SEC-P0: legacy publication RLS exposed private/draft rows

`series` had two permissive SELECT policies. A legacy `is_public` policy could make a row visible even while canonical `publication_status` was `private`. `episodes` inherited the same legacy gate and did not require canonical posted/published state.

Fix:
- use canonical `publication_status = 'public'` for public series access;
- require parent series public + episode `posting_status = 'posted'` + `is_published = true`;
- retain owner access through `auth.uid()`.

Production aggregate-only validation found private-series episode rows affected by the old policy. No private episode bodies were read during the audit.

Post-deploy negative verification as `anon` returned:
- visible private series: `0`;
- visible nonpublic episodes: `0`;
- visible public series: `40`;
- visible public episodes: `440`.

### SEC-P0: internal SECURITY DEFINER RPCs were directly executable

Several server-contract RPCs accepted caller-supplied user IDs, resource IDs, limits or cost values and were executable by browser roles. The time-fit continuation reservation/completion chain could be abused to modify another user's work if target IDs were known.

Fix:
- revoke PUBLIC / anon / authenticated execution from server-contract generation, translation, AI-budget and snapshot RPCs;
- grant `service_role` only where the application already invokes the RPC through authenticated server code;
- retain authenticated execution only for session-bound private-library/self-read RPCs that enforce `auth.uid()` internally;
- pin helper function search paths.

Post-deploy grant verification confirmed the audited server-contract RPCs are no longer executable by `anon` or `authenticated`, while `service_role` retains execution.

### SEC-P1: cross-user shared-asset mutation

Authenticated users could update/delete arbitrary objects in the `illustrations` bucket, and shared BGM catalog assets were writable by ordinary authenticated users.

Fix:
- make the BGM catalog site-managed;
- preserve direct illustration uploads only for `effects/<series>/<series-or-episode>/...` paths belonging to a series owned by the current user;
- require storage object ownership for update/delete;
- enforce the image-only / 5 MiB bucket limit.

A weaker duplicate storage migration was detected during the audit and removed because permissive RLS policies would have ORed with the stricter policy.

### SEC-P1: unauthenticated pending-account deletion and email enumeration

The signup preparation endpoint scanned Supabase Auth users and deleted a matching unconfirmed account based only on an unauthenticated email request. A separate endpoint exposed whether an email was available, confirmed or unconfirmed.

Fix:
- remove unauthenticated Auth-admin scans/deletes from signup preparation;
- return a non-enumerating email preflight result;
- let Supabase Auth own duplicate-account behavior.

### SEC-P1: popularity / social integrity weaknesses

The audit found direct-client mutation paths, weak target validation and public social rows attached to nonpublic content.

Fix:
- move series reaction mutation behind the server API and validate the target series;
- move bookmark mutation behind the server API, preventing arbitrary client-supplied ranking timestamps;
- harden view/play event ingestion and target consistency;
- bind comments/reviews/likes visibility to canonical public work/episode state;
- bind public recordings to canonical public work/episode state;
- add author-follow/profile-like target integrity and server-side target validation;
- close obsolete legacy recording-request mutations.

#### Post-deploy correction: reaction uniqueness

The initial audit report incorrectly stated that `user_series_reactions` lacked uniqueness on `(user_id, series_id)`. Re-checking the original migration `202603290730_create_user_series_reactions.sql` confirmed that `user_series_reactions_user_series_uidx` already enforced that uniqueness before Child 65.

Therefore:
- the claim that one account could create unlimited duplicate reactions was incorrect and is withdrawn;
- the server-API/target-validation hardening remains valid;
- the redundant second unique index introduced during the audit is removed by the post-deploy cleanup migration, preserving the original canonical unique index.

## Billing and credits

Verified controls:
- Checkout price/customer/redirect values are server-selected;
- credit pack credits, price and expiry come from the server catalog;
- Billing Portal customer ID is derived from the authenticated user's stored Stripe mapping;
- webhook signature is verified before mutation;
- Checkout Session / line items are re-read from Stripe and validated against catalog price, quantity, currency, amount, customer and LIB read user mapping;
- grant/reversal paths use DB idempotency / uniqueness and transaction-level locking;
- full refunds and disputes perform full reversal; partial refunds do not guess a credit reversal; dispute wins do not automatically regrant credits;
- browser roles do not receive direct financial mutation grants.

Additional fix:
- Stripe Customer creation uses an idempotency key keyed by LIB read user ID, preventing concurrent Checkout requests from creating competing customer mappings.

No real-card payment E2E was performed.

## Private library / upload / parser

Verified:
- work edits/deletes and glossary mutations are owner-bound;
- progress updates are session-bound through `auth.uid()`;
- import RPC exposure is restricted appropriately by role;
- parser limits exist for input bytes, characters, section/chapter counts and ZIP expanded size/entry counts;
- archive paths are normalized and parsing does not extract arbitrary paths to the filesystem;
- PDF.js asset endpoint is limited to fixed local package directories and a safe filename regex; it does not fetch arbitrary URLs.

Audio upload validation authenticates before parsing the upload-check multipart body. The full human-publish route still parses multipart input before its later authenticated ownership check; this remains a bounded P2 resource-hardening item because fixing it safely requires reorganizing a large route during feature freeze.

## App security

Verified / fixed:
- login/callback `next` paths are normalized to same-origin relative paths and regression-tested against protocol-relative/backslash/control-character variants;
- Preview negative testing confirmed an external `next=https://evil.example` value is reduced to the local login flow with `next=/`;
- no current-tree `dangerouslySetInnerHTML` use was found;
- no permissive custom `Access-Control-Allow-Origin` configuration was found;
- service-role creation is contained in a `server-only` module;
- no current-tree literals matching common Stripe/Supabase/OpenAI secret formats were found;
- `.env*` remains ignored;
- response hardening headers include frame protection, `nosniff`, HSTS, referrer policy, permissions policy and cross-domain policy;
- CSP is intentionally limited to `frame-ancestors 'none'` in this audit to avoid introducing a broad CSP regression across Next.js, Stripe and Supabase.

GitHub connector access does not expose complete secret-scanning/history guarantees, so the current tree was checked but historical secret exposure cannot be conclusively certified by this audit alone.

## Remaining P2 / P3 items

P2:
- generated-story translation accepts the client-supplied generated story body without a server-issued proof tying it to the immediately preceding generation; usage is still bounded by AI/translation quotas and source-size limits, so this is not a credit/subscription bypass;
- human-publish parses multipart input before its later auth check;
- time-fit save/publish quota checks are count-then-write and can exceed the nominal limit under concurrent requests;
- time-fit private-save accepts an editor display-name candidate from the client for the same user's profile path; DB uniqueness prevents duplicate normalized display names, but the route should eventually use only the canonical verified profile name;
- Supabase Auth leaked-password protection is disabled and should be enabled as an account hardening setting after deployment planning.

P3:
- legacy reader-card-like structures remain and should be removed only after confirming no compatibility dependency;
- Supabase performance advisor reports RLS init-plan, unindexed-FK, duplicate-index and related performance warnings; these are outside the security freeze scope unless they become measurable production bottlenecks;
- the build emits a Turbopack broad output-tracing warning around dynamic ffmpeg spawn logic; review separately from this authorization audit.

## Validation artifacts

Read-only Supabase verification queries are in:

`docs/security/child65-supabase-verification.sql`

The security CI on audited branch head `9295870a6ea0c7c223cf43800db8c55bd7e6f707` validated:
- locked dependency install;
- runtime dependency audit;
- auth redirect regression;
- Stripe credit webhook regression;
- public/workspace/translation schema regressions;
- public search language filters;
- billing locale routing;
- security-diff lint;
- Production build with non-secret placeholder build-time Supabase values.

## Production deployment state

Child 65 was approved and deployed on 2026-09-16.

- PR #38 was squash-merged to `main`.
- Production main commit: `252f85968c111cd68d0d0b8db58c8231a3738a6a`.
- Vercel Production deployment `dpl_5KttVFgMk6vrD55ot7LdrvN9hTA4` reached `READY`.
- The custom Production domain returned HTTP 200 after deployment.
- Production response headers include `Content-Security-Policy: frame-ancestors 'none'`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, HSTS, Referrer-Policy and Permissions-Policy.
- No error/fatal runtime logs were observed on the new Production deployment during the post-deploy verification window.
- All Child 65 Supabase hardening migrations were applied successfully.
- Post-deploy RLS/RPC/storage/grant checks succeeded.
- Supabase Security Advisor no longer reports the previously exposed server-contract SECURITY DEFINER functions as browser-executable. Remaining SECURITY DEFINER warnings are intentional session-bound/self-read RPCs reviewed during the audit.
- Supabase Auth leaked-password protection remains the main outstanding account-hardening warning.

No real-card Stripe E2E was performed as part of Production verification. Child 66 UI/mobile QA is a separate follow-up phase.
