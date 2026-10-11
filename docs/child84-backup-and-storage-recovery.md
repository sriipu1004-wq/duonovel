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
database at the same snapshot. Execute as one `BEGIN READ ONLY`
transaction, never through a user/anon Data API token.

The script fails closed if a critical relation or foreign key is missing,
sensitive RLS is disabled, prohibited Human translation/private table
SELECT grants exist, or episode/recording parent references are broken.
It emits only aggregate totals and a check of database-held recording
references versus `storage.objects` metadata. It does **not** reveal
owner IDs, paths, user-supplied text or private object names.

**Production source baseline (read-only execution):**
the *exact source* SQL blob `a3bb683a015dac853c61793bf4f4b288df78bb05`
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
(blob `51ec10f6dd8a66c2d065a2a36dd598eef78235c1`)
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
