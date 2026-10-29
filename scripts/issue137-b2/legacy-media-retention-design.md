# Issue #137 B2 — legacy public audio retention and containment (SOURCE DESIGN ONLY)

Owner approval: 2026-10-29, limited to F2 source-only decision design for existing Issue #137 / Draft PR #153. This is NOT executable and does NOT grant Production reads/writes, migration, file moves/deletions, rights changes, private/public changes, deployment, or merge. Independent review on the earlier frozen HEAD remains FIX / MERGE HOLD ([review #6474270294](https://github.com/sriipu1004-wq/duonovel/pull/153#issuecomment-6474270294)).

Source baseline before this documentation commit: PR HEAD 3fea3656a9a9969f6ec8c01a4ddf4e6df198b764; main 74c816edf22446bf0668d01d1164e1780d7f6899. Production aggregate evidence: [two-way inventory #6475111309](https://github.com/sriipu1004-wq/duonovel/pull/153#issuecomment-6475111309) and [metadata survey #6475249175](https://github.com/sriipu1004-wq/duonovel/pull/153#issuecomment-6475249175). Point-in-time metadata, not a verified media-byte inventory or consent/rights ledger.

## 1. Inventory that can be used for decisions

- Public recording-audio bucket: 4,720 objects. 2,277 present recordings rows point to existing public WAV objects; paired timing JSON accounts for another 2,277, totaling 4,554 currently associated objects. This linkage alone does not validate rights, audio integrity or ability to restore.
- Additional 166 objects: 133 WAV, 27 timing JSON, 6 Human-prefix media/timing. All recorded April 2026 UTC as both creation and last-update month. Metadata size sum ~1,886 MiB / 1.84 GiB, not proven reclaimable space; no last-access measurements.
- Cohort A, 115 objects: existing general-public series and posted/published episode IDs in the object path, but no current recording-row pointer to their WAV. Aivis 43 WAV + 11 timing; Nemo 61 WAV.
- Cohort B, 51 objects: current work/episode for path IDs not found. Nemo 29 WAV + 16 timing; Human 4 media (2 M4A, 2 WebM) + 2 timing. The Human timing has no exact-stem WAV/M4A/WebM counterpart by the tested convention. This does not rule out an alternate legacy relation or a rights/retention obligation.
- The 51 already INCLUDE the Human 6, not 51+6. Current private human-recording-audio bucket has zero objects. Future private r18-recording-audio bucket is absent from Production.
- All 166 still reside under a PUBLIC bucket; SQL-RLS-only restrictions, a future private proxy or a new bucket do NOT retroactively revoke old URLs, CDN objects or previously downloaded bytes.

## 2. Provisional non-destructive decision matrix

The only CURRENT disposition for all 166 is HOLD_EXISTING_BYTES_AND_VISIBILITY: no edits, moves, ACL/metadata changes or deletion. Logical triage/hold is not the same as changing public access; no one is authorized to manipulate the objects. Every group below is unverified for removal or republication.

| Group | Count | Current linkage | Evidence priority / gate | Not established |
| --- | ---: | --- | --- | --- |
| Aivis WAV, public work/episode | 43 | Work/episode yes; recording pointer no | Check historical generation versions, alternate players, rights and ownership before any disposition | Duplicate/unused |
| Aivis timing for unreferenced WAV | 11 | Matching WAV exists, no current recording link | Treat audio+timing as a unit, examine alternate timing use | Garbage metadata |
| Nemo WAV, public work/episode | 61 | Work/episode yes; recording pointer no | Check retry/re-generation, narrator version, alternate consumers and permissions | Safe public or deletable |
| Nemo WAV, missing work/episode | 29 | Current work and episode not found | Higher-priority private/public, publication-history, backup/retention/rights investigation | Confirmed leak or lawful delete |
| Nemo timing, missing work/episode | 16 | Matching no-recording WAV exists, source missing | Examine pairing and legacy content without assuming bytes/no use | Independent deletion target |
| Human M4A/WebM, missing work/episode | 4 | No present recording/work/episode link | Independently verify human narrator consent, attribution, authorized public use, legal retention | AI/TTS or permitted publication |
| Human timing, missing work/episode | 2 | No tested exact-stem match | Alternate legacy manifest link/consent check, do not transform into AI | Orphan proved |
| Current WAV + timing recording pairs | 4,554 | 2,277 current recording references | Keep service; verify authorization, E2E and recovery separately | Fully rights-cleared / restored |

Review priority is not mutation priority: investigate missing-series cohort 51 and Human 6 first; do NOT delete/relocate/privatize them under this design.

## 3. SOURCE findings that explain why naive cleanup is unsafe

1. src/lib/recording/nemoGeneration.ts: uploads audio WAV and timing via upsert:true before writeRecording. Updating a primary recording row and deleting duplicate recording rows can change DB pointers. removePreviousRecordingArtifactsIfNeeded / removeRecordingArtifactUrls use Storage .remove on older derived paths after successful writes. On error, the catch unconditionally invokes removeStorageObjectPaths on the attempted audio/timing paths.
2. src/lib/recording/aivisGeneration.ts: also writes audio/timing with upsert:true before writeRecording and calls Storage .remove(currentObjectPaths) on error. It can update an existing recording row for the same model/narrator.
3. **Plausible but NOT demonstrated hazard:** a failed re-generation touching an already existing key could overwrite the old bytes and then remove that very key during error cleanup. The source review establishes a potential race/rollback problem, NOT a measured loss of the 166 objects or a root cause of their existence.
4. src/lib/recording/nemoTiming.ts maps WAV to timing.json; timing manifests can contain generated audio URLs, so the direct recording pointer graph is only part of the reference graph. Human M4A/WebM pairing is not captured by the WAV-only convention.
5. src/lib/recording/humanRecordingState.ts distinguishes Human by narrator identity/path/model provenance. src/app/api/recordings/human-audio/[recordingId]/route.ts validates a DB recording then streams an authorized private-bucket object. It does not protect old public-bucket Human links. Do not relabel Human as synthetic speech, and never assert rights from a human/ prefix.
6. src/app/api/recordings/ai-audio/[recordingId]/route.ts gates current DB/R18/episode state and streams from a private bucket; it does not contain historic public Storage URLs. The draft supabase/migrations/20261026120000_issue137_b2_r18_boundary.sql only handles known prefix families and proposed triggers; full Production policy graph and byte-upsert/metadata operations are untested.
7. docs/child84-backup-and-storage-recovery.md is a restoration runbook, not independently verified database AND Storage-byte recovery. Database backup metadata cannot restore missing object bytes.

## 4. Candidate future write-path design, not authorized to implement yet

- Prefer a unique immutable object key per generation instead of upsert:true on a stable shared key. Pair audio and timing with an explicit generation identity and declared AI-vs-Human provenance.
- Validate writer entitlement, episode/publication/R18 state and private/public bucket before upload. Only switch the recording pointer once the bytes and timing are verified; Storage upload and Postgres update are NOT atomic, so model retry/rollback and stale-object retention explicitly.
- Never remove a key if it could have been present before this attempt. If allocation/provenance is uncertain, preserve it and record sanitized bounded diagnostics. CAS/version-controlled pointer updates and concurrency-safe idempotence are design candidates, not implemented.
- Never automatically purge legacy media or enable Cron. A future retention worker needs its own scoped approval, an independent code/rights review, exact object cohorts, secure manifests, independently tested DB+object-byte backup and restore, and a rollback preserving R18/private access rules.
- Do not make R18/general, author/reader, private/public, Human/AI/TTS, language or rights status more permissive as an availability workaround. A removal from a public bucket cannot retract previously cached/downloaded URLs.

## 5. Future negative-case evidence gates (not executed under this scope)

- Existing public key, upload retry failure, success-audio/fail-timing, success-Storage/fail-DB, concurrent Nemo/Aivis same episode, pointer version conflict, duplicate recording replacement, old URL re-use, stale CDN, canceled/revoked authorization, moved/deleted series, alternate manifests, Human rights withdrawal, and exact media byte restore.
- Independently reproduce in an isolated Production-like schema using synthetic accounts: anon, OFF, unconfirmed, ON, owner and nonowner; Reader/Work/Search in JA/EN/KO and 3 Reader modes; Human vs AI vs TTS, Range 200/206/416, timing and metadata. Record unsupported/failed cases, not fake PASS.
- Measure p50/p95/p99, error-denominators and DB/Storage write-lock cost, then separately close PR #150 performance gate. Confirm old-app/new-DB and new-app/old-DB compatibility. Do not assume GREEN CI/READY Preview equals Production assurance.
- Before future Production object-level investigation or mutation: obtain user approval specifying targeted rows/object counts, metadata visibility, rights/owner proof, backup+rollback, affected clients/CDN and independently reviewed fixed PR HEAD. No secret/object names/media content in public PR discussions.

## 6. Stop condition and canonical boundaries

This document is the only proposed write in this approved phase. No new implementation, new Issue, CI manual rerun, Preview redeploy, Production SELECT, schema/Storage change, media byte fetch or merge is authorized. Keep #153 Draft / independent FIX / MERGE HOLD, F2 unresolved and F4 NO-GO. Canonical docs/roadmap.md priority is unchanged; work evidence remains in Issue #137 and PR #153.

## F2-P isolated unknown-bucket negative control (2026-10-30; nonproduction)

This addendum records a new owner-authorized **SOURCE and disposable local test phase** for Issue #137 / Draft PR #153. It does not update the historical 2026-10-29 Production aggregate counts above; **166 orphan/unlinked objects, 6 Human items, and 4,720 public-bucket objects are historical survey evidence, NOT current Production counts**. No hosted SQL, Storage object enumeration, bytes, path list, user identity, release, permission, or rights update is authorized.

**SOURCE routing:** B2's \`libread_internal.public_audio_exists_for_series/episode\` checks only \`storage.objects.bucket_id='recording-audio'\` and known \`nemo/\`, \`aivis/\`, \`human/\` path families. The \`guard_public_storage_audio\` trigger on \`storage.objects\` bypasses any bucket other than \`recording-audio\`. This neither proves that any other live bucket is public, nor inventories previously copied or cached bytes. The F2 private-Human check confirms only an exact private counterpart and same-path conflict in \`recording-audio\`; it is not an all-bucket legacy exposure inventory.

**Reproducer:** \`scripts/issue137-b2/e2e.mjs\` uses only its newly created, unlinked loopback-local Supabase stack and synthetic R18 series. It asserts (1) unknown-prefix upload to monitored \`recording-audio\` is rejected; (2) creating a second **synthetic** public bucket and uploading the same unknown-prefix synthetic object succeeds; (3) anonymous row reads for R18 are denied while the synthetic direct public Storage URL returns HTTP 200; (4) changing the R18 series to private still succeeds because its recording ref uses a private path and the alternate public bucket is not inventoried; and (5) anonymous DB recording reads stay denied but direct public Storage URL still returns HTTP 200. A pass **confirms a local modeled containment gap**, not release GO, an actual live leak, or guaranteed CDN revocation. The disposable runner verifies local containers/network/workspace cleanup. Any failure must be investigated with raw Actions job logs.

**Risk boundaries:** An existing public object in the named main public bucket may also use an unrecognized historical prefix; no migration automatically makes those files private or deletes browser/CDN copies. Historical bytes may exist outside any current \`recordings\` row. Unknown private/public buckets, external mirrors and stale URLs must remain **UNCLASSIFIED / RELEASE HOLD** unless a separately approved metadata inventory and rights/retention review proves their disposition. Never bulk-move or delete based on a syntactic prefix, and never claim a source-level negative control establishes Production counts or byte recovery.

**F2-P decision:** keep the existing published-bucket policy unchanged in this phase. A future Production audit must first secure separately authorized bounded metadata counts and exact classification logic across **all** buckets, including named/unnamed legacy prefixes and referenced/unreferenced status, while withholding object paths and private media. Data movement, ACL changes, CDN controls, new RLS policies, and retention decisions require further explicit approval and independent security/rights review. PR #153 remains Draft / FIX / MERGE HOLD. F1/F3/F4 and #150 performance remain open.

## F2-P next-step candidate: future PUBLIC bucket uploads and SQLSTATE probe (2026-10-30)

**Scope:** Owner approved F2-P unmonitored public-bucket containment and HTTP 500 nonproduction design/isolated tests. This is an unmerged, unapplied candidate in Draft PR #153. No hosted SQL (including SELECT), Storage object listing, object bytes, rights/ownership decision, ACL or release action is authorized.

**Candidate future-only behavior:** B2's storage.objects INSERT / UPDATE of bucket_id, name or metadata inspects every PUBLIC bucket. The original recording-audio known-prefix checks remain intact for general narration. On an alternate PUBLIC bucket, a new path with a recognized nemo/aivis/human family, audio-like extension, or metadata mimetype audio/* is denied; ordinary public text/image storage is not intentionally blocked, and private buckets remain out of scope. Existing public objects, byte-only upserts that avoid a metadata UPDATE, unknown extensions plus false content types, S3/other providers, and any PUBLIC bucket creation or PRIVATE→PUBLIC toggle remain **outside this guarantee**. The changes do NOT establish full media containment, revoke URLs or prove rollout compatibility; Production bucket-by-bucket impact assessment is still mandatory.

**HTTP 500 hypothesis:** The local Storage API mapped SQL trigger rejection SQLSTATE 23514 to 500. For only the unclassified-prefix and new alternate-public-audio denial, the candidate changes SQLSTATE to 42501 and uses a separately logged isolated actual Storage API request to determine status mapping. A PostgreSQL/PostgREST status mapping is NOT evidence of the Storage gateway behavior. If Storage still returns 500, keep API/error-semantic gate BLOCKED rather than misreporting it as a resolved 4xx. Do not translate internal Storage errors in the browser by pretending an unsafe upload succeeded.

**Executable negative/positive controls:** In the disposable loopback-only B2 harness, a synthetic alternate PUBLIC bucket must reject unknown-path audio and a nemo-family audio path; an ordinary text file in that bucket must still upload and be directly retrievable; the denied audio must not be retrievable; R18 DB row must remain hidden from anon, and unpublishing must preserve DB denial. No pre-existing public URL/CDN bytes are touched or tested. A previous exact-head test proved a direct public legacy URL stayed available when the alternate bucket was not guarded; this new test covers only *future* writes, not remediation of that legacy exposure.

**Release stop:** Even a passing local test is not a full approval: the unpublished B2/H1 migrations, preexisting 166 historical unlinked objects (NOT fresh counts), rights/provenance, legacy URL/CDN, native signed-in Next.js E2E, DB+Storage byte backup, old/new compatibility, rollback, PR #150 performance and independent release security review are unresolved. Do not modify PUBLIC/PRIVATE production bucket settings or delete/move historic media to improve test metrics.

## F2-P further negative controls — bucket promotion and independent path/MIME predicates

The authorized isolated test now distinguishes (a) audio MIME with a totally opaque path, and (b) known Nemo path with deliberately non-audio MIME/extension; both future writes must be rejected. More importantly, a synthetic PRIVATE bucket already containing audio is changed to PUBLIC using the actual local Storage bucket API. The old object then has a direct anonymous PUBLIC URL even though future audio writes are blocked by a storage.objects trigger. This documents a **second mandatory F2-P release FIX**: publicity changes must be governed and media provenance inventoried, not simply new INSERT/metadata checks. The test runs only on an unlinked disposable local stack. It is not evidence that any Production bucket was promoted or exposed; no hosted bucket settings were read or changed.

**No policy bypass permitted in Production:** do not flip any existing bucket, broad-deny all public objects, or infer that text MIME guarantees the bytes are safe. True all-path/byte-level containment requires an approved inventory, trusted upload paths and appropriately restricted Storage governance plus independent review. Historical public/CDN bytes are still outside revocation.

## F2-P private bucket publicity and object metadata races — candidate (2026-10-30)

Owner-approved **nonproduction, unapplied** B2 SQL, synthetic local tests and docs on Draft #153. The storage.buckets BEFORE trigger protects both reserved private audio buckets from becoming PUBLIC or being renamed. Other PRIVATE→PUBLIC transitions are refused when any object already exists, regardless of its MIME or extension; an empty unrelated bucket can become PUBLIC and accept nonaudio text. This holds unknown/disguised private bytes without asserting rights or auto-removing any media.

The storage.objects metadata-write trigger obtains FOR SHARE on the destination bucket row before using its PUBLIC state. This conflicts with the row lock taken by a concurrent bucket UPDATE; a new metadata write and publicity change cannot both commit based on stale private/public state. Two real PostgreSQL-session lock-timeout tests (55P03 in both directions) must substantiate this ordering, plus a subsequent nonempty promotion denial. Publication decisions require separately approved Production inventories, rights review, byte-level restore, compatibility and independent security review.

Scope limitations: DML trigger cannot revoke previously served URL/CDN/browser bytes; it does not intercept external mirrors, raw byte mutations without metadata DML, false content types of files uploaded **after** empty bucket promotion, or all relevant provider operations. No hosted SQL/Storage/account data or Production permission/policy change was authorized or performed. PR #153 remains FIX/MERGE HOLD.
