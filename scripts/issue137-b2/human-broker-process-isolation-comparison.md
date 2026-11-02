# Issue #137 / Draft PR #153 — F2-P dedicated broker credential custody and physical byte binding comparison (2026-10-31)

**Scope:** owner-approved NONPRODUCTION-only research and disposable localhost negative tests. Not a deployed architecture, not a production migration, not a release GO. No real author/Reader route, hosted auth/RLS/Storage, PUBLIC asset, Vercel environment or privilege changed.

## Threat model

- An attacker can call the existing public user-facing app endpoint or invoke a leaked **restricted broker bearer** against the provider's Storage endpoint. An independently held `service_role`/S3 key is a different privileged bypass threat.
- The application may have checked SHA-256 before the Storage PUT, but provider RLS only sees Storage metadata and path, **not physical bytes**.
- A provider accepted PUT and a successful readback are separate from the database CAS. A crash can leave an attempted permit without an object, or a verified object that can be changed by a different privileged writer.
- In previous real local tests a signed Human upload token was replayed after GoTrue logout. Revoking a GoTrue session alone does not revoke an already issued bearer.

## Option comparison

| Candidate | Provider-side bypass | Physical-byte integrity | Operational cost/complexity | Current decision |
| --- | --- | --- | --- | --- |
| A. Keep current signed Human multipart URLs, privileged upload or direct user Storage RLS | Existing signed bearer and S3 paths can bypass broker | No provider-enforced exact SHA | Lowest change, high security debt | **NO-GO** |
| B. Function/module separation inside the existing app process | Any code with the credential can make an alternate PUT | Server-side pre-hash protects only cooperative callers | Low development effort, no real key isolation | **Insufficient** |
| C. Dedicated single-purpose server process with one signed GoTrue broker user, no service_role/S3 key, restricted RLS and a narrow IPC request | The dedicated JWT remains a bearer credential: anyone stealing it can bypass the process; independent privileged keys still bypass | Worker checks a pre-provisioned expected SHA against a private bytes snapshot, then POSTs first-write; external callers can still bypass the worker with stolen JWT; DB/Storage atomicity absent | Moderate runtime isolation, secret delivery, lifecycle, retries and resource limits | **Isolated experimental candidate only** |
| D. Network-isolated trusted byte gateway with sole provider ingress, fresh domain checks and object immutability / two-phase private quarantine + independent verified release | Only adequate if all alternate S3/service_role/signed-token writers are inventoried and blocked | Stronger with independently trusted digest and immutable byte/object binding, plus safe quarantine and final CAS | Highest infrastructure, bandwidth, p95, CPU and maintenance; up to 1 GiB Human parts require streaming design | **Potential design after separate scope/review; not validated** |
| E. Keep uploads PRIVATE and do not publish, while documenting blocker | No new exposure from this candidate; existing PUBLIC bytes unaffected | No claim of integrity for new PUBLIC media | Zero additional rollout risk | **Current production fallback / recommended release HOLD** |

Supabase official documentation: [Storage access control](https://supabase.com/docs/guides/storage/security/access-control) explicitly states service keys bypass RLS; uploads require INSERT, upserts require SELECT + UPDATE. [Auth sessions](https://supabase.com/docs/guides/auth/sessions) and [signed upload URLs](https://supabase.com/docs/reference/javascript/storage-from-createsigneduploadurl) explain current JWT/session and bearer limitations. Do not assume a Storage path policy authenticates a WAV payload.

## Nonproduction test implementation

- `human-broker-process-writer-local.mjs` is an actual child process, executable only with `DO_NOT_CONTACT_PRODUCTION=true`, an exact localhost API URL/port and `B2_EPHEMERAL_CONFIRM=local-only`. It rejects service key env vars. A **trusted test bootstrap** sends one locally issued restricted GoTrue broker JWT, anon key, actor/object UUID and expected digest via Node IPC (not via process command-line/environment). The child validates `app_metadata.libread_local_broker` with localhost GoTrue. A subsequent runtime **stage** request may include only Base64-encoded media bytes; path, bucket, actor, digest, JWT and MIME cannot be overridden by that request. The worker verifies real SHA-256 before a first-write PUT to the fixed PRIVATE bucket; each attempted network write exhausts the local process. No signed URL, key or JWT is returned to caller.
- `human-broker-private-rls-fence-e2e.mjs` provisions the synthetic credentials and permit **in the test harness**, verifies invalid stage fields, changed same-size bytes, no object after rejection, correct audio uploaded through the worker to real disposable Storage, matching owner-authorized GET, one-time refusal, stdout/stderr without token, and refusal to bootstrap an ordinary user.
- **Critical honesty:** the trusted test harness necessarily knows and supplies the broker JWT at bootstrap. This is a genuine separate Node process and restricted runtime IPC demonstration, **not a proof of independently secured secret custody**, hardened OS isolation, production-signed credential delivery, or that a compromised application server cannot steal the JWT during bootstrap. The worker does not have an independently trusted PostgreSQL expected hash, nor does it seal a durable receipt itself; it trusts bootstrap. Production would require distinct secret provisioning, provider ingress restrictions, resource confinement, non-exportability/rotation, strict expiry, session and rights refresh, and a separate fixed-HEAD review. A registered stolen JWT can bypass the worker and substitute bytes at the Storage API; earlier local adversarial test remains required and unmodified.

## Gate and no-go

The test proves only whether *the cooperative isolated worker path* writes the expected bytes for one synthetic object. It does **not** fix old privileged direct S3, two-hour signed Human multipart token replay, alternate-public-key writing, existing PUBLIC/CDN bytes, snapshot-to-object TOCTOU, durable cross-provider semantics or actual author/browser integration. No upgrade to Production, merge or Public media admission on these results.

**Disposition: Draft #153 FIX / MERGE HOLD, Production B2/H1/H2/F2-P NO-GO.**
