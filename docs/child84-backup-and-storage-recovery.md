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

## 2026-10-12 Child84k final operator disposition — managed backup only

**Status: CHILD84K CLOSED — USER-ACCEPTED DEFERRAL; INDEPENDENT RESTORE UNVERIFIED.**

User instruction, quoted verbatim in the child completion report:

> 別に一旦supabaseのバックアップのみでいいと思う。これで終わりでいい。ユーザーがこういってるってのも報告文に記入よろしく

Child84k reviewed an authenticated Supabase Dashboard screenshot and reported project-specific existing backup records, multiple generations, latest visible backup **2026-10-10 19:54:54 UTC**, type **PHYSICAL**, plus a visible Supabase restoration interface. No actual backup ID, archive bytes, integrity checksum or successful restore was exported or proven by the parent. The source-only PR #127 SQL/CI work and one 143,600-byte public object read/copy/SHA-256 comparison are preserved as *limited evidence*, not as an independent restoration.

**Operator-accepted temporary operating model:**
1. Continue relying on the existing Supabase-managed **database** backups.
2. Do not run independent database export/restore or full 4,728-object / ~30.19 GB Storage byte backup/restore as part of the closed Child84k.
3. Do not provision paid projects, branches or third-party backup infrastructure, transfer all Storage bytes or repeatedly seek dashboard details without a newly authorized scope.
4. Preserve awareness that Storage **file payloads are not covered** by database backup; database metadata recovery could leave audio or image files missing.
5. Do not treat an available PHYSICAL backup entry or visible Restore button as proof of successfully restored data, users, rights permissions, RLS, private media or application operation.
6. Maintain PR #108 Cron and other high-risk irreversible release gates until independently satisfied or explicitly redecided under their own risk assessment. This user decision alone does not make Child84 DONE or unblock Child85.

**No new changes:** No Production database/Storage/Auth/Stripe writes, file transfers, extra resource charges or restoration were made to establish this disposition. The remaining PR #127 audit source can be archived unmerged and reopened only on new authorization. Roadmap priority is unchanged.

