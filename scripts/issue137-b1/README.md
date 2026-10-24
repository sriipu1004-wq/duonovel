# Issue #137 B1 — Isolated Auth / PostgREST / Storage R18 contract proof

**Owner-approved test-only phase.** Product policy B means R18 must be protected across Data API, app and Storage, not only invisible in UI. This directory is a **runnable synthetic prototype** of the future DB/Storage contract. It is NOT a migration and is deliberately excluded from `supabase/migrations` so it cannot be deployed through the ordinary project migrations.

## Run, requirements and safety gate

Requires a trusted machine or approved CI runner with **Docker**, Bash, Node 20+, enough RAM/disk for a fresh Supabase stack and network access for initial npm/container downloads.

```bash
bash scripts/issue137-b1/run-local.sh
```

The runner pins `supabase@2.122.0`, initializes an entirely new `mktemp` local Supabase workspace, copies **only** `fixture.sql` into that workspace's migrations folder, runs the local GoTrue Auth, PostgREST and Storage stack, reads **generated local credentials** from `supabase status --output env`, executes `e2e.mjs`, then stops/deletes only the temporary workspace. Do not run `supabase link`, `db push`, `db reset --linked`, or inject hosted Supabase secrets. The Node test refuses non-local HTTP endpoints and unexpected API ports. No actual user identity, production table or Storage item is read or modified.

**Important execution blocker:** At preparation time the authorized connected Windows machine lacked both Docker and Supabase CLI; the assistant container also had no Docker. Hence **a successful real Auth/PostgREST/Storage E2E is not yet evidenced**. The scripts are implemented, but E2E remains PENDING unless an actual test log later demonstrates successful execution. No new hosted Supabase branch/project was provisioned. No GitHub-hosted test workflow is auto-triggered by this package and no paid runner or billing setting is enabled.

## Dynamic acceptance matrix — when executed

- GoTrue **admin-creates five synthetic users** using only a local service key and signs each in with a password. The returned *real locally signed* JWT and user ID must agree. This is **not** a forged `request.jwt.claim.sub` PostgreSQL mock.
- Auth conditions: anonymous, signed-in age-unconfirmed ON, confirmed OFF, confirmed ON, missing preference profile, invalid token, and owner OFF.
- Data API: body SELECT for general, rating-only R18, `sexual_r18` warning-only, private general, private R18, draft and unpublished episodes; recording metadata and `security_invoker` count view. Owner OFF retains access to their own workspace (including private/R18) distinct from consumer preference.
- Storage: general audio remains accessible from a public bucket. R18 media uses an isolated private bucket; the known *public* URL and unapproved private download fail while allowed confirmed ON and owner sessions can download it. Public→private and posted→unpublished transitions deny fresh Data API and direct Storage downloads.
- Preference revocation: changing a confirmed viewer from ON to OFF through the local database must immediately revoke direct R18 Data API and private Storage downloads, while restoring ON must restore eligible access without changing the signed-in user's JWT. Invalid JWTs must not download private media.
- **Expected B2 gap control, NOT a PASS for contract B**: changing an existing *general* series to R18 cannot automatically revoke its previously public audio URL. The test deliberately confirms that old public URL remains readable even though direct episode body SELECT fails. This is a known incomplete transition, and B2 must explicitly block unsafe status transitions or move/restrict the media before taking effect.
- Each assertion tests the real disposable local GoTrue/PostgREST/Storage services. Output never prints JWTs, passwords, user identifiers, URLs or source content; only number of assertions and failure categories.

## Boundaries that this does **not** prove

- The fixture uses `issue137_b1_*` tables and policies that model only parts of contract B; it does **not** load the real app's `public.series`, `public.episodes`, `public.recordings` policies, its actual migrations, Next.js authenticated HTML/RSC, Reader/Search/Ranking, AI/Human translation provenance or deployed code. No real browser/JA-EN-KO E2E or real Production test is conducted.
- Age confirmation is **self-attested**, not independently verified age. An owner with display OFF can manage private/own R18 data; the Reader UI must separately enforce consumer preference.
- Local restrictive Storage policy must not be copied onto production without separate design review. A previously issued signed URL can remain usable by anyone who possesses it until expiry. The six historical publicly reachable `human/` files remain an independent rights/consent issue.
- Supabase RLS is permissive-OR across policies; the final implementation must audit all real policies and preserve author writes, general-content public access, views and service-role API logic. Production RLS/Storage changes need separately approved object counts/rollback, genuinely independent review and exact-HEAD merge approval.
- The `EXPECTED_B2_GAP` marker is an intentionally demonstrated missing safeguard, and the B1 harness MUST NOT be described as complete end-to-end B policy. A PASS here is only non-Production synthetic contract proof, never Production RLS GO or PR #150 merge approval. PR #150 remains Draft / independent FIX / MERGE HOLD until separately resolved.

**Status:** SOURCE and language-level checks may pass before Docker execution. Report real Auth/Storage results as **UNVERIFIED/PENDING**, not PASS, until the logs are observed and an independent reviewer verifies the fixed HEAD.
