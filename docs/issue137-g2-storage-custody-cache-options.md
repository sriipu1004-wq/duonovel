# Issue #137 — G2 Storage writer custody, bearer revocation and CDN/restore audit

**Date:** 2026-11-02 Brisbane. **Scope: SOURCE + disposable localhost only**.
**Status: candidate comparison / NOT a deployable policy / PR #153 Draft MERGE HOLD.**
Do not rotate provider keys, purge caches, migrate Storage, change auth/RLS, access production data or merge under this approval.

## 1. Existing evidence and what it does NOT prove

The canonical app's G1 local-only PRIVATE pointers do not freeze bytes in the provider. A successful PostgreSQL durable CAS receipt is metadata, not an exclusive Storage writer lease. The prior disposable GoTrue/Storage test already proved that a service-role actor could replace the PRIVATE object after the seal, while a later full SHA read returned HOLD_BYTE_DRIFT. This detects **subsequent** tampering, not prevention or atomic authorization against privileged storage writes.

The local writer dependency scanner `scripts/issue137-b2/recording-credential-route-dependencies.mjs` already enumerates privileged transitive Next.js route imports, with 13 concrete recording route classes marked privileged and two test/user-only candidates. The tracked-source scanner `scripts/issue137-b2/s3-public-writer-inventory.mjs` scans app/SQL/workflow/test source for writes, public bucket paths, signed tokens, service keys and S3 candidate use. It emits **candidate matches, not a live credential inventory**; there is no independent evidence of all remote processes, dynamic imports, external holders, already minted bearer tokens or provider backup restores. Reuse these instruments; do not claim they exhaust all access.

Directly confirmed in current PR #153 source:

| Surface | Tracked reference | Security consequence |
| --- | --- | --- |
| Privileged administrative client | `src/lib/supabase/admin.ts` | `SUPABASE_SERVICE_ROLE_KEY` bypasses ordinary Storage RLS when used as the authorization token |
| Human signed multipart upload | `src/app/api/recordings/human-upload-session/route.ts` | `createSignedUploadUrl` issues a bearer for the designated path; check issuance and old-token lifetime |
| Human legacy normal publisher | `src/lib/recording/humanRecordingPublish.ts` | privileged uploads of original, playback and timing objects, with owner/atomic database constraints that do not prove exclusive write custody |
| Human media reader | `src/app/api/recordings/human-audio/[recordingId]/route.ts` and `src/lib/recording/privateMediaProxy.ts` | source authorizes before a direct `service_role` Storage stream; signed download/legacy PUBLIC URL/recall are different channels |
| Nemo & Aivis generators | `src/lib/recording/nemoGeneration.ts`, `aivisGeneration.ts` | privileged Storage uploads and legacy `getPublicUrl` paths; do not equate these with Human narration |
| G1 disposable receipt | `scripts/issue137-b2/human-tus-private-pointer-local.sql` | owner-bound `PRIVATE_POINTER_ONLY` with physical digest evidence; not PUBLIC and not an immutability barrier |
| Storage S3/maintenance/restore | repo-wide source scanner only | external credentials, dashboard/service administrators, object restores and foreign workers remain **NOT ENUMERATED** |

The README/older public URLs may already exist independently of the new private reader. An app-side R18 check cannot retroactively revoke the public object's original bytes at a public Storage URL.

## 2. Revocation matrix and actual verification level

| Failure scenario | Precondition and current expectation | Evidence level |
| --- | --- | --- |
| Consent OFF / R18 OFF / narration CLOSED | Current DB private pointer denies immediately; prior signed download/upload bearer can remain valid | G1 real local revoke; **G2 real disposable Storage positive/negative evidence: old signed bearer still returns correct PRIVATE bytes after consent is revoked**; no CDN |
| Privileged storage overwrite after CAS | Same path bytes can change and full readback must HOLD | Real disposable Storage test; **physical exclusion FAIL** |
| Signed URL expires but CDN/browser cache has bytes | Token expiration alone is not cache eviction | Supabase official docs, **not measured** on user's production CDN |
| Revoke auth/JWT secret | Does not by itself invalidate dedicated Storage signed-URL signing key | Supabase official docs, not a key operation test |
| Old PUBLIC URL already circulated | RLS, logged-in checks and new PRIVATE bucket cannot make that old public object private | SOURCE/official docs; neither deletion nor active user URLs verified |
| Immutable object later restored or replaced from backup | DB CAS cannot bind a permanent immutable provider revision without custody and restore-specific tests | UNVERIFIED |
| Revalidated HTTP Range / streaming after auth is revoked | A preflight+digest check does not guarantee no stale already-in-flight bytes | G1 SOURCE/MODEL only; **no real Reader HTTP E2E** |
| Large audio / CDN purge | 16 MiB local G1 fixture is NOT 1 GiB throughput, cost, latency or cache purge evidence | Not tested |

**Supabase sources checked 2026-11-02:**
- https://supabase.com/docs/guides/storage/security/access-control
- https://supabase.com/docs/guides/storage/serving/downloads
- https://supabase.com/docs/guides/storage/cdn/smart-cdn
- https://supabase.com/kb/troubleshooting/storage-private-bucket-files-still-accessible-after-remove-access-or-logout

Supabase documentation distinguishes Storage signed-URL signing keys from Auth JWT keys; it describes key rotation/revoke and CDN purging separately. CDN propagation can be up to approximately 60 seconds in documented scenarios, and browser caches may remain. Do not assume a per-object server revoke makes any prior downloaded byte copy disappear. Real signatures/TTL/CDN state for this particular project remain unknown.

## 3. Mitigation options (technical possibility != recommended)

| Candidate | Security value | Incremental expense | Maintenance / operational cost | Current verdict |
| --- | --- | --- | --- | --- |
| A. Retain existing signed uploads, RLS and current G1 digest alone | detects drift **after** a check; cannot exclude privileged overwrite or recall old bearer/CDN | no new infrastructure | low upfront, high security/revocation exposure | **NO-GO for sensitive G2 release** |
| B. Short-lived user playback tickets, strict no-store server-side user/session/rights checks, never return a direct signed Storage URL | reduces future bearer leak and new unauthenticated reads | likely incremental proxy egress/CPU and potential serverless timeout cost; **amount not measured** | moderate; partial-ranges require verified integrity; cannot physically freeze privileged bytes | **suitable partial hardening, NOT G2 alone** |
| C. Separate append-only/unique object version and server-only credentials, restrict signing to a minimal writer service | reduces unintended overwrite capability and enables fail-closed epoch/canonical pointer checks | can often reuse existing Supabase tier for controlled design, but may require isolated service/secret management and increased operation/egress cost | high upfront; audit all legacy service-role/S3 holders, migrate old paths, manage failures/restore | **preferred direction for nonproduction design**, but not proven |
| D. Dedicated independent object store or provider-enforced retention/immutability | strongest physical prevention if all ingress paths and restores covered | may require additional account/paid storage, requests, egress and retention fees | high; compliance/delete/export/backup ownership and second-provider outages | **defer pending C feasibility and cost measurements** |
| E. Minimize URL expiry, disable unnecessary client caching, explicit CDN purge/revoke plan and remove obsolete old public objects | narrows caching exposure; cache purge/delete can lag and downloaded copies persist | might increase repeated egress; purge/admin and migration burden | medium/high; deletion is destructive and needs a separate exact-object approval | **defense-in-depth only, no instantaneous revoke guarantee** |
| F. Operationally HOLD new PUBLIC audio publication while using nonpublic isolated tests | avoids issuing a new unsupported public safety claim | no new cloud cost | feature delay / no production trial | **immediate safe baseline** |

**Preliminary recommendation:** adopt **F** until G2 is measured. Evaluate C plus the most limited useful parts of B/E inside disposable environments before paying for D. This is a hypothesis, not permission to introduce a secret service/worker, apply migrations, disable recordings, delete public objects, buy services, or change Production. Preserve third-party narrator access when original author sets recording OPEN. An author's preference and actual original/edition rights are separate grants.

The user forbids unrequested extra charges. **No supplier price is asserted here**: actual plan quotas, egress, request size, processing volume, retention rules and provider prices must be measured before any paid architecture recommendation.

## 4. G2 evidence required before implementation approval

1. Explicit source-to-deployment cross-check for all privileged service-role and S3 write agents; provider key inventory/rotation mechanisms evaluated **READ ONLY** under later specific authorization. Do not print or fetch secret values.
2. Demonstrate in disposable provider: a signed-URL bearer can outlive a DB permission revocation, and no new token is minted after revocation. Observe the private pointer denial, old bearer and actual byte checksum separately. This test does **not** exercise real CDN.
3. Demonstrate user-scoped TUS denial of upsert/delete and a privileged overwrite remains possible under current architecture; compare candidate *credential custody* prevention, not just digest detection.
4. Prove write-once semantics for committed object revisions with an independent writer adversary, concurrent claim/read/revoke, DB restore and backup replay, and no direct old writer/signer path. If impossible with existing Supabase service keys, block release and scope a separate provider design.
5. Enumerate and categorize already public, signed, authenticated CDN and browser paths, with initial URL creation dates, TTLs, actual readers and deletion/restore plan; these are NOT inferable from repository source alone and would require separately authorized protected metadata access.
6. Before any real Reader release: full signed-in HTTP playback E2E across owner/foreign narrator/anonymous/R18 OFF+ON, exact byte stream+Range verification, stale source/rights/permission, 1 GiB memory/p95/egress cost, backup restore and region-specific CDN revalidation. Required independent fixed-HEAD security and rights review, exact PR merge approval and separate Production migration/storage/key operation approvals remain distinct.

## 5. Mechanical local evidence

- Existing broad scanner: `scripts/issue137-b2/s3-public-writer-inventory.mjs`.
- Existing transitive dependency scanner: `scripts/issue137-b2/recording-credential-route-dependencies.mjs`.
- New SOURCE+MODEL: `scripts/issue137-b2/g2-credential-cache-boundary-model.mjs`. A modeled cache is **not** CDN evidence. G2 SOURCE+MODEL **37 assertions PASS** in run 41401658590.
- New local signed bearer revocation negative in `scripts/issue137-b2/human-tus-private-pointer-local-e2e.mjs`. **PASS on isolated run 41401658590 / job 125134599309**: 102 PRIVATE pointer checks, standalone signed bearer remained usable after DB consent revocation, zero public records. No hosted token was issued, and no actual CDN cache was involved.
- Prior real local G1 physical overwrite evidence is retained.

**STOP:** PR #153 stays Draft / MERGE HOLD. Production Supabase/Vercel/account data and rights are untouched. New G2 work is nonproduction evidence only.


## 6. G2 isolated append-only prototype — boundary and deployment decision

This is an **extension of the existing F2-P disposable broker fixture**, not a new Storage provider, production migration, or a rewritten user-facing app. Exact source: `scripts/issue137-b2/human-broker-private-rls-fence-local.sql` and `human-broker-private-rls-fence-e2e.mjs`.

- Three authentic local GoTrue principals are distinct: normal Human narrator, unrelated account and an app-metadata-marked broker. Only the broker has a claimed one-time permit that permits **INSERT** to its PRIVATE unique object path. Ordinary narrator cannot direct-upload; unrelated account cannot read/write.
- The broker cannot `upsert` or delete a stored predecessor. A revised WAV should use a **new one-shot permit + distinct objectId/path** while prior path and prior bytes remain unchanged. A separate test checks fresh upload and old-byte preservation. Any token that can create NEW objects in a claimed path also remains a pre-seal forgery risk: Storage RLS cannot itself verify a physical SHA.
- The local SQL has restrictive UPDATE/DELETE Storage RLS policies and private-bucket-publicity trigger, but a **service_role key bypasses RLS**. An explicit negative control must attempt a privileged overwrite of a broker-sealed path and compare actual bytes. If it succeeds, G2 physical immutable storage is **not proved** despite a successful restricted-JWT fence.
- Even an append-only naming scheme is not a trust boundary if a privileged holder can delete, replace, sign old objects, recreate a name, or restore provider bytes. Protecting the DB pointer with hashes and unique names prevents accidental aliasing and detects later drift, but does **not** repair a capability leak or already distributed bytes.

**Acceptance distinction:** Local restricted-broker first-write and old-object preservation **may PASS** while privileged-rewrite exclusion **FAILS**. That outcome is not a CI failure: it is an expected negative confirming the actual unmitigated threat. A release proposal must demonstrate two independently configured principals (writer vs recovery/reader), enumerate every legacy `service_role`/S3/backup writer, constrain production secret scope and include a meaningful physical immutability mechanism, not merely reusing the same full-permission service key in an isolated process. Existing Supabase's service key has full Storage RLS-bypass scope; therefore complete write-once semantics cannot be claimed from RLS policy alone.

**Cost/ops:** Reusing the current provider with broker custody avoids adopting a second paid platform and reduces new-provider operational complexity, but incurs broker lifecycle, worker availability/timeout, restricted credentials and auditing obligations. Separate object-lock/WORM service may impose storage/PUT/GET/egress/retention and deletion-compliance costs. No amounts or provider-specific retention guarantee have been verified. The present safest course remains no PUBLIC release until that evidence exists.

The prototype must run only in dedicated Docker PostgreSQL + local Storage fixture under `DO_NOT_CONTACT_PRODUCTION=true` and `B2_EPHEMERAL_CONFIRM=local-only`. It must leave no provider credentials or audio objects outside that ephemeral workspace. Results are to be added only after exact-HEAD CI logs have been examined.
