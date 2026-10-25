# Issue #137 B1 — Isolated Auth / PostgREST / Storage R18 contract proof

**Owner-approved test-only phase.** Product policy B means R18 must be protected across Data API, app and Storage, not only invisible in UI. This directory is a **runnable synthetic prototype** of the future DB/Storage contract. It is NOT a migration and is deliberately excluded from `supabase/migrations` so it cannot be deployed through the ordinary project migrations.

## Run, requirements and safety gate

Requires a trusted machine or approved CI runner with **Docker**, Bash, Node 20+, enough RAM/disk for a fresh Supabase stack and network access for initial npm/container downloads.

```bash
bash scripts/issue137-b1/run-local.sh
```

The runner pins `supabase@2.122.0`, initializes an entirely new `mktemp` local Supabase workspace, copies **only** `fixture.sql` into that workspace's migrations folder, runs the local GoTrue Auth, PostgREST and Storage stack, reads **generated local credentials** from `supabase status --output env`, executes `e2e.mjs`, then stops/deletes only the temporary workspace. Do not run `supabase link`, `db push`, `db reset --linked`, or inject hosted Supabase secrets. The Node test refuses non-local HTTP endpoints and unexpected API ports. No actual user identity, production table or Storage item is read or modified.

## F1 — loopback-only network boundary

The runner creates a **dedicated unique Docker bridge network** configured with `com.docker.network.bridge.host_binding_ipv4=127.0.0.1`, and invokes `supabase start --network-id` using that network. It checks the configured option and independently inspects actual host-published Docker port bindings on the running B1 containers. **Every published host IP must equal 127.0.0.1 and at least one binding must exist**, otherwise execution is BLOCKED before synthetic users are created. The Node localhost URL guard protects only the outbound test client, not server listeners. Supabase's default `0.0.0.0` startup warning is not a pass or an independent report of external reachability; verify the actual Docker binding log on the new HEAD. Do not expose local ports or rely on this as a public server; full external network/firewall reachability on every host OS is not proven.

## F2 — verifiable fail-closed teardown

The EXIT handler attempts `supabase stop --no-backup`, checks **all running and stopped containers** attached to the B1 Docker network, removes the isolated network and only then removes its temporary workspace. Normal successful execution must log `PASS: B1 stop, zero remaining network containers, dedicated network and workspace cleanup verified`. On stop failure, Docker inspection failure, remaining containers, network-removal or workspace-removal failure it reports `CLEANUP_FAIL`/`CLEANUP_HOLD` with a redacted error, returns nonzero, and **preserves the workspace and B1 network identifiers** for manual B1-only recovery. No `supabase stop --all`, Docker prune, or other-project deletion is allowed. Forced SIGKILL, host crash or Docker engine loss cannot be automatically cleaned by a shell trap and require manual host-level inspection.

## F3 — actual prior-head CI and automatic workflow trigger

- Historic Windows machine source/syntax checks succeeded but its Docker was missing, so **0 local Windows GoTrue/PostgREST/Storage E2E assertions** ran.
- At *previous* exact PR #152 HEAD `f898db8e47e00f811dee04e14eb6f05c4cdda152`, [GitHub Actions #40115019249](https://github.com/sriipu1004-wq/duonovel/actions/runs/40115019249), job `120934408467`, ran disposable GoTrue/PostgREST/Storage and logged **50 successful synthetic integration assertions** plus `EXPECTED_B2_GAP` (pre-existing public media URL remains reachable after general→R18). This is **prior-head evidence only**, not proof the updated F1/F2 runner has passed.
- `.github/workflows/issue137-b1-isolated-e2e.yml` is present and its `pull_request` trigger covers changes to this B1 directory and the workflow itself. It uses a standard public-repository `ubuntu-24.04` runner, 20-minute limit and same-repository PR #152 branch guard; no secrets or artifact caches, paid runner or billing-setting changes. A new commit can automatically trigger this approved workflow. The earlier log had retried Docker image pulls reporting `toomanyrequests`, but the stack eventually started; new-run CI success, loopback binding check, **and** cleanup evidence are all required.
- Successful synthetic B1 checks do **not** prove Production RLS/Storage policy, signed-in Next.js HTML/RSC/Reader, or a resolved B2 media URL transition. Any new frozen HEAD must be independently security re-reviewed before release.

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

**Status:** prior-HEAD CI synthetic Auth/Data API/Storage 50-case PASS is documented above. After F1–F3 edits, report new-HEAD E2E, Docker binding verification and cleanup as **UNVERIFIED/PENDING** until new-HEAD raw CI logs confirm execution; independent non-author READ-ONLY security GO remains required. Both PR #152 and PR #150 remain Draft / MERGE HOLD.
