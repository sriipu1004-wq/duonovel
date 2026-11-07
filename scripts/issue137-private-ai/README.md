# Issue #137 1-2 — AI narration bytes written by the official account's own JWT (NONPRODUCTION)

**Status:** design proof on a disposable local Supabase stack. Not a migration, not wired into the app, not applied to the hosted project.

## Idea
AI narration (Nemo/Aivis) is generated only by the official narration account (`src/lib/auth/officialNarrationAccount.ts`). Instead of uploading audio with the RLS-bypassing service/secret key, the server uploads with **that user's own session JWT**, and a provider-supported **Storage RLS policy** (`policy-candidate.sql`) decides:

- bucket `ai-narration-private` is **private**, MIME-restricted (`audio/wav`, `application/json`), 100 MB cap;
- `INSERT` allowed only when the caller's uid is **enrolled** in the service-role-only allowlist `public.ai_narration_official_writers` (checked through the `security definer` function `public.is_ai_narration_official_writer()`) **and** the JWT email is the official account, the path starts with `nemo/` or `aivis/`, and the object owner is the caller. The email claim alone is not trusted: an old JWT outlives an email change, and a deleted/re-created account or an email moved to another uid would otherwise inherit the right. Allowlist rows cascade-delete with the auth user;
- the script is one transaction; an existing bucket is **converged** to private + limits and the transaction aborts unless that holds;
- **no** `SELECT`/`UPDATE`/`DELETE` policy for user roles: no overwrite, no removal, no direct read; playback stays behind the server-side access-checked proxy (Draft #160).

## Evidence (`local-jwt-writer.test.mjs`, LOCAL)
5 positive / 13 denied, run twice (idempotent): a pre-existing PUBLIC bucket converges to private; the official email with an un-enrolled uid is refused; official nemo/aivis writes succeed and bytes are intact; outside-prefix path, disallowed MIME, overwrite, delete, other user, anon, an enrolled uid without the official email, direct reads, and any user write to the PUBLIC `recording-audio` bucket are refused; an SQL insert as the official JWT with **another user's `owner_id`** is refused while the same insert with its own `owner_id` succeeds (positive control).

Mutation check (2026-11-07, LOCAL): removing the owner, allowlist, email or folder condition, or reverting the bucket upsert to `do nothing`, each makes the test fail.

## Hosted read-only pre-check (2026-11-07)
`pg_policies` on hosted `storage.objects` (read-only): 5 policies, every one restricted to its own bucket (`illustrations` ×4, `bgm-library` ×1). No bucket-unrestricted permissive policy exists that would also apply to `ai-narration-private`. Re-check immediately before any approved apply.

## Enrollment (separate owner-approved step, not in Git)
After the SQL is applied, enroll the official narration account once with the service role / SQL editor: `insert into public.ai_narration_official_writers (user_id) values ('<official auth uid>');`. No account id is committed to this repository.

## Not solved here
- Existing PUBLIC objects (4,720) and their URLs; CDN copies.
- The service/secret key still bypasses RLS; this removes it from the **AI audio write path**, it does not restrict the key itself.
- App integration (generation routes pass the caller's session client; playback proxy for GENERAL private audio) belongs to the #160 split (roadmap 1-3).
- Hosted bucket/table/function/policy creation and the enrollment need separate owner approval and independent review.
- App side `src/lib/auth/officialNarrationAccount.ts` still identifies the account by email; aligning it with the uid allowlist belongs to the app integration step.
