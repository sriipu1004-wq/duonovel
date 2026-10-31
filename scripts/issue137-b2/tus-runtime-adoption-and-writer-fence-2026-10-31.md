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
