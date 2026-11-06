# Issue #137 1-2 — AI narration bytes written by the official account's own JWT (NONPRODUCTION)

**Status:** design proof on a disposable local Supabase stack. Not a migration, not wired into the app, not applied to the hosted project.

## Idea
AI narration (Nemo/Aivis) is generated only by the official narration account (`src/lib/auth/officialNarrationAccount.ts`). Instead of uploading audio with the RLS-bypassing service/secret key, the server uploads with **that user's own session JWT**, and a provider-supported **Storage RLS policy** (`policy-candidate.sql`) decides:

- bucket `ai-narration-private` is **private**, MIME-restricted (`audio/wav`, `application/json`), 100 MB cap;
- `INSERT` allowed only when the JWT email is the official account, the path starts with `nemo/` or `aivis/`, and the object owner is the caller;
- **no** `SELECT`/`UPDATE`/`DELETE` policy for user roles: no overwrite, no removal, no direct read; playback stays behind the server-side access-checked proxy (Draft #160).

## Evidence (`local-jwt-writer.test.mjs`, LOCAL)
4 positive / 11 denied: official nemo/aivis writes succeed and bytes are intact; outside-prefix path, disallowed MIME, overwrite, delete, other user, anon, direct reads, and any user write to the PUBLIC `recording-audio` bucket are refused. Negative controls: without the policy the official write fails; removing the email condition lets another user write and the test fails.

## Not solved here
- Existing PUBLIC objects (4,720) and their URLs; CDN copies.
- The service/secret key still bypasses RLS; this removes it from the **AI audio write path**, it does not restrict the key itself.
- App integration (generation routes pass the caller's session client; playback proxy for GENERAL private audio) belongs to the #160 split (roadmap 1-3).
- Hosted bucket/policy creation needs separate owner approval and independent review.
