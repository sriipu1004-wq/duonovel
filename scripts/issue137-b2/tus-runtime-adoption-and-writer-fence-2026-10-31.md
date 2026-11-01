# Issue #137 / Draft PR #153 — Human TUS staging boundary and privileged-writer containment gates

Status: **nonproduction SOURCE decision / NOT RELEASE APPROVAL**, 2026-10-31.
This is a bounded engineering design for the currently authorized Issue #137. It does not
activate TUS in the application, create a bucket, deploy Storage policies, alter
credentials, approve publication, request a review, or grant merge authority.

## Baseline and evidence level

- Starting author HEAD `8d64d9e74c8b3c764d223d30edfdb940787a730f`;
  GitHub main and Production `f07d990cb760ac054f8cbd917e9ffb15d9db2959`.
  Production is **not** running the PR's Human security changes.
- PR #153 local disposable TUS fixture: authenticated owner uploads 6MiB then resumes
  and finishes PRIVATE media with matching SHA; anonymous/other user initiation/PATCH
  403, consent-table version downgrade / synthetic owner, rights and R18 withdrawal /
  global sign-out followed by final PATCH 403 with no completed object, duplicate
  URLs 409. Final raw log: B2 run 41178425568, job 124470680547, **57 checks**.
  This proves only this localhost fixture's provider behavior—not the app's production
  authorization graph or a general-purpose provider guarantee.
- Current Draft signed Human multipart `upsert:false` first-write defense was
  measured, but a bearer issued before consent withdrawal remains usable;
  the unexpired token can recreate a deleted PRIVATE staging object.
- The owner previously confirmed **zero Dashboard-issued S3 access keys**. That fact
  is already known, must not be re-requested, and does **not** eliminate the
  existing service-role REST/S3 privileged bypass.
- Supabase TUS guide: https://supabase.com/docs/guides/storage/uploads/resumable-uploads
  (6MiB chunks, URL lifetime up to 24 hours). Supabase S3 auth guide:
  https://supabase.com/docs/guides/storage/s3/authentication (Dashboard S3
  access keys bypass RLS). Signed URL reference:
  https://supabase.com/docs/reference/javascript/file-buckets-createsigneduploadurl
  (signed bearer usable without further auth for two hours).
- Vercel project environment-variable **metadata only**: `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are targeted at
  both Preview and Production; this **does not prove values or Supabase project
  isolation**, and no values were read. `LIBREAD_F2P_MEDIA_WRITER_MODE` was not present
  among 33 project env metadata entries; the Draft's Preview guard is therefore
  **not proven active**. Never run write E2E against Preview on this basis.

## Current live-path graph (Draft SOURCE, not TUS integration)

| Ingress / code | Authority and existing write path | TUS adoption implication |
| --- | --- | --- |
| `RecordingStudioPage.tsx` `createHumanUploadSession` / `uploadHumanFileMultipartDirect` | Browser calls `/api/recordings/human-upload-session`, then `supabase.storage.uploadToSignedUrl` with server-minted bearer. | For **large Human only**, replace this staging branch after strict opt-in and E2E. Do **not** modify AI, TTS, Human translation or the small-file direct branch by accident. |
| `human-upload-session/route.ts` | User-scoped access + consent check, then `createAdminClient().storage.createSignedUploadUrl({upsert:false})`. | A TUS path must **not** mint a signed URL, return service-role or proxy storage keys, accept a client bucket, or treat RLS as authorization solely from a stale JWT. Disable legacy signer for any migrated cohort; issuance of existing two-hour bearers must cease before asserting effective revocation. |
| `human-upload-finalize/route.ts` | Re-auth, series/episode, consent; rebuilds N multipart paths by client-supplied session UUID, admin `.download` each, creates a `File`, validates, calls publish, then admin `.remove` in `finally`. | **Not reusable as-is** for a single TUS object or up to 1GiB. New finalize must use a server-persisted upload ID and bound owner/series/episode/key/byte count, verify Storage completion and freshness, use bounded streaming/memory, and preserve uncertain bytes rather than unconditional cleanup. |
| `human-publish/route.ts` small file path | Browser multipart body; `publishHumanRecording` final writes via service-role. | Independent legacy path stays in scope for privileged-writer containment; TUS does not fix it. |
| `humanRecordingPublish.ts` | Admin `.upload({upsert:false})` for original, playback and timing objects; H1 DB CAS/owner/consent. | Still privileged: **do not** claim exclusive TUS/PRIVATE ingress while this writer can address the proposed staging bucket or mutate the released object path. Segment buckets/path namespaces and credentials before release. |
| `nemoGeneration.ts`, `aivisGeneration.ts` | Admin audio/timing `.upload({upsert:false})` into AI public or R18-private buckets, with separate R18 path. | Keep AI distinct from Human, and deny these privileged clients any staging-bucket authority as an explicit architecture gate; RLS alone cannot deny service-role. Existing PUBLIC releases/URLs remain separate holds. |
| `publicMediaWriterBoundary.ts` | Draft pure function only prevents public media when explicit `preview-hold` flag is set; unset gives `LEGACY_UNCHANGED_NOT_APPROVED`. | This is **not** a mandatory all-path gate and is not proof that TUS staging or AI writers cannot bypass. |
| `src/features/effects/EffectSettingsForm.tsx` and unrelated Storage consumers | Separate illustration/content Storage path, not Human narration. | Do not expand the current scope or accidentally weaken their RLS. |

**Unknown external surfaces:** provider/dashboard operations; external scripts, users of
service-role tokens, old pre-minted signed URLs, S3 over service-role JWT, direct REST,
inherited/branch-specific environment or secret stores, backups/CDN, and any other
worker not visible to the tracked repository. A source inventory is NOT proof of
exclusive provider ingress. The broad existing source scanner
`scripts/issue137-b2/s3-public-writer-inventory.mjs` reports **candidates**, not
verified writers; it can miss dynamic external callers.

## Preconditions for minimal nonproduction Human TUS integration (not yet authorized to wire)

**T1 — Separate PRIVATE staging namespace.** A new throwaway test bucket is
independent of final Human, AI, public and BGM buckets. Enforce PRIVATE at provider;
path `owner/<verified-uid>/<server-issued-upload-id>.<extension>`,
unique immutable key, no `x-upsert`; no anonymous/public reads.
TUS metadata necessarily carries a bucket and path from the browser, but those
values must be **treated as untrusted**: the server first allocates an opaque
owner-bound upload ID and canonical bucket/path in a private ledger, and provider
RLS rejects a request with any unregistered or foreign target. Retain an
idempotency key. Ordinary user cannot UPDATE, DELETE or
write published media. No presigned upload capability or service key delivered.

**T2 — Fresh RLS using real authority.** On TUS creation and every sensitive PATCH /
commit, enforce authenticated user's **live** `auth.sessions`, current *real*
`user_recording_consents` version, series/episode owner and recording permission,
current rights and publication flags, and effective R18 (rating + warnings, current
user confirmation/display policy as appropriate). Verify with a policy matching the
actual schema, not the disposable `issue137_tus_local_grants` approximation.
A `SECURITY DEFINER` helper requires separate privilege, `search_path`,
GRANT/REVOKE and negative audit before any hosted deployment. No stale JWT-claim-only
or caller-controlled boolean shortcuts. Fail closed on DB error.

**T3 — No alternate writable authority.** Storage policies restrict ordinary JWTs
to this one PRIVATE staging namespace. Inventory/segregate *all* service-role
REST/S3 paths, existing multipart signer and its unexpired capabilities,
cleanup/delete endpoints, external import/CLI, automated work and manual admin
operations. **A service-role credential bypasses RLS**: keeping it in the same
provider trust boundary means RLS alone does NOT establish exclusivity. Either
prove a distinct provider/credential boundary or accept that trusted server
writers can bypass and add verified post-write integrity controls. This is a
BLOCKING architecture decision, not a request to generate a new S3 key.
Preview/Production Supabase target isolation must be verified without exposing
credential values or touching real data.

**T4 — Exact bytes and durable finalization.** Server trusts neither client
metadata nor SHA declaration. Independently stream/read exact PRIVATE bytes,
verify size/hash and decoder, record immutable object ID/version and physically
rechecked digest in a durable receipt, then fresh-check all permissions and use
an H1/CAS commit with replay/ACK-loss resolution. Do not permit a provider-side
upsert, overwrite, delete/recreate, parallel resume or privileged alternate PUT
between verification and final pointer commit. PostgreSQL and Storage are
separate failure domains—model two-phase recovery. Preserve uncertain bytes and
do not delete old/possibly referenced media on error. Max 1GiB requires
bounded-memory streaming and measured CPU/timeout/retry costs; cannot simply
reuse `new File(fileParts)` for the full upload in a Vercel Function.
No TUS stage object is a PUBLIC media release authorization.

**T5 — Rights/visibility boundaries stay independent.** Human versus AI/TTS,
owner versus reader, R18 ON/OFF/unconfirmed, Original/Bilingual/Translation,
private/draft/public episode state, and rights withdrawal must be re-evaluated
at publish/playback. PRIVATE staging != consent for PUBLIC release. Legacy public
Storage/CDN bytes and backup/recovery remain unmodified and unproven.

**T6 — Compatibility and rollback.** Do not silently migrate the small-file
multipart `/human-publish` route; explicitly reject deprecated upload-session
requests in a migrated cohort, plan for the existing signed bearers to expire,
support TUS interrupted/resume/duplicate/abort, and ensure signed-in user logout
or consent withdrawal blocks resumption. Rollback must restore working private
upload without re-enabling public access, RLS bypass or overwrite.

## Required test matrix before any runtime adoption

| Gate | Evidence needed | Current state |
| --- | --- | --- |
| Disposable TUS transport | Real owner 6MiB resume, consent-version downgrade, permission/R18 withdrawal, logout, anon/other, duplicate | **LOCAL PASS** on synthetic PRIVATE bucket, 57 checks |
| Real app-policy graph | Authenticated Human owner and nonowner, permission revocation, R18/warnings, unpublished episode, crossed series, 3 Reader modes / JA EN KO | **NOT RUN** for TUS |
| Live route wiring | HTTP New TUS session + post-revoke TUS PATCH + authorized finalize + disable legacy signer, 4xx/5xx negative responses | **NOT IMPLEMENTED** |
| Isolation of privileged writers | Proof no service-role/REST/S3 or legacy signed bypass can modify candidate stage or promoted bytes; Preview distinct from Production | **UNPROVEN** |
| Physical byte integrity | Same-length substituted WAV under leaked JWT, duplicate/delete/recreate, 1GiB resume, chunk race, ACK loss, readback after independent write attempt | **LOCAL bypass observed in broker prototype; TUS not proven secure** |
| Finalize / H1-H2 | Immutable receipt/CAS, failure rollback without deleting committed bytes, permissions revoked between check and DB commit | **NOT INTEGRATED** |
| R18/public/legacy/restore | Human/AI provenance, authorized Reader, historic public URLs/CDN, independent DB+Storage-byte recovery, #150 p95/5xx and AbortError | **BLOCKED / independent release gates** |
| Stable high-risk release gate | Fixed PR HEAD, exact-head CI/Preview, genuine independent review, owner-specific merge/Production approval | **NOT AT RELEASE GATE** |

## Practical recommendation and stop

1. **Do not wire TUS into the live application yet.** The previously approved
   local TUS test has answered its narrow transport/revocation question. Repeating
   the same synthetic probe or adding a broker-only process is low-value.
2. **Next minimal independently useful nonproduction implementation**, when
   explicitly authorized: isolated fixture using **actual application rights/
   ownership/R18** data model and a strictly private TUS session ledger, plus
   a standalone HTTP route test that rejects stale/mismatched owner, user,
   episode, or consent without minting signed URLs. It must not be imported by
   the current site route or accept hosted credentials.
3. Before any switch, make an explicit architectural choice about service-role
   placement and whether integrity can be made verifiable despite alternate
   privileged access. Without a defensible answer, keep **TUS as a research
   candidate** and **Production B2 NO-GO**.
4. Keep #153 **OPEN/Draft, FIX/MERGE HOLD**; leave main, Production,
   rights, public objects and current users unchanged. Do not request an
   independent release audit until a stable fixed-head candidate exists.

**Technical feasibility != adoption justification.** TUS direct PRIVATE upload
probably avoids an additional 1GiB server relay, but the final media ingestion,
safe rollback, provider access separation and evidence costs have not been
measured. No new provider paid resources or credential actions are justified
by this document.

---

## Addendum — 2026-11-01: precise NORMAL Human route cutover (SOURCE decision only)

This addendum **corrects dated legacy assumptions and defines a bounded next
candidate**, without revisiting the completed TUS/worker/privileged-writer
comparisons above. Evidence point: #153 branch at
`2f92341b1cc809b506dfb26a5bc25351bbd8e18b` (not a perpetual
"current HEAD"). It was subsequently reinforced by source-regression assertions.
This is **not authority to create/deploy keys, buckets, RLS, migrations, paid
projects, an active worker, real media or a public release**.

### Verified actual route contracts, not inferred from old PR notes

| Exact source/ingress | Existing implementation | Cutover consequence |
| --- | --- | --- |
| `human-upload-session/route.ts` | For >4MiB, user `getUser()`, readable series/episode and **current global recording consent** are checked **before** admin `createSignedUploadUrl(...,{upsert:false})`; each part returns a signed bearer. For smaller input the API returns `single` before this multipart-specific check; the separate `human-publish` route is responsible for final authorization. | **Do not claim consent was missing at signer issuance or that it currently signs with `upsert:true`.** These mitigations are already present. Nevertheless a previously issued signed upload bearer is independent of the originating SSR Cookie and cannot be considered revoked by a later consent/logout event. Never re-enable these bearer mints as a fallback for a migrated cohort. |
| `RecordingStudioPage.tsx` | A >4MiB client file is fully read and cloned by `analyzeAudioUploadClient` / `AudioContext.decodeAudioData`. At that threshold its result is locally marked `serverResult.decision="passed"` with real server validation deferred. The default multipart branch still uploads each 8MiB part through `uploadToSignedUrl`; unknown `uploadMode` is now explicitly rejected before one-shot `human-publish`. | The new **dev-only** `local-private-staging-only` response is deliberately non-publishable. An eligible release path must have separate user-facing stage/resume/cancel and verified completion UI; the existing button cannot simply reinterpret staging as publish. No default-mode fallback to signed multipart or one-shot publish after 4xx/409. |
| `human-upload-finalize/route.ts` | Validates current auth/series/episode/consent, but reconstructs N temp parts with privileged `.download`, `new File(fileParts)`, and `analyzeAudioUploadServer`; it calls the legacy privileged publisher. `finally` removes temp paths even on certain ambiguous failures. | A new session must be bound by a **durable server-owned** (actor, GoTrue session, series, episode, file-size, digest, rights revision) record. Finalize needs fresh current-domain decisions, byte-complete receipts and crash/ACK-loss reconciliation **before** any public pointer. Never treat arbitrary client-provided session ID as a durable proof. |
| `humanRecordingPublish.ts` + normalization + transcription | Publisher calls `sourceFile.arrayBuffer()`; FFmpeg helper buffers entire input and reads entire output into memory; the transcription helper rejects **normalized output** above 25MiB, copying the input into another buffer. Three privileged final Storage PUTs plus H1/CAS remain. | **1GiB upload-size allowance is not an end-to-end publish SLA.** Any large-file solution needs bounded input/output, per-request duration/CPU/heap/egress, audio validation and transcription segmentation/alignment policy with measured failure handling. Do not silently introduce a "chunked transcription" service dependency or remove the 25MiB guard. |

### Minimal implementation ordering for a separately approved deployable phase

1. **Freeze security objective and cost choice first.** Compare (A) no
   additional release and retain existing HOLD (**$0 new fixed infra**),
   (B) a strictly PRIVATE RLS-scoped user/TUS upload with durable app-owned
   tickets and no signed bearers (**no new provider fixed project expected,
   but extra requests/bytes/functions and maintenance**), and (C) a separately
   controlled provider credential/storage boundary (**possible additional
   compute/transfer/restore charges and operational complexity**). The
   previously tested same-project RLS + service-role design **cannot prove
   WORM or exclusive writer custody**. Recommend (B) only as the next
   **non-publishing prototype**; do not recommend buying (C) until actual
   need, writer inventory, costs and feasible isolation are established.
2. **Issue/replace cohort-specific ingress, not every route at once.**
   Keep small-file Human, AI synthesis, TTS, Human translation and Reader
   unchanged. For a specifically identified large-Human test cohort, issue
   no legacy signed Storage URLs; use a PRIVATE ticket and restricted
   provider-side ingress only. Negative test stolen preexisting bearer,
   POST after consent/logout, wrong session/series/episode, R18 warning,
   same-length changed payload, deletion/recreation, stale browser, two
   concurrent clients and server restart. **Previously minted two-hour
   tokens cannot be made retroactively revocable by this application
   switch; explicitly plan expiry/fencing and no PUBLIC promotion.**
3. **Separate three states with durable recovery:** `PRIVATE_STAGED`,
   `PRIVATE_VERIFIED`, and `PUBLIC_ELIGIBLE` are not interchangeable.
   Missing/changed bytes, orphaned CLAIMED, expired leases, ACK loss,
   worker crash, authority withdrawal and PostgreSQL/Storage version
   disagreement mean **HOLD**, not retry-by-upsert or automatic deletion.
   A verified digest by one process is a **point-in-time check**, not a
   provider-enforced immutable object. If an independent service-role/S3
   path can overwrite between readback and DB CAS, only
   **detect-and-quarantine/HOLD** may be claimed—not "unmodifiable media".
4. **Solve processing capacity before claiming 1GiB.** Establish a
   validated *processable* source duration/byte limit independently of
   the current 1GiB metadata cap; measure Browser WebAudio peak heap,
   server bounded streams/FFmpeg input+output, normalized transcription
   25MiB ceiling, concurrent users, timeouts and partial failure. Preserve
   the existing limit and current release HOLD until a compatible
   product-facing cap/segmentation decision is separately approved. The
   complete source-byte hash, segment timing, author provenance and
   episode-text alignment must survive any processing split.
5. **Only after the above, make publication a separate authorized
   transaction.** Recheck current consent, owner/series/episode, actual
   R18 rating + warnings, rights, private/public visibility and
   prior-recorder publication consent; enforce canonical H1/H2 revision
   and single-commit pointer semantics. Keep PUBLIC/CDN, AI/Human/TTS
   media and read-only authenticated Reader paths distinct. Test old app +
   new DB, new app + old DB, rollback while old bearers exist, full
   DB+Storage-byte restore and Production performance/AbortError thresholds.
   This is a later release gate, NOT a consequence of staging CI PASS.

### Falsifiable stop/go record for this addendum

- **Already demonstrated LOCAL:** normal JSON dev-only no-signer PRIVATE
  session + fresh finalize denial, browser SSR Cookie, owner/context,
  actual enabled Studio button failing closed, physical 8MiB+256B
  checksum, late consent/R18/episode denial; #153 CI/Preview at the
  recorded checkpoint. Production has **none of this mode enabled**.
- **Still NOT evidenced:** safe revocation/fencing of existing bearer
  across the provider, separate credential custody for alternate
  `service_role`/S3 writers, normal-mode 1GiB payload with bounded
  memory/transcription, release-safe publication/proxy and legacy media,
  independent provider/DB+Storage recovery.
- **Gate:** #153 FIX / MERGE HOLD; Production B2 NO-GO. The next
  runnable development work remains **nonproduction only** until a
  separately scoped deployable-phase approval. A new fixed-head high-risk
  independent review belongs at a stable release candidate, not at each
  source-only intermediary change.

Official specifications checked for this addendum:
[Supabase signed upload URL, 2h bearer](https://supabase.com/docs/reference/javascript/file-buckets-createsigneduploadurl),
[Storage RLS and service-key bypass](https://supabase.com/docs/guides/storage/security/access-control),
[S3 access-key versus JWT session-token permissions](https://supabase.com/docs/guides/storage/s3/authentication),
[TUS 6MiB and 24h upload URL](https://supabase.com/docs/guides/storage/uploads/resumable-uploads).


## Addendum — 2026-11-01: LOCAL consent-revocation monotonic HOLD and cleanup

**Author-side NONPRODUCTION fixture only:** `scripts/issue137-b2/human-multipart-worker-local.sql`
creates a trigger on the existing **disposable** `user_recording_consents` table. It
moves every affected local `OPEN` / `SEALED_PARTS` Human multipart ticket to
irreversible `HOLD` when an accepted `recording_studio_global` row is changed to
a different version, **renamed to another consent key**, or deleted. No
trigger, table or policy was deployed under `supabase/migrations` or on the
hosted project. Re-consent issues a new ticket; it never revives the old one.

**Falsifiable negative cases:** a prior ticket is refused after
withdrawal→re-grant of the same consent version; an already SEALED PRIVATE receipt
is refused even when the key is renamed back; a deleted/reinserted consent row
cannot reactivate the old ticket; unrelated consent keys do not quarantine
recording sessions. A fresh ticket under restored consent can stage 8MiB+256
bytes, produce only PRIVATE receipt, and never publish. Owner-only
`abort` continues to delete physically verified PRIVATE bytes after
withdrawal/re-grant. The local SQL trigger is user-scoped
(`m.user_id=old.user_id`) and fires only when the *previous* key was an
accepted global recording consent. It does not imply irrevocable revocation
of ordinary non-recording consents, permission toggles or hosted tokens.

**Critical split between revocation and physical write:** even with this
SQL HOLD, the previously measured post-CLAIM window still permits an
in-flight service-role Storage PUT **after** withdrawal. SQL/postgres session
state and Storage provider byte commit are not one transaction; a
same-project privileged `service_role` or S3 writer can still bypass
this cooperative worker entirely. An irreversible app ticket fence is useful
for **no stale finalize/replay after re-consent**, not for instant
provider-wide token revocation, physical WORM or elimination of the window.
A racing abort returns HOLD while the writer is CLAIMED; retry only when
the in-flight writer settles, then compare actual PRIVATE byte absence.
Logout/expired auth sessions prevent the current owner-only `abort`
path, and require a separately controlled operator/expiry reconciler;
**no Cron, background cleanup, hosted deletion, or privileged recovery
API is authorized or implemented**.

Before deployable approval define a persistent consent/rights epoch (not merely
the mutable current version string), SQL transactionally fenced ticket
states, an authorized operator reconciliation protocol for abandoned
CLAIMED/SEALED bytes, service-role/S3 credential ownership and a complete
end-to-end nonpublication/provenance/rights safety proof. Keep PR #153 Draft /
MERGE HOLD and Production B2 NO-GO even on successful disposable tests.


## Addendum — 2026-11-01: logout-orphan and expired-ticket operator boundary

**Classification:** test-only real disposable GoTrue/PostgreSQL/PRIVATE Storage probe, not a
deployed operator, retention policy, Cron, RPC, hosted worker, or guarantee of
provider-wide immutable deletion. It extends the previous monotonic consent
HOLD work without changing Production routes, Supabase migrations or keys.

The current local multipart worker requires the **original live GoTrue
`auth.sessions` row** for owner-only `abort`. This is desirable for access
control but intentionally means that **logout/global session revocation can
strand already accepted PRIVATE part bytes**, even if a stale JWT is not yet
expired. A multipart ticket's own `expires_at` is a different condition:
while the original auth session is still live, the owner may still call
`abort` after ticket expiry, but cannot stage/finalize new parts. Neither
case grants other consenting users cleanup rights.

For **quarantined, logout-orphan PRIVATE data only**, the existing
`human-multipart-stream-next-local-e2e.mjs` now exercises an explicit
**offline test-harness operator** procedure, with the sole cooperating
local worker stopped before any metadata reconciliation or Storage DELETE:
1. Confirm the original GoTrue session is **actually absent** from the
   disposable PostgreSQL `auth.sessions`; do not infer revocation merely
   from SSR cookie appearance. Verify old cookie, unrelated user and
   finalize are denied, while the physical PRIVATE byte SHA remains.
2. Fetch the server-owned (upload UUID, user UUID, auth-session UUID,
   object path, part receipt, SHA and state). CAS that specific OPEN ticket
   to HOLD only for the verified original owner/session; reject a foreign
   user, unheld ticket, out-of-prefix object, duplicate index, bad checksum
   or any `CLAIMED` / `INTEGRITY_HOLD` part. Do not list/delete an
   arbitrary owner prefix or accept a client-selected object path.
3. Before removal verify exact physical SHA against the receipt; remove
   the exact scoped object only, then GET the same path to check absence.
   Independently verify another owner's PRIVATE bytes are unchanged and
   no `recordings` publication row was created. Restarting the worker
   cannot reactivate this HOLD; a legitimate still-authenticated owner
   may abort their *expired* multipart ticket without the operator.

**Safety qualifications:** This is a test-harness replay with project-wide
local service-role custody. Stopping the cooperating local worker is NOT
proof that all independent privileged S3/REST holders or old signed URLs
are fenced; another holder can re-create/modify objects after verification.
SQL CAS and Storage DELETE are distinct operations, so the observed byte
absence is point-in-time only; do not claim atomic wipe or zero late
writes. Expired user authentication and lost owner-only access require a
separately approved actor/session/consent/right-independent *operator*
process with explicit scope, audit trail, grace period and provider-writer
custody; none exists in the deployed application. Unlisted orphan objects,
in-flight CLAIMED or ambiguous provider errors must remain HOLD, not be
mass-deleted or silently repaired. A deployment would require another
scoped approval, a stable-head independent security review, and measured
DB+Storage byte restoration. Existing #153 MERGE HOLD / Production B2
NO-GO remain unaffected.

## Addendum — 2026-11-01: proposed durable deletion epoch / tombstone contract

**DESIGN ONLY; NOT IMPLEMENTED.** This is the smallest falsifiable follow-up
to the real LOCAL HEAD 809b11b3e8552c5c99382dec82416b70671447da
post-delete replay test. It proved (a) a SEALED receipt with a
missing object does not record deletion, (b) an alternate privileged writer
can re-create the same path with **different or identical SHA** after
verified DELETE, and (c) repeated owner abort's deletedParts counts
ledger paths, not newly removed physical objects. None is an observed
hosted attack. The proposal is NOT a claim that a SQL tombstone
prevents a project-wide service_role/S3 writer from rewriting bytes.

### Contract: durable intent, physical result, and provider custody are distinct

- **Identity and monotonicity:** bind a server-issued upload/part UUID,
  original owner UUID, **original** GoTrue session UUID, canonical PRIVATE
  bucket/path, expected byte count/SHA, and a monotonically increasing
  per-object **deletion epoch**. A new upload uses a new UUID/path; no
  reuse of the old path or reactivation after consent withdrawal.
  Do not derive epoch solely from mutable consent version/timestamps.
- **Append-only receipt:** a *proposed*, protected deletion journal stores
  (operation_id, part_id, epoch, owner_id, original_session_id,
  path, expected_sha256, expected_bytes, state, evidence, actor, occurred_at).
  Unique (part_id, epoch) and an immutable original receipt prevent
  duplicate effects or forged client paths. The client cannot write,
  delete, reset or enumerate the journal. Exact schema, retention,
  privacy access and migration need **separate approval**.
- **Pre-delete fence:** an authorized, isolated operator first CAS-es the
  exact ticket into irreversible HOLD and commits one DELETE_INTENT
  **before** calling Storage DELETE. Deny while a part is CLAIMED, a
  writer lease is unresolved, a signed bearer could still PUT, original
  owner/session/path/SHA mismatches, or provider/DB status is ambiguous.
  Auth-session expiry, object listing and prefix sweeps are not authority.
- **Physical phase:** establish a *provider-enforced* no-write fence and,
  if supported, independently bound object generation/version. Verify
  original bytes and SHA against server receipt, request DELETE for
  exact key/generation, and re-read physical presence. Record response
  and observed generation. PostgreSQL and Storage are NOT one transaction;
  absence on a single GET is point-in-time only. Without custody or
  generation enforcement mark PROVIDER_FENCE_UNPROVEN/HOLD, not
  DELETED_DURABLE.
- **Terminal evidence:** DELETE_CONFIRMED requires durable DELETE_INTENT
  **and** a still-effective independently enforced writer/generation
  fence. Retain an append-only tombstone for (part_id, epoch, path).
  Never re-activate old tickets or paths after reconsent, user login
  or retries. A DB-only tombstone is cooperative application refusal,
  not physical WORM against service_role/S3/storage-admin actors.
- **Ambiguous outcome:** on crash, DELETE timeout/5xx, lost ACK, missing
  object with a still-SEALED receipt, same-size substituted bytes or
  unexpected generation, persist RECONCILE_HOLD with evidence. A 404
  **without committed intent and custody proof** is missing evidence,
  not a successful idempotent deletion. Replay of the same operation
  ID reads the journal before any physical action and never blindly
  deletes an object that may have been replaced.

### Falsifiable future LOCAL acceptance matrix (no new runtime authorized)

| Synthetic case | Required result; opposite outcome is STOP |
| --- | --- |
| Crash before intent transaction commit | No Storage DELETE; old bytes remain or explicit HOLD |
| Crash after intent before provider call | Same operation ID resumes journal epoch; no new owner/path |
| DELETE succeeds but ACK lost / 5xx | No inferred success from 404; generation/fence/journal recheck or RECONCILE_HOLD |
| CLAIMED writer, prior bearer, consent withdrawn during delete | No durable confirmation until in-flight authority is fenced; HOLD |
| Privileged post-delete re-PUT with **different SHA** | Detect physical mismatch, HOLD, never silently delete replacement |
| Privileged post-delete re-PUT with **identical SHA** | SHA cannot prove non-recreation; require generation/no-write enforcement or HOLD |
| Concurrent operators / duplicate HTTP retry | One immutable (part, epoch) intent; no second destructive action |
| Same user in new login after original logout | No takeover of old original-session ticket; operator review only |
| Other owner, sibling part, wrong bucket/path | Reject before provider DELETE; preserve foreign actual bytes |
| New upload after withdrawal/regrant | Fresh UUID/path only; old ticket irreversible HOLD |
| Old app / DB backup restored | Tombstone and provider no-write fence must survive; no old path replay or publish |

**Rollback and cost:** rollback does NOT remove a tombstone or restore
deleted private media. Disable the proposed operator, leave uncertain
intents in HOLD, require actual independent DB+Storage byte restore and
fresh owner-authorized upload on a new path. Compare zero-additional-
fixed-cost current nonpublishing HOLD with an isolated audited provider/
credential boundary; no paid project, new key, Cron or gateway approved.

**Outstanding architecture choice:** (A) proven provider-enforced exclusive
path/generation custody plus isolated deletion actor may eventually permit
a testable terminal deletion guarantee; (B) current same-project privileged
writers provide at most best-effort detection/HOLD. **Do not silently
promote B into A.** Before deployment resolve actual provider capabilities,
old bearer expiry, alternate REST/S3/service-role writer inventory,
retention/privacy policy, operating cost, independent restore/rollback
and meaningful negative tests. No hosted DB/Storage/Auth/RLS,
Production, merger or publication changes authorized.
Draft PR #153 remains **FIX / MERGE HOLD; Production B2 NO-GO**.

## Addendum — 2026-11-01: actual privileged-custody deployment decision (READ-ONLY/SOURCE)

**Evidence type:** GitHub source at PR HEAD `2e646eb2049a6e4cf8abf53f03a24066f636817b`, Vercel project **environment-variable NAME/TARGET metadata only**, and Supabase project Edge Function **source**. No key values, production media, customer auth sessions or hosted DB/Storage mutations were accessed. This is the next architecture decision after the already-verified LOCAL one-shot deletion-intent tests; no repeat transport/receipt fixture is needed.

| Surface | Independently observed boundary | Implication |
| --- | --- | --- |
| `src/lib/supabase/admin.ts` | `createAdminClient()` reads `SUPABASE_SERVICE_ROLE_KEY` from the server environment for the selected Supabase URL | `server-only` prevents ordinary client bundling but is **not** a credential restriction on sibling server functions |
| `human-upload-session/route.ts` | Current user, public series/episode and accepted consent are checked **before** privileged `createSignedUploadUrl({ upsert:false })` | Ordinary login/consent withdrawal does **not** revoke the previously issued signed Storage bearer; default normal route is still active |
| `human-upload-finalize/route.ts` | Privileged downloads reassemble all parts into `new File(...)` and delegate to `publishHumanRecording`; `finally` attempts privileged temp-part removal | A PRIVATE byte receipt is **not** bounded-memory 1GiB media processing, durable cleanup or an atomically published recording |
| `humanRecordingPublish.ts` | `createAdminClient` uploads original, playback and timing media; `sourceFile.arrayBuffer()` buffers input | Migrating only Human temporary staging leaves a separate privileged **final** writer and memory/FFmpeg/transcription constraints |
| `nemoGeneration.ts` / `aivisGeneration.ts` | Both create privileged clients and write AI audio/timing into public or R18-private destinations | AI/TTS path must remain functional and separated; path-string allowlists or user-JWT staging RLS cannot fence unrelated `service_role` holders |
| Vercel project `prj_LzTKVBlhE2poWZ1HOWu6IAmKXjis` | Metadata lists `SUPABASE_SERVICE_ROLE_KEY` targeted at **preview and production**. No `LIBREAD_F2P_MEDIA_WRITER_MODE` name appeared in the retrieved metadata. Values and destination equality were **not** read. | A same-project route-only TypeScript guard/Next process import graph is **not evidence of independently enforced per-route credential custody**; Preview must not be assumed isolated from Production |
| Supabase `nyxbnccuvmlzffgtdadi` Edge Functions | One ACTIVE registration, `child73-draft-import-once` version 2; retrieved function source only returns HTTP 410 `{"error":"disabled"}` and contains **no** provider writer | This registered function is **not an observed active media writer**, but checking one function does **not** exclude dashboard, external S3/REST scripts, preissued signed URLs or leaked/reused service credentials |

Provider semantics independently rechecked in official documentation:
- Supabase Storage RLS gates ordinary authenticated writes; a request **authorized as service_role** bypasses RLS. A local SQL deletion journal is cooperative/audit evidence, not an independent byte-generation fence.
- Supabase JavaScript `createSignedUploadUrl` yields a capability usable without further authentication for **two hours**; `upsert:false` does not prevent a **first** write after a file has been deleted.
- Vercel project/environment variables are scoped to the deployment environment and available to server functions; project-level Preview/Production targeting does **not** itself establish function-by-function secret isolation.
- Documentation: https://supabase.com/docs/guides/storage/security/access-control ; https://supabase.com/docs/reference/javascript/file-buckets-createsigneduploadurl ; https://supabase.com/kb/troubleshooting/why-is-my-service-role-key-client-getting-rls-errors-or-not-returning-data-7_1K9z ; https://vercel.com/docs/environment-variables

### Decision — no extra provider or deployable cleanup yet

**Current adoption decision: HOLD at no new fixed recurring service cost.** The successful LOCAL SQL DELETE_INTENT experiment prevents a second *cooperating* intent, but the same project's privileged writers can still create the original path/bytes after physical removal, defeating any claimed durable delete. A second TypeScript wrapper, Storage RLS policy, old-path SHA equality or sole-worker shutdown cannot meet the stronger provider-wide guarantee. Conversely, separate projects/credentials/storage or a paid broker are **not** justified without quantifying legitimate Human publishing demand, incident exposure, required exact 1GiB size/bounded decoding, credentials, data migration and backup/restore cost.

**Evidence required to change that decision (not authorizations):**
1. Define the required security outcome explicitly: **(A)** provider-enforced no-new-writes/object-generation isolation and measurable deletion durability versus **(B)** best-effort detection with fail-closed, indefinite RECONCILE_HOLD; do not label B as A.
2. Enumerate and independently control all privileged Storage writes/deletes: old Human signed bearer issuance and two-hour expiry, Human final writes, Nemo/Aivis public/R18-private writes, privileged cleanup/read, dashboard/CLI/REST/S3 and any non-repo actor. Verify deployment/secret separation by provider behavior, **not** source imports or env variable names.
3. Confirm actual signed-in owner/reader/recording-consent/R18/rights checks, old PUBLIC/CDN handling, recovery of abandoned parts, physical generation/tombstones and full DB+Storage restore/rollback; distinguish missing original auth session from expired multipart ticket.
4. Resolve maximum publishable size and process limits (client decoding, full-buffer finalizer, FFmpeg and 25MiB normalized transcription cap) before claiming a 1GiB safe end-to-end service.
5. Compare current HOLD (zero new fixed infrastructure), least-privileged user-JWT/TUS path with explicit weaker security semantics, and separately deployed trusted custody boundary using **actual** setup/runtime cost, test burden, operational failure modes and rollback. Start no paid resource, key rotation, hosted table, operator, cron or new service without scope-specific approval.

**Preserved gates:** PR #153 remains OPEN/Draft / **FIX / MERGE HOLD**. Production B2 **NO-GO**; F1/F3/F4, actual authenticated R18/Human/AI/Reader, historical media/CDN, #150 AbortError/p95, independent restore, fixed-release-HEAD review, and exact owner approvals are unchanged. This addendum is SOURCE/PROVIDER-METADATA evidence only—not verified production credential containment or a deployable plan.
