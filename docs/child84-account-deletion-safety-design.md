# Child84h — Account deletion safety and retention design (PROPOSED, NOT APPROVED)

Status: **Draft interim safety gate plus proposed future contract**. Not a permanent product/rights decision.
Date: 2026-10-11 AEST. Base: `b49e797313b0daf0d245e7e39e48dc22d520be7b`.
Scope: Child84 P4 remainder only. Child84 NOT DONE; Child85 BLOCKED.

## 1. Evidence and the immediate risk

Current `/api/account/delete` authenticates, cancels blocking Stripe subscriptions, calls
`admin.auth.admin.deleteUser(user.id, true)` (Auth soft-delete), expires a public card cache tag,
then returns success. It neither unpublishes `series` nor deletes Personal Library, translations,
reading progress, narration, associated Storage objects or all detached audit/credit rows.
That contradicts Privacy section 15's former unqualified deletion claim.

Production READ ONLY findings from Child84g (verify at acceptance):
- Auth soft-deleted users: 6; no retained `public.users` profile or owned series/private-library works for these 6 at audit time. This does **not** prove that owner data deletion is safe.
- `auth.users` -> `public.users` FK CASCADE applies on **hard deletion**, not Auth soft-delete.
- `series.author_id` -> `public.users.id` is NOT NULL and FK NO ACTION.
- `recordings.reader_id` -> `public.users.id` is NOT NULL and FK NO ACTION; `reader_user_id` is nullable and SET NULL on hard delete.
- `episode_human_translations.translator_user_id` -> `auth.users.id` FK CASCADE on hard delete.
- `private_library_works.owner_user_id`, bookmark rows and some billing rows have Auth FK CASCADE on hard delete, but no direct Auth soft-delete cascades.
- Some user-ID bearing tables are **not FK-linked** (e.g. `credit_ledger`, `credit_purchase_lots`, AI translation request logs, `reader_card_likes` and older queues).
- Storage `recording-audio`: 4,720 objects with NULL `owner_id`. Other 6 illustration, 2 BGM objects have non-null owner; private Human-audio bucket currently 0 objects. Storage API deletion must not be inferred from DB FKs.
- `credit_ledger` has an append-only trigger; audit/accounting records require a separate retention/anonymization decision.
- Publication/RLS: `series.publication_status='public'`, episode posted+published, recording public+eligible, Human translation published+eligible. Reader R18 remains an **application** fail-closed gate.
- 2026-10-11 counts for context: 123 series, 3,284 episodes, 12 AI translation records, 0 Human translation records, 2,277 recording metadata rows, 3 Private Library works, 4 bookmarks. Counts are not affected-deletion cohorts.

The signed-in deletion UI currently says only that the account becomes unusable, despite
material effects on creative rights, unused credit and paid access.

## 2. Interim safety gate — proposed Draft behavior

1. Leave all existing customer DB records and published works unchanged.
2. Server-side `POST /api/account/delete`: verify current Supabase Auth user.
   - authenticated: `409` with stable `ACCOUNT_DELETION_REVIEW_REQUIRED` and `/contact` path;
   - signed out: `401`;
   - Auth/network verification failure: `503`, never silently treated as signed out.
   - **No** Stripe cancellation, Auth delete, DB mutation, Storage deletion, cache expiry,
     side-effectful or asynchronous work in this endpoint.
3. Account Settings **does not offer** an automated delete confirmation/check. It explains
   why the deletion is not immediate, provides the existing `/contact` route, and explicitly
   separates subscription cancellation from account/data deletion requests.
4. Privacy section 15 and Terms clarify the interim request process and disclose that
   previous Auth soft deletion was not a full data-erasure guarantee. Contact gives minimal
   reporting guidance without collecting passwords/OTP/payment data in email.
5. Actual verified access to the published contact inbox remains an operator gate.
   A request by email is **not** evidence of verified identity or completed deletion.
6. This is a **temporary tradeoff**: no automatic account deletion until a safe orchestrator
   exists. Requests for deletion, unpublication and data access must remain open to review.
   Re-enable self-service only after explicit approval and verified E2E.

There is no safe content-dependent exception to this gate: even accounts with no authored
series may have Private Library, translation, Storage, billing, historical or non-FK data.
Backend enforcement avoids bypass via direct API call.

## 3. Candidate future contract (B standard, C optional later, A erasure request)

**Proposed B**: stop publication and revoke distribution rights by default on account
termination; make deletion progress visible and eventually erase personal-only data subject
to documented statutory/legal hold. The **duration remains UNDECIDED**. Do not claim
that nonpublic retained data are already gone.

**Proposed C**: opt-in, per-work continued publication only after explicit, revocable/as-applicable
rights agreement, designated stewardship, preservation of attribution and third-party
translation/narration rights. No implied transfer to LIB read, no automatic continuity
from 'LIB read Official', and no migration of existing works without rights evidence.

**Proposed A**: reviewed personal-data erasure requests, with segregated minimal billing,
fraud, dispute and moderation/legal-hold records retained only for defined purpose and
duration; content-rights and third-party claims require individual treatment.

All three proposals need explicit product and legal review. None are shipped here.

## 4. Desired eventual durable state machine (NOT IMPLEMENTED)

Model one deletion request with a stable authenticated principal, persisted request ID,
immutable scoped inventory snapshot, workflow version and per-step checkpoints. Every
step must be repeatable; no cross-system transaction is assumed.

Candidate stages (not necessarily transaction order):

`REQUESTED -> IDENTIFIED -> INVENTORIED -> BILLING_SETTLED ->
PUBLICATION_REVOKED -> PUBLIC_READ_VERIFIED -> MEDIA_RIGHTS_SETTLED ->
PRIVATE_DATA_ERASED -> STORAGE_RECONCILED -> RETENTION_SETTLED ->
AUTH_SOFT_DELETED -> COMPLETE`

Errors persist `PENDING_RETRY` with the **last successful checkpoint and failed step**,
not a generic 'failed to delete'. Legal holds/pending rights cases become explicit
`MANUAL_REVIEW` with restricted access. Never transition to COMPLETE on cache expiry alone.

- **Identity/preview**: require fresh reauthentication as appropriate, display exact
  authored series, translations, narration, Private Library, bookmarks, paid entitlements
  and credit balances; all inventory reads must fail closed on error or truncation.
  Capture user-requested actions and consent independently for each authored work.
- **Billing**: list **all** Stripe subscriptions with pagination (existing implementation
  only lists the first 100), cancel statuses requiring attention, inspect open checkout
  sessions, verify final customer state and invoice/reversal risks. Cancellation is
  idempotent and may occur while account remains accessible after downstream failure.
  Never soft-delete Auth until billing stop is verified. Display paid-time/credit effects.
- **Public visibility**: server-side, authorization-checked transaction marks all
  unconsented authored `series` nonpublic and logs a tombstone/version. Related posted
  episodes, Human translations and recordings must become inaccessible via canonical
  DB/RLS/publication filters. A cached work row may otherwise survive and must be
  invalidated. Verify anonymous Work, Reader, Search, author index, sitemap and localized
  metadata using safe fetches; do not expose R18 during verification. Search-engine
  cache removal is not immediate and must not be promised.
- **Translation/rights**: AI cache/credit unlocks and historical logs are separate from
  third-party Human translations. A published Human translation of an unpublished
  original cannot remain publicly readable by accident; the translator's independent
  work and any agreed retention need a separate procedure. Human translation never calls
  OpenAI or debits AI balance. Human narration and synthetic TTS are distinct; check
  consent and source rights before removing or retaining recordings.
- **Private deletion**: perform exact user-scoped, count-checked deletes (Private Library,
  chapter translation payloads, progress, saved items, reactions, settings) only after
  inventory, export/retention decisions and relevant FK graph verification. FK CASCADE
  for a future Auth hard delete must not be substituted for erasure evidence.
- **Storage**: maintain a separately auditable per-object manifest using verified DB
  references, bucket/path, legitimate ownership, shared usage and content rights.
  Delete selected objects through the Storage API, not `storage.objects` SQL.
  Partial object failures retain checkpoints for safe retry; do not purge 2,443
  currently non-`recordings.audio_storage_path`-referenced audio files by inference.
  Check CDN/public URL invalidation and object existence separately.
- **Audit/history**: `credit_ledger` is append-only, payment & webhook history may be
  needed for reconciliation. Apply purpose-defined, legally reviewed minimization/
  pseudonymization/retention, not blanket cascade. Logs must omit credentials/PII.
  Track whose consent affects future Public Domain/Official works with provenance.
- **Auth last**: coordinate with session revocation, already-issued JWT expiration,
  and job continuation after identity becomes unavailable. The worker must use a
  least-privilege server credential, not rely on the deleted person's session.
  Do not call Auth hard-delete during unverified development.

### Failure matrix to implement/test with authorized fixtures

| Failure window | Safe behavior | Re-entry checkpoint |
| --- | --- | --- |
| Auth unavailable or anonymous | No billing/DB/Auth/Storage writes | Identity |
| Stripe cancellation partially succeeds | Record exactly which contracts stopped; no Auth delete | Billing |
| DB visibility update fails | Stop workflow, leave account alive; no 'deleted' success | Public revoke |
| Tombstone commits, cache expiry fails | Never re-publicize; retry invalidation; no COMPLETE | Public read |
| Human translation/recording rights unclear | Maintain fail-closed public access; manual review | Rights |
| Storage deletes partly succeed | Keep object manifest/status; recheck missing keys | Storage |
| Private erasure partially succeeds | Stable target IDs and idempotent retry | Private data |
| Auth soft-delete succeeds, final notice fails | Keep irreversible success checkpoint; never rerun Auth deletion blindly | Final notification |
| Audit log/history retention conflict | Quarantine request for policy/legal review | Retention |

Mock tests of this **future** state machine are required before approval and do not
convert static source contracts into live Production deletion E2E.

## 5. Specific approvals required before lasting changes

- B default vs alternatives; exact nonpublic data retention and export window;
- how to request and verify erasure; whether self-service or manual-only;
- unused credits, paid time and subscription cancellation/refund rules;
- rights and consent lifecycle for third-party Human translation and narration;
- C opt-in scope/revocation/attribution/stewardship and rightsChecked Public Domain;
- legal hold/accounting data purpose, period and access control (Japan/Australia applicability unverified);
- backup/Storage purge scope, restoration evidence and CDN/sitemap tombstone contract;
- final public Privacy/Terms/Account UI wording and handling of historic soft-deleted accounts.

No fabricated legal retention duration, backup completeness, storage orphan set or author
permission. The validated independent DB+Storage restore gate is still missing.
No Production DB, Storage, user, stripe, cron or moderation data was changed.

## 6. Validation/release gate

For interim Draft: mocked API statuses/no-side-effects, source-contract assertions for
Privacy/Terms/UI/contact, existing security regression, TypeScript, ESLint and build,
Vercel Preview; human verification of published support address before merging.
Explicit approval required for the Privacy/Terms change and self-service restriction.

For permanent B/C/A implementation: signed-in synthetic authorized E2E,
Stripe failure injection and pagination checks, RLS/FK read-only re-audit,
real Storage API dry-run against **only** authorized test objects, idempotent
partial-failure retries, Preview, then explicit user approval and separately
audited Production roll-out. Do not use actual user deletion as a smoke test.

## 7. Historical deleted-identity residual-reference audit — read-only, 2026-10-11

The **exact checked-in** `scripts/child84h-soft-deleted-reference-inventory.sql`
(blob `9864c67ebe2c46aba9b17e9237242182c160379c`) was run inside
`BEGIN READ ONLY` against the connected Production database. No user IDs,
email addresses, private data, Storage keys or raw account data were exported.
It has a fail-closed 44-column source-schema drift guard and no DDL/DML.

- Six Auth identities have `deleted_at IS NOT NULL` at audit time.
- Of 44 UUID-typed user/owner/author/reader/translator reference columns in
  `public`, **zero** rows joined to those six deleted Auth identities.
- `public.users.id` also yielded zero such rows.
- Storage object `owner` (UUID) and `owner_id` (text) both yielded zero
  owner references to those identities, across their respective metadata.
- The count-only output contains 47 distinct reference paths (44 public
  columns, one profile identity column and two Storage owner columns).
- The prior independent inventory found 4,720 recording-audio objects with
  no `owner_id`; owner join non-matches cannot prove whether any of these
  files contain previously deleted users' data.

**Important non-conclusion:** This is not proof that deletion completed
correctly, that old account data no longer exists, or that the old Auth
soft-delete route is safe for any future author. Stripe, Auth identity
records, non-UUID/non-identifying linkages, logs, file-byte payloads,
unattributed/shared recordings, separate providers and backups are NOT
fully inventoried by this SQL. No deletion or user creation occurred.

Re-run when historical deletion cohorts or schema change and audit the
join coverage before giving any erasure assurance. The companion
`scripts/test-child84-account-delete-cache.ts` asserts the exact scope
and read-only nature in CI. This does NOT unblock #123's actual latest-head
Preview and operational support-inbox receipt gates, nor restore a working
account-deletion request process on Production.
