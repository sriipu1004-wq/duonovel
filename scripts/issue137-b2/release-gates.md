# Issue #137 B2 — FIX follow-up and Production HOLD (2026-10-29)

This is a SOURCE planning/checkpoint artifact, not a deployment instruction or authorization. Independent reviewer [FIX #6474270294](https://github.com/sriipu1004-wq/duonovel/pull/153#issuecomment-6474270294) is binding on its old frozen HEAD. No Production DB/Auth/RLS/Storage/media/rights/ads/Cron changes or merge were approved by this note.

## F1 — precise authorization guarantee, not instantaneous revocation

- Before projected R18 catalog or single-work metadata is returned, the author candidate checks the actual user's current `show_r18_content` and `r18_confirmed_at` from an uncached, privileged server-only DB read. An OFF/missing/failed profile read drops only R18 cards. No extra profile read is required for general-only cards. This recheck is after R18 enrichment and filtering and before the existing final catalog epoch verification.
- SOURCE regression tests simulate an initial ON classification followed by OFF, successful ON, missing user, and DB error. This tests the pure decision logic and source integration, **not actual Next.js HTML/RSC serialization, live profile change, or signed-in E2E**.
- The last preference/epoch check -> HTML/RSC serialization -> client stream remains a TOCTOU interval. Already sent HTTP bytes, previously downloaded public objects, and issued bearer/signed links cannot be retracted. No instantaneous same-request withdrawal or cancellation of ongoing streams is claimed. Session revocation during an in-flight request is separately unproven.
- A fresh users lookup adds one database round trip **only if R18 cards are about to be returned**. It may worsen R18 TTFB. The two catalog revision RPCs, singleton-row write lock, global cache errors, and historical PR #150 performance failure remain unmeasured release blockers. Benchmark without claiming an improvement.

## F2 — legacy Storage and authorization blockers

- Production currently has public `recording-audio`, private `human-recording-audio`, and no `r18-recording-audio`. Existing public URLs and CDN copies are **not** protected retroactively by proposed RLS/trigger SQL or private proxy code.
- The candidate SQL enumerates only known `nemo/{series}/{episode}`, `aivis/...`, `human/...` families in the existing public bucket. Paths in any other buckets, unknown/custom prefixes, data/metadata upserts and already served public bytes are **NOT** certified as safe by this candidate. The metadata UPDATE-only Storage trigger must not be described as an interception of all byte overwrite paths.
- Before a Production proposal, obtain **separately approved** aggregate classification/counts by storage bucket, path family and referenced/unreferenced state, without downloading or publishing private media. If individual object paths, owner identity, or media bytes are required, seek a distinct explicit scope authorization first. Unclassified records/URLs block media-related release; do not silently rename, delete, move or reclassify legacy objects.
- Isolated full-schema RLS/grant/function parity, owner/nonowner/anon denial, real Storage INSERT/UPDATE/upsert/metadata, reparent/concurrency and public CDN invalidation need direct negative-path evidence. A fixture approximating Production is not proof of parity.

## F4 — staged release decision record (currently NO-GO)

1. Fix/verify the candidate in an isolated Production-like schema plus synthetic Storage and signed-in Next/browser environment; test Work/Reader/Search, JA/EN/KO, three reading modes, Human/AI/TTS, Range 200/206/416, timing and preference OFF, including stale clients.
2. Gather authorized exact preflight counts and references for every affected table, R18/public recording cohort, buckets/path families and potentially exposed old URLs. No assumed numbers; historical aggregates are not a current inventory.
3. Independently verify a restorable full DB **and Storage object bytes** backup. A database-only automated backup cannot replace object recovery. Record retention, restore time and return-to-service test evidence.
4. Before choosing a deployment order, prove compatibility of **both** old application + candidate DB and candidate application + old DB. App-first can fail without the new bucket/RLS; DB-first can block legacy writes or break old readers and does not revoke public URLs. Current evidence supports **neither order**. Use a distinct explicit owner-approved staging/rollback plan if compatibility is demonstrated.
5. Define numeric p50/p95/p99, 5xx, cache timeout, SQL lock-wait/write-latency and media failure stop thresholds only after collecting a representative baseline and sample/denominator. No invented thresholds or fabricated Production E2E. Recheck PR #150 performance gate separately.
6. Any Production change requires separate approval spelling out target objects/tables, exact counts, before/after effects, recovery procedure and permitted irreversible actions; a PR merge approval alone does not authorize database or media mutations. Rollback may not broaden R18/public visibility to recover availability.

**STOP:** Until these independently verified gates and explicit approvals, keep PR #153 Draft/unmerged; no hosted migration, Storage move/delete, R18 policy changes, Production rollout, or automatic start of another Issue. A future author HEAD requires same-HEAD CI/Preview and a new distinct reviewer GO/FIX/NO-GO; the old FIX is not lifted by this document.
