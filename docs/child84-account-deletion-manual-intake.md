# Child84h — Account deletion, unpublication and erasure request triage

Status: **PUBLIC MAIL INTAKE VERIFIED; MANUAL REVIEW ONLY; NO AUTOMATED ERASURE**.
Workstream: Child84 P4, PR #123 (merged and Production READY on 2026-10-11).
This document remains a temporary manual review checklist, not a permanent
retention policy, authorization to delete customer data or evidence that
any specific user request has already been reviewed or completed.

## 0. Published support mailbox — connection and delivery verified

Published receiving account: `libread08@gmail.com`.
In an authorized Gmail connection, the original non-sensitive Child84
test message was found in this exact account's INBOX. A non-sensitive
reply was sent from this account and its arrival in the original sender's
INBOX was independently verified; the support account also showed the
reply under SENT. Both `RECEIPT_VERIFIED=true` and
`REPLY_VERIFIED=true` apply **only to this controlled test**.

A dedicated Gmail intake label
`LIB read/退会・データ消去申請/要確認` was created.
The account controller is the interim operator. For actual requests,
assign a responsible operator per case, maintain access restrictions,
handle absences and retain a private minimal case ledger; the label
does not automatically complete any deletion or prove response times.
Public docs must not include private operator account details,
user messages, message IDs, credentials or attachment content.

Receiving a request is not identity verification, permission to modify
works, a subscription cancellation or a completed erasure. For every
real request follow the steps below, and use NEEDS_REVIEW if any approved
verification/deletion procedure is unavailable.


## 1. Triage and minimum necessary request

Classify each new request separately, keeping the requester's exact
expressed intent: `ACCOUNT_CLOSURE`, `PERSONAL_DATA_ERASURE`,
`AUTHOR_WORK_UNPUBLISH`, `HUMAN_TRANSLATION_WITHDRAW`,
`HUMAN_NARRATION_WITHDRAW`, `RIGHTS_COMPLAINT`, `BILLING_CANCEL`
or `OTHER`. A single contact may need several separate actions.
Submission is **not** proof of identity, authorized ownership,
subscription cancellation, completion, or agreement to continued
publication.

Ask for only the minimum to locate the intended account/works:
registered contact address if known, a public work URL if applicable,
the specific action requested, and whether any content or billing issue
is urgent. **Never ask by ordinary email for passwords, recovery codes,
OTP, raw session links/tokens, full card data, passport or identity
documents.** If unsolicited secrets or ID material arrive, restrict
access; do not forward them into tickets/PRs, logs or AI prompts.
Use redacted references in internal case records.

## 2. Identity, ownership and conflicting rights

Before **any irreversible or publication-affecting change**:

- Verify account control through an *approved authenticated channel*;
  none is established by PR #123. A matching email sender is not
  sufficient to authorize destructive operations, and an email reply
  must not be confused with current signed-in authentication.
- Correlate requested work with its actual author/translator/reader
  permissions using server-side authorization, not a user-supplied
  slug or `user_id` alone. Respect R18 and publication visibility.
- Inventory affected works, episodes, Human translations, Human
  narration, Storage objects, private library and active billing
  separately. A no-result/error/limited query is not evidence of no
  affected rows; fail closed on truncation, timeout or permission error.
- If author and third-party translator/narrator rights conflict,
  do not erase another person's material by inference. Quarantine for
  rights review; the ordinary reader path must remain publication/R18
  fail-closed.
- B (default unpublish/retention), C (opt-in preservation rights) and
  A (individual erasure request) remain **proposals without approved
  retention periods, licenses or completion promises**. Do not
  auto-select one or assert that authors granted rights to LIB read.
- Cases with unclear identity, ownership, legal hold, financial effects
  or no authorized administrative workflow: mark `NEEDS_REVIEW`.
  Do not manually manipulate Auth records or execute broad SQL.

## 3. Separate billing treatment

For a person requesting recurring-charge cancellation, point to
`/subscription` and the separately authenticated
`/api/billing/portal` route. Account deletion is paused and does not
cancel a subscription. A portal visit is not proof of cancellation.
If an operator must assist, use only an authorized Stripe/operator
workflow, positively reconcile the customer and **all** relevant
subscription statuses, and record an auditable result. No credits,
paid access, refunds, live Stripe cancellation, or billing changes
are authorized by this document. A payment complaint must not be
silently handled as account erasure or vice versa.

## 4. Reviewed publication / private-data operations

- For public work, translation and narration withdrawal, confirm
  ownership and the rights graph before acting. If no supported
  authorized moderation UI or audited procedure is available, **do
  not use ad-hoc Production SQL as a workaround**; escalate instead.
- Before approved publication changes, record exact target and
  expected counts without copying private rows. Recheck public
  Work/Reader/Search/author/metadata and cache invalidation separately
  using safe non-R18 fixtures. An expired cache or soft-deleted Auth
  identity does **not** prove unpublished work.
- Personal library, uploads, progress, translations, billing ledger,
  Storage object bytes, Auth JWT expiration and detached audit records
  each require their own authorized erasure/retention disposition.
  `storage.objects` SQL deletion is not an object-byte deletion.
- Do **not** delete the 2,443 recording-audio objects lacking a direct
  `recordings` reference on that fact alone. Do not treat
  zero soft-deleted-user owner ID joins as erasure evidence.
- On partial failure, retain a protected case checkpoint, exact
  completed/failed steps and safe retry/rollback notes. Do not mark
  `COMPLETE` until every approved action and post-state are checked.

## 5. Protected case ledger (fields, not public data)

Maintain a restricted case record, separate from GitHub and CI:

| Field | Allowed meaning |
| --- | --- |
| `case_id` | Opaque internally assigned reference; no email embedded |
| `received_at` / `channel` | Actual intake, not sent-only evidence |
| `operator` / `last_reviewed_at` | Authorized assigned case owner and audit time |
| `request_categories` / `scope` | Exact requested actions; public URL if relevant |
| `identity_status` | UNVERIFIED / VERIFIED / NEEDS_REVIEW; method noted privately |
| `rights_status` | Ownership / third-party approvals / unresolved concerns |
| `billing_status` | NOT_CHECKED / PORTAL_DIRECTED / VERIFIED_STOP / NEEDS_REVIEW |
| `action_status` | RECEIVED / TRIAGE / NEEDS_REVIEW / APPROVED / PARTIAL / COMPLETE |
| `authorized_action` | Named permission/review gate before each write |
| `target_counts` | Expected and verified affected row/object counts, without PII |
| `postcondition` | Per-system proof, failed step, retry status |
| `notice_status` | Acknowledged / further proof required / response sent |
| `retention_disposition` | Unresolved until policy/legal approval |

Control read/write access to the case ledger, prevent secrets and
excessive PII, and do not invent response deadlines or retention periods.

## 6. Safe response patterns — operators must review before sending

Initial acknowledgement: confirm **receipt only**, restate the requested
scope, say that identity/rights may need checking, and explicitly state
that account and data deletion have **not** been completed. Give the
separate subscription-portal direction for billing requests. Never
claim a guaranteed deadline or all-data removal.

Identity unclear: request completion of an **approved authenticated
verification method** once that method exists. Do not invent a
password/OTP/ID-attachment collection process by email.

Partial completion: state only the actions independently verified;
identify remaining rights/data/billing steps and whether review is
pending. Do not call an account fully deleted after Auth soft-delete
or cache expiry.

Closure: send only after verified scoped postconditions, separately
identifying any legally required retained records with an actually
approved retention basis, and distinguishing unpublication from
erasure. Until that process exists, use `NEEDS_REVIEW` rather than
`COMPLETE`.

## 7. PR #123 acceptance and Production verification evidence

- User expressly approved current PR #123 Preview, temporary self-service
  deletion suspension, and published Privacy/Terms changes.
- Exact reviewed HEAD `ddf62d87d4a919ce502aafbfd1cc8ab8ef7af3dd`
  passed four GitHub Actions workflows; matching Preview was READY.
- The actual published mailbox was connected; non-sensitive inbound and
  outbound reply arrival were independently checked. Intake label created.
- PR #123 was merged into main as
  `fa86529be99f167df9e673724adb4be6f8189ebf`; matching Vercel
  Production deployment `dpl_BKpqovPvodbLBYvmHSZzKTUjvLBd` is READY.
- Production anonymous GETs for `/`, `/privacy`, `/terms` and
  `/contact` returned HTTP 200 with updated wording; GET on
  `/api/account/delete` returned 405. This is not authenticated POST
  execution or a complete interactive Account Settings proof.
- Exact source and offline mocked API checks establish HTTP 409 for an
  authenticated user, 401 absent session and 503 Auth dependency failure;
  neither Supabase Auth deletion nor Stripe/database/Storage mutation
  is called. No real-user deletion E2E was performed.

## 8. Outstanding permanent workflow and other Child84 gates

The interim gate is **LIVE**, but safe irreversible deletion orchestration,
approval of B/C/A rights and retention rules, individual identity-verified
request handling, Stripe cancellation proof, independently restored DB and
Storage object bytes, R18/author/Reader/Human translation authenticated E2E
and Cron activation remain **UNVERIFIED / NOT AUTHORIZED**.
Never report full data erasure, automatic case processing or Child84 DONE
from this deploy.

Child84 NOT DONE; Child85 BLOCKED.
