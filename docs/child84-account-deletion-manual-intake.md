# Child84h — Account deletion, unpublication and erasure request triage

Status: **OPERATIONS DRAFT — NOT LIVE / NOT VERIFIED**.
Workstream: Child84 P4, PR #123. Date: 2026-10-11.
This document is a *temporary manual review checklist*, not a permanent
retention policy, authority to delete customer data, or proof that support
requests can currently be received or completed.

## 0. Mandatory launch gate: support mailbox and accountable operator

Published destination: `libread08@gmail.com`.
Neither of the connected operator mailboxes directly accessible to this
audit is the published destination. Their individual identities are
intentionally omitted from this public operational checklist.
`libread08@gmail.com` on 2026-10-11, but its RECEIPT at that mailbox
and the ability to reply from it have **not** been verified. Do not
represent this as a functional intake channel until an authorized
operator:

1. Opens the *actual receiving inbox*, with secure sign-in and MFA where
   available, and confirms the precise test subject and receipt time.
2. Sends a non-sensitive reply from that mailbox, or an explicitly
   controlled sending alias, to the test sender and confirms its arrival.
3. Identifies a responsible human operator, restricted access and
   a case-tracking method; checks how messages are routed, retained,
   backed up and escalated if the primary operator is unavailable.
4. Records **only** `RECEIPT_VERIFIED=true`, `REPLY_VERIFIED=true`,
   verification date/time and responsible operator in a restricted
   operational record. **Do not put raw emails, access tokens or
   customer identifiers in this repository or public PR comments.**

An outbound Gmail SENT event, absence of a bounce, DNS/MX resolution
or a website `mailto:` link alone does not meet this gate. If the
mailbox cannot be operated, **DO NOT deploy text promising request
acceptance at that address**; escalate to the parent for an explicitly
approved and independently verified alternative. Do not invent a
replacement address.

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

## 7. PR #123 release / Production verification gates

- Exact HEAD GitHub CI 4/4 and corresponding Vercel Preview READY.
- The user's **explicit approval of that Preview, temporary disabling
  of self-service deletion, and changed Privacy/Terms wording**.
- Proven support-inbox **receipt and reply**, a named operator and
  restricted case record. These are external operational facts,
  not proved by CI or simulated responses.
- Review 401 unauthenticated, 409 authenticated, 503 Auth outage
  in no-side-effect automated tests. Authorized authenticated
  smoke must not use a real account-delete scenario; no real user
  is deleted. For actual HTTP POST verification, only an approved
  non-customer synthetic session and no-side-effect fixture may be
  used, if provisioned.
- Merge with explicit approval; confirm new main, Vercel Production
  READY for that exact SHA, Privacy/Terms/contact/UI and safe
  anonymous GET/no cached "deleted successfully" copy. Monitor
  no Auth/Stripe/Storage mutations or unexpected error spikes.
- **If any gate is unverified, leave #123 Draft/unmerged, record
  the specific blocker and hand back to Child84 parent.**

Child84 NOT DONE; Child85 BLOCKED.
