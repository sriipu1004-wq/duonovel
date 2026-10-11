# Child84 — Independent database and Storage recovery gate

Status: **Audit and runbook only, not a proven backup/restore.**
Snapshot: 2026-10-11 AEST. Source: connected, read-only Production Supabase SQL and organization metadata.

## Verified platform and data inventory

- Supabase organization plan: `pro`; Production project: `nyxbnccuvmlzffgtdadi`, PostgreSQL 17, region `ap-southeast-1`, observed healthy.
- Supabase documentation states Pro organizations are normally eligible for daily **database** backups with up to seven days of backup availability. This audit did **not** retrieve project-specific backup timestamps, backup files or restore evidence. Do not treat plan eligibility as proof that a usable backup exists.
- Supabase's standard database backup includes database tables/metadata, **not** object bytes in Supabase Storage. A database restore cannot recreate absent/deleted audio/image files.
- The following counts and byte totals were observed at one point in time and are **not** verified backup archive sizes or transfer costs.

| Bucket | Visibility | Objects | Reported object bytes |
| --- | --- | ---: | ---: |
| recording-audio | public | 4,720 | 30,165,700,212 |
| illustrations | public | 6 | 12,290,705 |
| bgm-library | public | 2 | 11,648,088 |
| human-recording-audio | private | 0 | 0 |
| **Total** | | **4,728** | **30,189,639,005** |

The database currently contains 2,277 `public.recordings` rows with nonempty, distinct audio URLs. Parsing the `recording-audio/` object name from each URL and joining against `storage.objects` found **2,277/2,277 referenced files present** (28,152,902,530 bytes). The other **2,443** objects in that bucket (2,012,797,682 bytes) are **not referenced by `recordings.audio_storage_path`**. This does *not* prove they are orphaned: the audit has not excluded other tables, segmented output, old operational workflows, or pending/legacy references. **Never delete them on this evidence.** No media contents, private keys, signed URLs, filenames or hashes were exported or displayed.

Repeat the aggregate read-only audit using `scripts/child84-storage-recovery-audit.sql`. Re-run the checks immediately before/after any authorized backup or restoration, as data can change.

## Backup plan — two distinct recoverability claims

### 1. Database recovery

1. Open Supabase Dashboard → project → **Database → Backups** (scheduled backups) and document the latest actual restore point, scheduled backup status and retention visible to the operator. Check that the expected project and database ID match. No backup was inspected via the available connected API in this workstream.
2. In a trusted environment, export a **separate logical backup** for off-site retention (Supabase CLI `db dump` or supported `pg_dump`) using a narrowly controlled database credential. Never embed the database URL/password, access token, or the resulting database contents in a public repository, PR comment, Vercel runtime log or unencrypted GitHub Actions artifact.
3. Verify that the resulting archive is readable; compute and record an actual checksum *after* export. Do not invent backup checksums or assume a successful export is a verified restoration.
4. Restore into a separate, access-controlled non-Production database with known compatible PostgreSQL major version. Verify table/view/function/RLS/grant presence and counts, reference ownership, author permissions, public-vs-private episode admission and the 84 currently observed rights-evidence rows against the **export-time** baseline. Do not restore onto the running Production project to perform this test.
5. Record reproducible evidence (verified restore timestamp, source/target environment, storage location under private control, actual hash, representative SQL checks) without publishing sensitive credentials or private user data.

### 2. Storage object recovery

1. Select an independently durable destination for the ~30.19 GB of current Storage object bytes; confirm actual network egress, storage charges, data residency and permissions before transferring. No export, purchase or credential provisioning is authorized by this runbook.
2. Export each permitted bucket/object using authenticated server-side access; preserve the complete source bucket/object key mapping securely. For private buckets, do not alter visibility or use public URLs as a backup mechanism.
3. Build a manifest from real exports containing bucket/key, byte length and computed checksum per object, stored **privately**. Check source inventory counts against completed export counts; do not make stronger integrity claims without completed cryptographic verification.
4. Test restoring a bounded representative sample to an isolated bucket. Compare recovered bytes/hashes, retrieval authorization and DB-to-object resolution. A Storage restore can be operationally independent of a DB restore, so verify both together for actual Reader/audio playback.
5. Retain independent storage-object backups in a secure off-site location with a documented restoration path. Decide retention and coverage before promising a site-wide disaster-recovery objective.

## Production rollout gates

- **No-go:** PR #108's scheduled-posting Cron SQL may not be applied merely because isolated PostgreSQL CI succeeded. Actual Supabase `pg_cron` extension/permissions, schedule execution, audit visibility, rollback and monitoring require an isolated environment; database recovery must have verified backup/restore evidence. The existing Reader/RLS published-only filter must not be relaxed.
- **No-go:** do not clear or bulk-delete the 2,443 non-`recordings`-referenced audio objects. A lifecycle and provenance investigation with complete reference inventory is a separate auditable task.
- **No-go:** do not make a public mirror, alter R18/author privacy, or store backup archives under public `recording-audio`, public GitHub/Vercel artifacts, or a shared URL.
- No database writes, Storage mutations, outside transfer or new paid Supabase project were performed as part of this audit.

## Documentation sources

- Supabase Database Backups: https://supabase.com/docs/guides/platform/backups
- Supabase Cron: https://supabase.com/docs/guides/cron
- Existing project gates: `docs/development-workflow.md`, `docs/decisions.md`, `docs/roadmap.md`.

**State:** Child84 remains open; Child85 remains blocked. A runbook plus SQL row counts are not a verified independent backup, restoration or durable deletion policy.

## 2026-10-11 scheduled Cron test branch, backup evidence still blocked
An isolated Supabase development branch was created for an hourly quoted rate of 0.01344, used only for synthetic Cron execution and then explicitly deleted. Its own canonical migration replay failed because a prior migration tried to ALTER a missing `public.series`. The Cron extension and job succeeded after constructing only minimal synthetic tables. This branch was **not** a restored snapshot of the user's real Production data and is **not** evidence of a database or Storage backup/restore. Preserve the requirements above and `docs/child84-cron-isolated-supabase-evidence.md` before any Production scheduler adoption.


## 2026-10-11 executable read-only restore acceptance contract

`scripts/child84-readonly-restore-acceptance.sql` is the repeatable
**read-only consistency checklist** for a trusted privileged inspector.
It must be run first on the connected Production database as an
export-time aggregate baseline and then on a **separate actually restored**
database at the same snapshot. Execute as one `BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY`
transaction; plain read-only with PostgreSQL's default READ COMMITTED does not
ensure all SELECT statements observe the same MVCC snapshot, never through a user/anon Data API token.

The script fails closed if a critical relation or foreign key is missing,
sensitive RLS is disabled, prohibited Human translation/private table
SELECT grants exist, or episode/recording parent references are broken.
It emits only aggregate totals and a check of database-held recording
references versus `storage.objects` metadata. It does **not** reveal
owner IDs, paths, user-supplied text or private object names.

**Production source baseline (read-only execution):**
the *exact source* SQL blob `91f9e75b98df49529c5e960be9970a0a844b1ad1`
completed without exceptions; 2,277 distinct recording-audio references
matched 4,720 object metadata records, with **0** referenced recordings
missing metadata and **2,443** objects without a direct recording-table
reference. The pre-existing full inventory remains 4,728 objects across
all buckets (about 30.19 GB metadata-reported size).
All of these are **source-only** observations and **not** proof of a
database archive, restored database, Storage object byte download,
checksum or retained off-site copy.

The CI source contract
`scripts/test-child84-restore-acceptance-contract.ts` ensures this
SQL remains read-only and preserves the RLS/FK/metadata assertions;
CI itself does not connect to Production. Before relying on recovery:

1. Verify a genuine database backup and export-time timestamp.
2. Restore into an independent trusted Postgres/Supabase environment,
   ensuring grants, Auth, RLS, views and functions are present.
3. Run the acceptance SQL there; compare aggregates with the *same*
   export-time baseline, not a later live Production state.
4. Separately restore actual Storage object bytes into a private isolated
   destination, cryptographically compare hashes/sizes, and verify
   playback and privacy/authorization under an authenticated test identity.
5. Retain private restore evidence and never publish dumps, source
   credentials, user data or object keys in GitHub, Vercel or this audit.

**No-go remains:** database-only SQL consistency can pass while the
Storage object payloads are absent. A later restored-environment
execution and file-byte validation are independently mandatory before
Cron #108 or Child84 acceptance. No schema, object or Production data
was changed by this source audit.

## 2026-10-11 portable schema-drift fingerprint (read-only, source only)

The second exact checked-in SQL file
`scripts/child84-readonly-restore-schema-fingerprint.sql`
(blob `7bb2d5c8a81642b98fd88c33876ffb2c504589c0`)
ran successfully against Production inside `BEGIN READ ONLY` and returned
aggregate object counts plus **SHA-256 fingerprints of sorted catalog
definitions** for `public`, `storage`, and installed extensions.
It exposes neither function bodies nor object names or credentials.
RLS policy role OIDs are normalized to **role names** so identifiers
from independently created PostgreSQL clusters are not hashed directly.

| Catalog category | Count | Observed SHA-256 |
| --- | ---: | --- |
| relations | 67 | `c260a007a3704915a0593a44dcf2dbb91a9fb4c946a6c08d1c0ad57b79f6ccab` |
| columns | 682 | `1fd35664502ef00d55da4117c506ec502a64077f7ffafb53c515ee22e5bda34e` |
| constraints | 285 | `8dc22ce3e95803f053a91d48a074674048d6f7be0b1b803877746a4fc59bd9e4` |
| policies | 80 | `dea5d96e9443ca2a5aa4d378bdb6f268f45e31ba2376d66e618d2f6e4466e3cb` |
| functions | 66 | `a484459f961b1cc921effd0d225d2aed0e3f3a89f2fd42f611834bf429c506cf` |
| indexes | 201 | `9300da5b8529232d7c0eccde988199af8e303414499f9b07b71b272247d9d207` |
| triggers | 21 | `60a31a97995b31a481097b08981479c8c518bf3006a82ed220dc50c04ffedd96` |
| anon/authenticated table privileges | 63 | `07af89af845e4fca5249eb8ce7f4775431e2cec407eb6125aff6b08653886601` |
| extensions | 5 | `3ba611e22fec2898e1de6ee8cdd53ef9e16f7c73300fbd7876d0aeb85e5774cd` |

**Scope:** These are the values for the live source at the collection
point, not fabricated restore checksums. A restored environment should
re-run the identical script and compare every count and fingerprint
against the matching backup/export snapshot, with compatible PostgreSQL
major version, installed extensions and role names. Expected application
migrations or platform differences must be reviewed instead of being
automatically ignored. Hashes are deterministic schema-drift signals for
these catalog subsets, not proof of a complete cluster security audit,
actual user-row recovery or object-byte integrity. The current live
source may legitimately drift before a later backup/export; recapture
a timestamp-matched source baseline then.

Companion offline CI:
`scripts/test-child84-restore-schema-fingerprint.ts` ensures no writes
and required catalog/role-name normalization. **No independent DB restore
or Storage file-byte download was performed**. In particular the
2,443 Storage metadata objects lacking direct `recordings` references
remain untouched and must not be labeled orphaned.


## 2026-10-11 Child84j independent review and restoration feasibility

**Verified live platform and migration source:** Production PostgreSQL 17.6.1 is
ACTIVE_HEALTHY; `pg_database_size(current_database())` returned
**80,243,859 bytes** (approximately 77 MiB) from a read-only query.
The management connector lists 20 recorded applied migrations; the
repository stores 75 migration files, starting with
`ALTER TABLE public.series` on a table not created by that chain.
Neither a Supabase development branch nor a bare migration replay
can be described as a complete restored Production snapshot. The current
Supabase Management connector has **no list-backups action**, and
the connected project/organization APIs do **not** report backup point
IDs or timestamps. This workstream therefore **did not verify a
project-specific backup instance, backup creation date, actual archive,
checksum, or restore success**. Pro plan's *eligibility* for seven days
of daily database backups is not an independently observed backup.

**Verified Supabase-managed compute estimate for this organization:**
- Development branch starts at **USD 0.01344 per hour**, excluding
  resource consumption and potential egress. Branches generated from
  tracked migrations lack real user data in this project and are not a
  source-data restore. Branching is **not spend-cap protected**.
- Extra Supabase project quoted **USD 10 per month**, before any
  extras related to matched CPU/compute configuration, storage/disk
  usage and egress. The paid `Restore to a new project` feature uses
  an existing physical backup, automatically clones Auth data and
  encryption root key, but **does not copy Storage file bytes or all
  non-DB settings**. It can reactivate inherited pg_cron/pg_net,
  triggers/webhooks and external integrations when the clone starts.
  Those must be independently reviewed and contained **before**
  authorizing a clone. Never click in-place `Restore` on Production.
- Running an isolated **local PostgreSQL 17** DB is the lowest
  recurring cloud-cost choice for the approximately 77 MiB source DB,
  but a complete, privately protected logical export is not yet
  available, and a bare database may lack the Supabase-managed
  roles/Auth/extensions and encryption root key. Cross-platform
  login/Reader/RLS end-to-end tests cannot be inferred from a
  table-only PostgreSQL replay. The local Windows preflight did
  **not** find an already available `docker`, `pg_dump`, `psql`
  or Supabase CLI on PATH (this is not an installation audit).
- Local Windows storage capacity inspection found **no single drive
  with 30.19 GB of current free space**; therefore copying all
  4,728 Storage objects as one uncompressed set is not presently
  practical without safe additional space or an approved partitioned
  encrypted destination. No local backup output or data was copied.

**Independent security issues in the original fingerprint:**
`pg_get_triggerdef` does not prove the trigger is enabled,
and `pg_get_expr` for a policy does not include its
permissive/restrictive flag. Original catalog hashes also omitted
function EXECUTE permissions, SECURITY DEFINER ownership, per-schema
USAGE/CREATE rights and relation owner/replication flags. The
fingerprint now **adds five security categories** without changing
the existing nine baseline-category definitions:

| Additional security category | Production count | SHA-256 |
| --- | ---: | --- |
| policy_admission_flags | 80 | `7168600734013637556c05d9e772567c58b0fc88df825c6f01aee6c3046d15f5` |
| trigger_activation_flags | 21 | `fddf15a8da94956b93dbecea2ba15eb6b39953be351bab59b194cb5b008c05fc` |
| function_execution_security | 66 | `04d613f2d0ade4a0424d1be5dbbf728c4ff99c88a0630ada63a4e7d272fdc157` |
| schema_usage_security | 2 | `96f0f6ee83fde2b32924833eee6baa5d0904b8422920258d9089c9135836b92b` |
| relation_ownership | 67 | `b076513ca39415bb051aed9b39c9fae416ae6c2ce09e31436636e958afc71176` |

Both checked-in PR #127 SQL files were **independently re-executed
against Production** as exact-source, `REPEATABLE READ READ ONLY`
transactions without error. This reports 2,277 direct recording
metadata references matched, 4,720 recording-audio object metadata
rows, zero missing direct metadata references, and 2,443 objects with
no *direct* recording row reference. The third-party or legacy
references for those 2,443 were **not resolved**, and no deletion
or direct Storage-object-byte download was authorized or completed.
Static CI checks now require the repeatable-read boundary and all
five additional security dimensions.

### Mandatory staged proof, with distinct acceptance levels

1. **Source and platform inspection (completed):** counts, source
   schema SHA-256, RLS/FK admission, recording-to-metadata
   relationships, actual DB size, project/org fee quotes.
   **Never label this 'backup verified'.**
2. **Backup and DB restore (NOT DONE):** inspect actual
   `Database > Backups` for this *specific* project and record a
   completed backup ID and UTC timestamp in a restricted audit note.
   Prefer a secured local logical backup/archive if obtaining a
   Supabase physical backup for download is not offered. Use an isolated
   matching PostgreSQL 17/Supabase environment with no Production
   secrets or outbound integration actions. Validate an actual archive
   checksum and restored row counts against the **export-time** source,
   plus all 14 schema/security fingerprint categories. Also inspect
   Auth and platform configuration separately: this fingerprint hashes
   `public` and `storage`, **not `auth`**, Vault key material,
   external Auth providers, Edge Functions or Storage bytes.
3. **Bounded Storage file sample (NOT DONE):** select a safe,
   authorized, low-size real source object; download bytes to a
   restricted local temporary destination, compute a local SHA-256
   hash, independently copy/restore to a second protected isolated
   destination, re-read **actual** bytes and compare SHA-256/length
   (not an ETag or a `storage.objects` metadata row). Check
   public/private retrieval authorization and delete the temporary
   sample only under explicit lifecycle agreement.
4. **Full Storage backup/restore (NOT DONE):** choose >=40 GB free
   encrypted local/external space or a separately approved secure
   cloud storage destination, including checksum/manifest overhead.
   Export and privately inventory **all 4,728** current object
   payloads across all buckets, preserving bucket/key mapping;
   hash check every byte stream, restore to a distinct isolated
   destination and re-read/hash check. Reconcile counts and bytes at
   the same recorded source snapshot, not from a later live database.
   Confirm 2,443 objects are not unilaterally classified as orphaned.
5. **Full app acceptance (NOT DONE):** synthetic authenticated
   ownership, R18/publication visibility, AI/Human provenance,
   TTS vs Human narration, public search, Reader and real supported
   audio playback without contacting Production from a cloned
   scheduler/worker. Test auth and Storage using fully isolated
   endpoints, not repointed Production keys. Approval and an auditable
   rollback path remain required before Cron #108 or Child84 closure.

**Administrative gate:** No backup restore, CLI dump, new paid
project/branch, Storage-object payload copy, key provisioning or
live user/Stripe/Auth mutation was performed in Child84j. Project-specific
backup timestamps must be obtained through the operator's authorized
Supabase Dashboard view or a read-only Management API token with a
confirmed retrieval path; never share PAT, DB credentials, JWTs,
full backup content or object keys in chat/GitHub/CI.

**Current decision:** SOURCE-ONLY EVIDENCE IMPROVED;
INDEPENDENT DB RESTORE = UNPROVEN; STORAGE BYTE RESTORE = UNPROVEN;
PR #108 CRON = NO-GO; Child84 NOT DONE / Child85 BLOCKED.
