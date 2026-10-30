# Issue #137 / Draft #153 — F2-P PRIVATE byte recovery probe (2026-10-31)

**Classification: NONPRODUCTION, NON-WIRED, isolated MODEL/TEST candidate. This file is not a release decision.** Owner approved only bounded #137/#153 nonproduction design/implementation/negative tests for digest binding, credential/principal isolation and interrupted claim→Storage operations. No application routes, deployed Supabase SQL/RLS/bucket, provider secrets, Vercel env, rights/publication, user data, merge or Production were changed.

## Why this exists

Actual disposable GoTrue/Storage tests already found two different failures:
1. Old service-role-signed Human multipart bearer may remain usable after logout and permit same-key replacement/recreation.
2. Even restricted local broker-JWT Storage INSERT RLS cannot hash physical payload bytes: an alternate holder of the broker JWT uploaded a different WAV to a claimed path. A privileged service_role/S3 key can bypass RLS entirely.

A path/expected hash in a SQL permit, signed user metadata or a successful RLS check **does not authenticate bytes**. A one-time DB claim and a Storage PUT are not a single transaction.

## Deliberately limited candidate

Files: `human-broker-byte-recovery-local.mjs` and `human-broker-byte-recovery.test.mjs`. Only the PR #153 isolated CI source stage runs the new MODEL test. The module is not imported by any deployed app route.

The injected `ledger` records a previously claimed nonce and an immutable expected SHA-256, actor/session/object UUID, exact PRIVATE bucket/path, revision and one-time attempted status. For `stage`:
1. require explicit localhost+disposable environment, non-privileged configuration and a valid claimed receipt;
2. snapshot caller-provided bytes **before any await**, match actual bytes against ledger SHA and require injected **fresh** authority + dedicated-writer isolation verdicts;
3. atomically mark an attempt in the ledger **before** any one-shot PRIVATE `putNew`;
4. if PUT is ambiguous, return `AMBIGUOUS_PUT_HOLD` and never re-issue it automatically;
5. otherwise re-read actual PRIVATE bytes via injected storage reader, compare object UUID and SHA, re-read ledger revision and fresh authority/isolation, then CAS-seal a **PRIVATE-only snapshot receipt**.

A separate `reconcile` checks a previously attempted claim after a lost acknowledgement, operator restart or failed call. Matching bytes and fresh authority can produce `PRIVATE_SNAPSHOT_VERIFIED_ONLY`; missing bytes, digest mismatch, revised claim, revoked authority, absent isolation or concurrent seal return a HOLD. It never uploads again, deletes ambiguous media, issues a public URL, changes bucket visibility or changes actual published records.

## Local PostgreSQL durable receipt / crash and restricted principal evidence (2026-10-31)

The new `human-broker-recovery-ledger-local.sql` is a **disposable local-only table**, created by `run-local.sh` inside the dedicated Docker PostgreSQL after the Human permit fixture and before the provider-only PRIVATE RLS E2E. It is **not** under application migrations and has **no grants** to `PUBLIC`, `anon`, `authenticated` or `service_role`. There is no exposed PostgREST RPC. A PostgreSQL server-side test adapter now uses `INSERT ... SELECT` on a claimed permit, conditional `UPDATE ... WHERE version = n AND attempted = false ... RETURNING` to record exactly one attempted upload, and a fresh-grant/auth.sessions-guarded conditional CAS for the PRIVATE-only verified receipt. Physical readback and actual byte SHA comparison still occur outside the DB and are therefore not one atomic transaction with the receipt.

The real LOCAL GoTrue / Storage `human-broker-private-rls-fence-e2e.mjs` verifies:
- real PRIVATE Storage GET of an injected changed WAV **rejects** the receipt; legitimate original bytes obtain `PRIVATE_SNAPSHOT_VERIFIED_ONLY`;
- after a real LOCAL PUT followed by simulated lost response, a **fresh module instance** reconciles the bytes with the now durable SQL ledger, while a second PUT is denied;
- a separate, credentials-free local Node child performs the committed SQL attempt CAS then terminates with actual **SIGKILL before Storage PUT**; new-instance reconciliation sees the persistent claimed+attempted row, absent bytes HOLD, and no automatic retry;
- a local broker user whose signed JWT is still within its validity window loses Storage INSERT after the server-owned private broker identity registry row is revoked; ordinary user JWT remains unable to impersonate this registry identity;
- two concurrent receipt reconcile calls against the same claimed PRIVATE object produce one successful SQL CAS seal, final version and private snapshot only.

**Critical limits:** actual SIGKILL occurs **after DB attempt CAS but before PUT**; no process kill after provider bytes commit. The `putNew` lost-ACK exception is injected. The credential registry is a local provider-RLS gate, not a safely deployed separate physical process, HSM, secret rotation or proof against an already stolen broker JWT **before revocation**. The previous negative test still demonstrates that a registered leaked broker JWT can substitute physical bytes; a privileged S3/service_role holder bypasses RLS altogether. A verified `sha256` is a **point-in-time** private readback, not immutable object proof. Neither real domain-level consent/rights nor Production-public URL invalidation is wired. No real author app route/Reader/Production DB or Storage has changed.

## Evidence classification and caution

The new test has **in-memory ledger and PRIVATE storage mocks**. It tests the state-machine response to forged digests, wrong buckets and IDs, revoked authority, absent isolation, concurrently competing attempts/seals, corrupted bytes, missing/late PUT, lost response, failed GET, and mutable caller buffers. This is MODEL proof, not real PostgreSQL transaction or live Storage correctness. Existing #153 tests separately exercise actual disposable local GoTrue/PostgREST/RLS/Storage/S3; their historical findings must not be relabeled as new end-to-end coverage for this receipt.

**Credible remaining attacks:** a leaked dedicated broker JWT can bypass this module and write at the provider API; full-privilege S3/service-role writers bypass RLS; a correct readback SHA verifies bytes **at one instant**, not immutable storage or absence of post-verification mutation. An injected isolation predicate is not an implemented independent credential boundary. The SQL/mock CAS cannot prove durable recovery under actual process death, lease expiry, RLS lock ordering or provider outage. No simulated test can revoke previously served PUBLIC/CDN bytes.

**Release requirements:** real separate-principal credential custody and restriction, provider-enforced byte-binding/immutability or verified private-only byte custody, durable PostgreSQL nonce/receipt CAS and crash recovery, session/consent/rights/R18 integration, real signed-in app/browser paths, old public URL disposition, measurable p95/5xx, independent DB+Storage byte restore, a genuinely independent stable-HEAD security review and separate owner-approved Production release/migration. Do not treat this file or same-HEAD CI/Preview READY as GO. Current Draft #153 **FIX / MERGE HOLD; Production B2/H1/H2/F2-P NO-GO**.
