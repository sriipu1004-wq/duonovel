# Issue #137 — PUBLIC origin cohort containment (nonproduction decision)

**Status: READ-ONLY EVIDENCE / NO LIVE MEDIA ACTION / MERGE HOLD.** Verified 2026-11-04 against hosted Supabase using the exact `BEGIN READ ONLY` / `ROLLBACK` query in [r0-public-origin-cohorts-readonly.sql](../scripts/issue137-b2/r0-public-origin-cohorts-readonly.sql). This is an Issue #137 / Draft PR #160 proposal, not a grant to delete, move, relabel rights or republish any file. Re-run inventory before a future approved operation.

## Public origin inventory

The `recording-audio` bucket remains **PUBLIC** and `human-recording-audio` is **PRIVATE** (zero objects). The query emits aggregates only; no raw object paths, owner IDs, user records or media bytes.

| Family | PUBLIC objects | Exactly referenced by `recordings` | No exact reference | JSON file names | No current series at path segment |
| --- | ---: | ---: | ---: | ---: | ---: |
| `aivis/` | 4,414 | 2,180 | 2,234 | 2,191 | 0 |
| `nemo/` | 300 | 97 | 203 | 113 | 45 |
| `human/` | 6 | 0 | 6 | 2 | 6 |
| **Total** | **4,720** | **2,277** | **2,443** | **2,306** | **51** |

**New finding — investigate, do not auto-delete:** the 45 `nemo/` objects without a matching current series or episode segment belong to **3 structural series segments / 16 series–episode segments**, include **16 JSON-named + 29 common audio-extension files**, and have **zero exact recording references**. The six known `human/` files similarly lack current series/episode rows and exact recording references, in 1 structural series / 2 episode scopes. These 51 are *detached-origin candidates*, not proof of unlawful publication or permission to remove content. The other 2,392 objects without an exact `recordings` reference have a current structural series segment; many may be essential timing sidecars, versions or supporting files. None is automatically redundant.

A missing current series is not evidence about historical ownership, narrator consent, licensing or whether a prior authorized publication existed. Matching a UUID or account is not a rights attestation. Data may change. Exact recording path matching is narrower than all indirect references and old URLs.

## Mechanism choice

- **DB private/R18, app cache clear or RLS alone:** necessary for logical withdrawal but does not stop direct PUBLIC bucket URLs.
- **Make the entire shared bucket PRIVATE:** disrupts 4,720 objects and 2,277 directly referenced public audio assets. **Not recommended** without a separate full-product migration decision.
- **Signed-token expiry or CDN-only purge:** cannot revoke a still-existing PUBLIC origin. Browser/downloaded copies can remain even after origin removal. **Not a physical stop.**
- **Preferred, separately approvable candidate:** exact per-object PRIVATE evidence escrow, full-byte SHA-256/restore validation, then exact original-key retirement via Storage API, with origin and cache verification. The existing [emergency retirement design](issue137-r0-emergency-public-media-retirement.md) and PR #160 synthetic three-file drill already test the core mechanics. Do not duplicate that work.

## Mandatory sequential gates before any later live action

1. **Classify one bounded scope:** affected work/episode and exact PUBLIC keys, associated timing JSON/old revisions, current and historical recording references, owner, edition/text rights, performer/audio rights, consent and retention obligations. For missing-source `nemo/` and `human/` cohorts, keep **separate RIGHTS_UNKNOWN holds** and do not infer approval from a path or current consent.
2. **Separate explicit approval:** identify exact bucket/object count/bytes and each intended DB/Storage effect, legal/rights decision, restoration plan, independent fixed-HEAD security/rights review, and user sign-off. Current permission covers only design and read-only metadata; not copying or removing real objects.
3. **Prevent new public writers:** require approved source PRIVATE+R18 logic and guard all privileged writers, static S3 keys, old signed bearers, TUS/multipart and alternate public buckets. The currently tested local session-S3 behavior does **not** prove static-key parity. A missed writer is **STOP**.
4. **Closed-world manifest:** paginate every object under the exact scope; compare sorted paths, sizes, versions and digests to the approved manifest, including unreferenced and JSON sidecars. Any extra/missing/changed file or ambiguous source: **MANIFEST_DRIFT_HOLD**. Keep raw names and evidence confidential.
5. **PRIVATE custody first:** copy exact approved bytes, check SHA-256 and lengths, prove anon/nonowner denial, test isolated PRIVATE restoration, and preserve an append-only journal. A copy does **not** block the original PUBLIC URL.
6. **Separate per-key physical retirement decision:** only after authorization use Storage API, verify old origin is absent, preserve DB/provenance references until separately reconciled, confirm unaffected public audio remains available, and verify CDN regions. Never use direct SQL object-metadata deletion or blanket bucket changes.
7. **Truthful outcome fields:** track `DB_PRIVATE`, `ORIGIN_ABSENT`, `PRIVATE_ESCROW_VERIFIED`, `CDN_UNVERIFIED`, `BROWSER_CACHE_NOT_RECALLABLE`, `RIGHTS_UNKNOWN`, and `REFERENCE_RECONCILIATION_HOLD` separately. Do not claim worldwide revocation from a local 404.

Supabase documentation: [public bucket access](https://supabase.com/docs/guides/storage/buckets/fundamentals) and [Smart CDN invalidation](https://supabase.com/docs/guides/storage/cdn/smart-cdn). Smart CDN updates may take up to 60 seconds when applicable; client caches and previously downloaded copies cannot be recalled.

## Completed vs blocked

The existing exact-HEAD PR #160 CI `41680579055` demonstrated disposable three-object PRIVATE backup, original removal, local old-URL denial, interrupted batch resume, unrelated public media preservation and byte-verified PRIVATE restore. This new phase added **metadata-only cohort discovery** and re-ran the saved read-only SQL successfully. No live audio, CDN path, user consent or object bytes were inspected or changed.

**Remaining:** rights and ownership of 51 detached candidates; unknown indirect references; hosted physical-object and cross-region CDN behavior; old bearer/static S3/TUS; historical migrations and full restore; #150 performance gate; independent security/DB/rights review. Draft PR #160, Production DB/Storage and rights changes remain **HOLD**. Further rights-record inspection or exact-key physical handling requires a new explicit scope/approval.
