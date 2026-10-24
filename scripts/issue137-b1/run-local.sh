#!/usr/bin/env bash
# Start an ephemeral unlinked local Supabase Auth/REST/Storage stack.
# The ONLY directory deleted is the one created by mktemp below.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
B1="$ROOT/scripts/issue137-b1"
command -v docker >/dev/null || { echo 'BLOCKED: Docker missing; E2E not run'; exit 3; }
command -v node >/dev/null || { echo 'BLOCKED: Node.js missing; E2E not run'; exit 3; }
docker info >/dev/null 2>&1 || { echo 'BLOCKED: Docker daemon unavailable'; exit 3; }
WORK="$(mktemp -d "${TMPDIR:-/tmp}/libread-issue137-b1-XXXXXXXX")"
case "$WORK" in */libread-issue137-b1-*) ;; *) echo 'Unsafe temporary path'; exit 2 ;; esac
cleanup() {
 (cd "$WORK" && npx --yes supabase@2.122.0 stop --no-backup >/dev/null 2>&1) || true
 rm -rf -- "$WORK"
}
trap cleanup EXIT
cd "$WORK"
# NEVER 'supabase link', 'db push', 'db reset --linked', or provide a hosted key.
npx --yes supabase@2.122.0 init --force >/dev/null
mkdir -p supabase/migrations
cp "$B1/fixture.sql" supabase/migrations/20261025000000_issue137_b1_fixture.sql
npx --yes supabase@2.122.0 start >/dev/null
STATUS="$(npx --yes supabase@2.122.0 status --output env)"
get_value() {
 printf '%s\n' "$STATUS" | sed -n "s/^$1=//p" | head -n 1 | tr -d '"\r'
}
export B1_LOCAL_URL="$(get_value API_URL)"
export B1_ANON_KEY="$(get_value ANON_KEY)"
export B1_SERVICE_KEY="$(get_value SERVICE_ROLE_KEY)"
export B1_EPHEMERAL_CONFIRM=local-only
# Local API URL and credentials are checked again inside e2e.mjs.
# Never output local keys, JWTs, passwords, or signed URLs into a log.
node "$B1/e2e.mjs"
