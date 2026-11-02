# Issue #137 — G1 PRIVATE Reader integration: source-backed nonproduction candidate

Status: **DESIGN ONLY / Draft PR #153 / MERGE HOLD**, written 2026-11-02.  
Authorized: source review, offline model, isolated tests, candidate design.  
**Not authorized:** hosted DB/Storage, real rights changes, deployed/production Reader, permissions, credentials, billing, merge.

## 1. Actual baseline — do not confuse these gates

Code at Draft PR #153 HEAD when reviewed: `43b6aff806876e51539e60bafb2608e302cd60f6`.

| Operation | Actual app / local fixture | Proven / gap |
| --- | --- | --- |
| Human Studio entry | `src/lib/recording/recordingEntry.ts`: signed-in + `recording_permission_mode=open` | A third-party narrator **is intended to participate**; `author_id=actor_id` is prohibited as a blanket rule |
| Human finalize | `src/app/api/recordings/human-upload-finalize/route.ts`: author permission, RLS-visible episode, consent, publication if public, atomic recording updates | Legacy multipart uses privileged Storage fetches and no G1 TUS receipt |
| G1 temporary PRIVATE receipt/pointer | `scripts/issue137-b2/human-tus-private-pointer-local.sql`: original GoTrue session, narrator owner, open permission, public posted episode, R18 + age, physical SHA, lease revoke and CAS | **Disposable Docker fixture only**, 16 MiB max; can only attest a point-in-time object |
| Actual Human audio GET | `src/app/api/recordings/human-audio/[recordingId]/route.ts`: `is_public` separates public episode/R18 vs private narrator-ID access | Does **not** consult G1 lease, receipt, private-pointer version, original session or re-read stage SHA |
| Actual audio proxy | `src/lib/recording/privateMediaProxy.ts`: authorized caller hands object path to service_role Storage stream; no-store and range support | Response does not prove object immutability; separate release risk |
| Public Domain/edition | `docs/project-state.md`, `docs/decisions.md`: exact source, edition and rights evidence; Official is not automatically rightsChecked | `recording_permission_mode=open` and `author_id` **cannot certify copyright** |

No existing row or permission in Production was changed. The previous erroneous author-only condition was removed in LOCAL SQL and third-party GoTrue/Storage E2E passed at PR #153 HEAD `43b6aff806876e51539e60bafb2608e302cd60f6`.

## 2. Preserve the product: three distinct identities/states

- **Work author**: `series.author_id`; controls work narration permission where appropriate, not ownership of other users' audio.
- **Human narrator**: authenticated recording submitter / `reader_id`; owns the PRIVATE upload lease and their recording. Can differ from the author. A public posted work with narration OPEN allows legitimate third-party participation subject to safety and actual source-rights rules.
- **Playback viewer**: private draft = the narrator only. Released public Human recording = appropriately entitled visitor satisfying public publication/R18/rights constraints, not automatically the original narrator or author.

TTS/AI narration must remain a separate provenance and authorization track. Reader's Original/Bilingual/Translation modes and user translation/AI allowances are unrelated to Human narrator ownership.

## 3. Proposed integration phases — none may be silently deployed

### A. PRIVATE staging and narrator preview

1. Real SSR `getUser` and server-verifiable current GoTrue session are necessary; bind lease to the **narrator**, exact series/episode, consent version and current authority epoch. Do not use JWT user metadata as permission.
2. Check current `recording_permission_mode=open`, public work and posted/published episode **for non-authors**. Apply rating OR `sexual_r18` warning plus current R18 preference and age confirmation. Do not add `author_id=actor_id`.
3. Use PRIVATE-only TUS staging under a canonical unguessable object path and bounded TTL. The existing 16 MiB fixture is **not** proof that 1 GiB multipart/prod capacity works.
4. Trusted worker reads all physical object bytes; compare size/SHA-256 and provider object identity to server-issued expected values; CAS a single receipt and PRIVATE pointer. A pointer is not a `recordings.is_public` state.
5. A prospective private preview endpoint must re-check current narrator/session/consent/rights/R18/lease epoch and verify bytes. No public URL, signed-bearer escape, cross-user source, shared cache, unverified range responses or redirect to a privileged Storage key. No actual HTTP endpoint is implemented yet.

### B. PRIVATE persistence versus PUBLIC promotion

The ephemeral upload lease expires in approximately ten minutes; do **not** make it a permanent Reader entitlement. A later durable record must have separate owner+publication+revocation version and an authoritative exact source/edition rights assessment. The author OPEN flag is a *site participation preference*, not a full copyright-license or Public Domain proof. Decide valid source-rights/edition schema separately; do not infer it from an Official label.

A PUBLIC promotion requires fresh narrator consent, current work permission, public work/episode, legally applicable exact source/edition rights, content-rating/warnings, the verified audio's stable identity, and an atomic committed publish decision. The reader route must check the committed state + all current revocation epochs before returning **any** byte; unknown/conflicting data fail closed. Do not expose `PRIVATE_POINTER_ONLY` as `PUBLIC_READY`.

### C. Privileged writer, cache and retry exclusion (G2; NOT yet solved)

Existing server code uses a service-role key for the Storage proxy; Supabase's own docs confirm that service role bypasses Storage RLS. A trusted database CAS does not freeze object bytes or invalidate an already minted signed upload/download bearer. Signed URLs and CDN/browser caching can survive authority changes. The nonproduction test observed an actual service-role replacement of sealed object bytes and detected the drift only on subsequent readback.

A deployable proposal must enumerate **all** service-role, S3, signed upload, restore/CDN, public-bucket and old-client writer/read paths. Separate credential custody/exclusive writer boundaries or provider-supported immutability, revalidation before first byte/each range, and measurable revoke-vs-read/claim negative tests are mandatory. If physical mutability cannot be eliminated, preserve a conservative release HOLD; do not label SHA readback equivalent to exclusive custody.

Official references:
- https://supabase.com/docs/guides/storage/security/access-control
- https://supabase.com/docs/guides/storage/serving/downloads
- https://supabase.com/kb/troubleshooting/storage-private-bucket-files-still-accessible-after-remove-access-or-logout

## 4. Nonproduction acceptance matrix

| Actor / operation | Expected result |
| --- | --- |
| Different user narrates OPEN public posted work | PRIVATE staged/claimed by that narrator, never automatically public |
| Work author attempts other narrator's PRIVATE bytes | DENY |
| Anonymous or other viewer attempts narrator's PRIVATE bytes | DENY |
| Consent missing, stale session, CLOSED, private, draft, scheduled or unpublished | DENY |
| R18 rating OR sexual warning, OFF/unconfirmed | DENY |
| Same R18 actor with ON+confirmed age | Eligible PRIVATE stage if other checks pass |
| Consent/R18/permission revoked and later restored | Prior lease/receipt not revived (ABA); a fresh authorized lease is required |
| Provider object replaced after verification | DENY on detected digest/object mismatch; **privileged writer still a G2 blocker** |
| PUBLIC request without explicit verified rights/edition grant | HOLD regardless of `OPEN` |
| PUBLIC reader R18 unauthorized after publication | DENY even if narrator had permission previously |
| HTTP Range while verification cannot cover every byte | DENY until range-integrity scheme verified |
| Source/edition rights changed after publication | Invalidate published pointers and old URLs/CDN where feasible; not yet proven |

The source-backed **offline model** is `scripts/issue137-b2/private-reader-boundary-contract.test.mjs`. It tests domain cases and identifies current app integration gaps. It is not an HTTP E2E or proof of legal copyright. The previous disposable GoTrue/TUS E2E independently tests real PRIVATE staging and ownership.

## 5. Stop/release gates and next work

G1 has not been connected to the actual Reader route. A prior attempt to add a loopback HTTP delivery route was blocked by the tool's safety control, with no actionable root-cause diagnostic; do not bypass that gate or claim runtime delivery. The following remain unresolved: genuine source/edition rights evidence, the real committed private/public recording lifecycle, G2 exclusive provider writer control and old signed URLs, R18/owner/rights negative tests at a true HTTP boundary, precise concurrent revoke/stream races, legacy public URLs/CDN/restore, large-file capacity and #150 AbortError/p95.

**Until a stable release candidate is actually built:** PR #153 Draft / FIX / MERGE HOLD. Do not apply this fixture as a migration or modify hosted Supabase. At a genuine stable sensitive release candidate, obtain a separate fixed-HEAD security/rights review, exact owner merge approval, then separate hosted schema/Storage/rights authorization if needed.

Canonical operational authority: `AGENTS.md`, `PROJECT_MASTER.md`, `docs/project-state.md`, `docs/roadmap.md`, `docs/decisions.md`, `docs/development-workflow.md`, `docs/chat-operations.md`, `docs/response-status-protocol.md`. This candidate does not reorder or amend those documents.
