# Issue #137 / Draft PR #153 — AI/Human Storage paths and PUBLIC-HOLD preservation (nonproduction only)

Date: 2026-10-31. Approved scope: **tests/fixture/CI/source evidence ONLY** for Nemo, Aivis and Human narration privileged Storage paths; no modifications to application release logic, Production settings, secrets, Storage ACL, SQL migration, deployed data or merge.

## Source-grounded path inventory

| Source | Actor / operation | Target and public decision | Separate risk |
|---|---|---|---|
| `src/lib/recording/nemoGeneration.ts` | `createAdminClient`; `.upload(audioObjectPath)`, `.upload(timingObjectPath)`, privileged `.remove()` of older artifacts | `mustUsePrivateAiAudio(seriesId)`: R18 → `r18-recording-audio` PRIVATE, otherwise configured `NEXT_PUBLIC_SUPABASE_RECORDING_BUCKET` or `recording-audio` with `getPublicUrl`. Guard `isPublicCandidate: !protectedR18` called BEFORE first upload. | With `LIBREAD_F2P_MEDIA_WRITER_MODE` unset, `LEGACY_UNCHANGED_NOT_APPROVED` is returned and old PUBLIC behavior persists. A privileged bypassing SDK/S3 client is not controlled by TypeScript guard. |
| `src/lib/recording/aivisGeneration.ts` | `createAdminClient`, same audio+timing Storage writes and cleanup | Same `mustUsePrivateAiAudio` split, guard before first upload. | Separate automatic regeneration/cleanup outside final writer guard. |
| `src/lib/recording/humanRecordingPublish.ts` | `createAdminClient`; original, playback, timing `.upload`, old object cleanup | Bucket from `getHumanRecordingAudioBucketName()`: `SUPABASE_HUMAN_RECORDING_BUCKET` override, else `human-recording-audio`; guard `isPublicCandidate: isPublic` before **final** three uploads. | The bucket's deployed privacy is not proven by its name. Human signed temporary uploads occur earlier, outside the final publisher guard. |
| `src/lib/recording/nemoAutoGeneration.ts` | Calls `generateNemoRecordingForEpisode` with privileged admin | Indirect invocation of same final writer | Automatic job identity and environment require separate live confirmation; no dedicated new PUT implementation evidenced. |
| `src/lib/recording/aivisAutoGeneration.ts` | Calls `generateAivisRecordingForEpisode`, uses privileged `removeStorageObjectPaths` | Indirect final PUT plus independent stale-object DELETE | Preview final-upload HOLD is **not** a deletion guard. |
| `src/app/api/recordings/human-upload-session/route.ts` → `RecordingStudioPage.tsx` | Service-role `createSignedUploadUrl(...,{upsert:true})`, browser `uploadToSignedUrl` | Temporary multipart objects, not final publication | Signed token issuance/overwrite cannot be proven safe by final publication HOLD. |
| `src/app/api/recordings/human-upload-finalize/route.ts` | Service-role reads and `remove(tempObjectPaths)` | Finalize + independent temp cleanup | Cleanup authority, stale session/consent, and same-key behavior remain release blockers. |

The BGM source/write paths and illustrations are **other object classes** and not tested as if they were narration writers. Old PUBLIC URLs/CDN copies are not remediated.

## Exact test evidence and limits

`scripts/issue137-b2/writer-path-private-preservation-e2e.mjs` imports the **real app** `checkNonproductionMediaWriterBoundary` (not a reimplemented mock). In the disposable localhost-only Supabase Storage container it creates **two synthetic PRIVATE buckets** and runs a representative transport for three writer classes:

1. In explicit `VERCEL_ENV=preview` and `LIBREAD_F2P_MEDIA_WRITER_MODE=preview-hold`, each PUBLIC candidate raises `F2P_PREVIEW_PUBLIC_MEDIA_HOLD` before any upload callback; a random public-object probe remains unavailable to anonymous GET.
2. For the PRIVATE candidate, representative synthetic audio/timing objects are actually POSTed with the disposable local service-role identity (mirroring existing legacy publisher privilege), then byte-for-byte SHA-256 verified through PRIVATE Storage GET. Anonymous public-route GETs must fail. Nemo 2, Aivis 2, Human 3 = **7 PRIVATE objects**. Private objects remain unchanged after another blocked PUBLIC attempt.
3. Preview-only HOLD with `VERCEL_ENV=production` must throw, rather than silently enable this experiment outside Preview. Existing `public-media-writer-bridge.test.ts` covers explicit/unset flags and source ordering.

The test harness **does not invoke actual Nemo/Aivis synthesis, Human transcoding, final DB publication, actual signed multipart browser uploads, R18 ownership/consent checks, Preview env deployment flags, any actual Production writer, or signed S3 PUT**. It uses real Storage locally but **does not prove the application production path is safe**. The local privileged credential can still bypass RLS and write PUBLIC directly, as separately reproduced in `s3-byte-path-e2e.mjs`. Failures must keep PR #153 on **FIX / MERGE HOLD**; CI success is not independent security GO.

## Stop conditions

- No actual/public/prod PUT, no hosted DB/Storage/ACL/key writes and no migration.
- Do not change source app publishers, signed-upload session implementation or runtime environment variables in this approved test-only phase.
- Unknown privileged credential holders, missing H1/H2/F1–F4 controls, full byte immutability, existing public references, independent R18/Human rights/ownership review and managed backup restoration remain release HOLD.
- Fixed-head independent S2/S3/S4 assessment is required if a security-sensitive change later reaches the release gate; no independent reviewer is claimed here.
