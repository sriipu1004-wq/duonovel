# Local Supabase stack for development and E2E checks

`scripts/dev/local-supabase.sh` starts a **disposable, local-only** Supabase stack (Postgres, GoTrue Auth, PostgREST, Storage) on `127.0.0.1`. Use it to exercise real Auth / RLS / Storage behaviour before CI, without touching the hosted project.

```bash
scripts/dev/local-supabase.sh start    # starts dockerd if needed, then the stack (~35 s with cached images)
scripts/dev/local-supabase.sh status   # local URLs and Supabase's public demo keys
scripts/dev/local-supabase.sh stop     # stops the stack and deletes its data
```

## Why it works in a Claude Code cloud session

- The container ships `dockerd`; the session runs as root, so the script starts the daemon itself when `docker info` fails.
- The Supabase CLI's default image registry (`public.ecr.aws`) serves layers from a CDN host that the session proxy blocks (HTTP 403). The script sets `SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io`; Docker Hub mirrors the same `supabase/*` images.
- Services not needed for Auth/REST/Storage checks (studio, imgproxy, edge-runtime, logflare, vector, supavisor, mailpit) are excluded.

Verified 2026-11-07 in a cloud session: cold start (dockerd stopped) → stack up; a synthetic user signs in with the publishable key; a service-key upload/download to a private bucket works; the same object is denied to the signed-in user without a policy.

## Rules

- **Local only.** Never point this stack's keys or scripts at the hosted project, and never copy hosted secrets into it. The printed keys are Supabase's public demo keys for local stacks.
- **No repository migrations.** The workdir is outside the repository because `supabase/migrations` cannot bootstrap an empty database (Issue #137). Load only the schema a test needs, from a reviewed fixture.
- **Evidence level.** Results are `LOCAL` evidence: stronger than mocks, weaker than hosted Preview/Production checks. Label them that way in Issue/PR checkpoints.
- GitHub Actions workflows that already run disposable stacks (Issue #137 harness) remain the CI source of truth; this script is for faster iteration in a session.
