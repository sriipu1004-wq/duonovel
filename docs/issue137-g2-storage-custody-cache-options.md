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

## 7. Managed Supabase full custody feasibility vs provider lock (2026-11-02 primary-source check)

**Outcome: provider-level full writer immutability is not obtainable from the existing Supabase service_role/RLS + generated S3 key combination as currently deployed.** This is a scoped impossibility conclusion for those credential and Storage features, **not** a claim that every future Supabase product or every possible custom external storage architecture is impossible. Proof strength: current vendor docs, tracked source, and disposable local overwrite negatives. No live S3 credential holder or production object was read.

Primary vendor source matrix:

| Candidate | Verified published capability | What prevents a production GO |
| --- | --- | --- |
| Current Supabase Storage + restricted JWT broker | Storage RLS can deny broker/owner UPDATE and DELETE, and a unique objectId can prevent accidental aliasing. An S3 *session token* using a user JWT also follows RLS. | A service key in Authorization entirely bypasses RLS. Generated S3 access key/secret give **full access to all buckets/operations**, also bypass RLS. `src/lib/supabase/admin.ts`, the Human media proxy and other privileged routes still depend on the global service role. No complete credential exclusion. |
| Current Supabase Storage S3 protocol + object version IDs | S3 interface interoperates with REST/resumable Storage. | **S3 object versioning is explicitly not supported** as of this vendor documentation check, so S3 VersionId is NOT a provider-enforced immutable predecessor. No equivalent object-lock/retention capability was verified. A new path is a convention, not a retention control. |
| Cloudflare R2 Standard (external, not connected) | Supports bucket locks protecting existing and subsequent objects against overwrite/delete while a rule applies; bucket-scoped Object Read/Write API tokens are supported; S3 `PutObject If-None-Match: *` is atomic create-once. | **R2 bucket-lock administrator can edit/remove lock rules**, so separate its configuration credential from the runtime writer; R2 S3 `x-amz-object-lock-*` headers are NOT supported (different feature). Does not revoke already issued URLs, cached copies, originals/rights or guarantee permanent unchangeability against all account administrators. Deletion and preservation policy need explicit design. |
| Amazon S3 Object Lock compliance mode (external, not connected) | Locked object VERSION protected during retention, including root account, stronger than alterable bucket rules. | Cannot remove/delete protected object versions before retention expires; potential conflict with user account/data erasure, rights takedowns and legal obligations. Versioning, migration, recovery, IAM and operational overhead; exact regional cost not calculated. Governance mode is bypassable by privileged permission, so is not equivalent. |

Sources (vendor primary):
- https://supabase.com/docs/guides/storage/security/access-control
- https://supabase.com/docs/guides/storage/s3/authentication
- https://supabase.com/docs/guides/storage/s3/compatibility
- https://developers.cloudflare.com/r2/api/tokens/
- https://developers.cloudflare.com/r2/api/s3/extensions/
- https://developers.cloudflare.com/r2/buckets/bucket-locks/
- https://developers.cloudflare.com/r2/api/s3/api/
- https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html
- https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock-managing.html

**Scope distinction:** Keeping code in a separate Next.js process does NOT provide independent provider credentials when it still inherits the same `service_role` or global S3 key. Nor can a permissive new rule override existing privileged bypass; the old app/API/backup writers remain capable until their real deployed privileges change. The isolated broker test permits updating the file only with service_role as a deliberate negative. Restricted local broker + separate versioned key is technically useful, but **not security-certified append-only storage**.

### Price and operational comparison (USD; published rates, not a user-account quote)

Prices and quotas may vary by account, billing date, location, and workload. We did **not** inspect the user's billing plan or make purchases.

| Provider/plan | Published storage basis | Illustrative *additional* charge for 30 GB held for one full month, before operation/other fees |
| --- | --- | --- |
| Supabase current account | Pro/Team includes 100 GB **organization-level** Storage allowance; overage USD 0.0213/GB-month. Free 1 GB has different limits. | **Unknown incremental amount**: depends on user's actual plan, all project usage and quotas; no double counting the existing roughly 30 GB snapshot |
| Cloudflare R2 Standard separate service | Free monthly 10 GB-month, first 1M Class A and 10M Class B requests, then storage USD 0.015/GB-month, Class A USD 4.50/M and Class B USD 0.36/M, zero R2 Internet egress | 30 GB-month minus 10 GB-month allowance = 20 GB-month × 0.015 = **USD 0.30/month**, assuming standard tier eligible for free quota and no excess operations |
| AWS S3 Object Lock | Region-specific storage/requests/transfer, storage class and lifecycle/retention charges | **Not determined** without region, requests, audio size, retention period and egress |

Provider price references:
- https://supabase.com/docs/guides/platform/manage-your-usage/storage-size
- https://supabase.com/docs/guides/platform/manage-your-usage/egress
- https://developers.cloudflare.com/r2/pricing/
- https://aws.amazon.com/s3/pricing/

The 30 GB is **only a comparison scenario**; the historical total site Storage snapshot is not known to be 30 GB of Human narration. Object-request/read patterns, user streaming traffic, Cloudflare Workers/Next proxy costs, retries, storage duplication, provider availability, legal deletion and backup recovery will dominate real cost/risk decisions. R2's free tier must not be mistaken for zero cost of an independently deployed proxy and migration.

### Decision based on necessity, not just possibility

**Now:** no implementation change to hosted Storage. Preserve existing Studio behavior for third-party narrators on eligible `open` works; new private/public Reader release remains HOLD. Retain existing Supabase as canonical storage for current production and do not migrate 30 GB for a narrowly unproven future audio feature.

**Reasonable next decision point, not automatically authorized:** first specify the actual threat tolerance. If preventing accidental/ordinary broker overwrite and detecting unauthorized privileged modifications is sufficient, current RLS broker + content digest + append-only naming could be simpler, while privileged write attacks remain an explicitly accepted **risk** (cannot be labeled full G2). If protection from compromised service_role/global S3 credentials is a release requirement, **R2 bucket-lock plus separate configuration and bucket writer principals** is a candidate to validate within a tightly bounded separate, disposable provider account; AWS S3 compliance mode only where retention/deletion rules make it acceptable. Neither external service has been activated or E2E tested.

Before a genuine prod candidate: (i) enumerate LIVE privileged holders **without reading secret values**, (ii) prove owner/narrator/R18/rights + signed bearer invalidation at actual Reader HTTP boundary, (iii) decide reversible deletion/rights takedown behavior under lock rules, (iv) prove exact object bytes and concurrent restore/signed URL controls, (v) measure 1 GiB uploads and memory/p95/egress, (vi) obtain independent fixed-HEAD rights and security assessment, then exact owner merge and separate Production changes approval. Even a vendor WORM claim cannot revoke copies already downloaded by users.

### CI guard for this decision

`scripts/issue137-b2/g2-custody-feasibility-source-model.mjs` checks source-level privileged routes, the existing isolated broker write-once negative path, and explicit FAIL-CLOSED custody/retention scenario assumptions. This is **SOURCE+MODEL**, not a supplier integration or real R2/AWS test. Only an external service E2E on an expressly approved disposable account could provide that evidence.

**Final gate remains: PR #153 Draft / FIX / MERGE HOLD.**
