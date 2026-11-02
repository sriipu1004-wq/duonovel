#!/usr/bin/env bash
# Start an ephemeral unlinked local Supabase Auth/REST/Storage stack.
# The ONLY directory deleted is the one created by mktemp below.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
I138="$ROOT/scripts/issue138-auth-rls"
command -v docker >/dev/null || { echo 'BLOCKED: Docker missing; E2E not run'; exit 3; }
command -v node >/dev/null || { echo 'BLOCKED: Node.js missing; E2E not run'; exit 3; }
docker info >/dev/null 2>&1 || { echo 'BLOCKED: Docker daemon unavailable'; exit 3; }
WORK="$(mktemp -d "${TMPDIR:-/tmp}/libread-issue138-auth-rls-XXXXXXXX")"
case "$WORK" in */libread-issue138-auth-rls-*) ;; *) echo 'BLOCKED: unsafe temporary path' >&2; exit 2 ;; esac
NETWORK="${WORK##*/}-loopback"
network_created=0
start_attempted=0
cleanup() {
 local original_exit=$? cleanup_failed=0 stopped=0 remaining='' check_rc=0
 trap - EXIT
 set +e
 if (( start_attempted )); then
  (cd "$WORK" && npx --yes supabase@2.122.0 stop --no-backup >/dev/null 2>&1)
  stopped=$?
  if (( stopped != 0 )); then
   echo "CLEANUP_FAIL: local Supabase stop failed (exit $stopped; details redacted)" >&2
   cleanup_failed=1
  fi
 fi
 if (( network_created )); then
  remaining="$(docker ps -aq --filter "network=$NETWORK" 2>/dev/null)"
  check_rc=$?
  if (( check_rc != 0 )) || [[ -n "$remaining" ]]; then
   echo 'CLEANUP_FAIL: I138 Docker network still has containers or cannot be inspected (identifiers redacted)' >&2
   cleanup_failed=1
  elif ! docker network rm "$NETWORK" >/dev/null 2>&1; then
   echo 'CLEANUP_FAIL: unable to remove dedicated I138 Docker network' >&2
   cleanup_failed=1
  fi
 fi
 if (( cleanup_failed == 0 )); then
  if ! rm -rf -- "$WORK"; then
   echo 'CLEANUP_FAIL: temporary workspace removal failed' >&2
   cleanup_failed=1
  else
   echo 'PASS: I138 stop, zero remaining network containers, dedicated network and workspace cleanup verified'
  fi
 fi
 if (( cleanup_failed != 0 )); then
  echo "CLEANUP_HOLD: preserved workspace=$WORK; network=$NETWORK; manually verify I138-only resources, do NOT use docker prune or global supabase stop" >&2
  exit 4
 fi
 exit "$original_exit"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
# Docker's default host-published port binding is loopback on this unique bridge.
# Node's localhost-only client guard alone does not protect listening ports.
docker network create --driver bridge \
 --opt com.docker.network.bridge.host_binding_ipv4=127.0.0.1 \
 "$NETWORK" >/dev/null
network_created=1
[[ "$(docker network inspect --format '{{index .Options "com.docker.network.bridge.host_binding_ipv4"}}' "$NETWORK")" == '127.0.0.1' ]] || {
 echo 'BLOCKED: dedicated Docker network not confined to loopback' >&2; exit 3;
}
cd "$WORK"
# NEVER 'supabase link', 'db push', 'db reset --linked', or provide a hosted key.
npx --yes supabase@2.122.0 init --force >/dev/null
mkdir -p supabase/migrations
cp "$I138/fixture.sql" supabase/migrations/20261025000000_issue138_auth_rls_fixture.sql
start_attempted=1
npx --yes supabase@2.122.0 start --network-id "$NETWORK" >/dev/null
# Fail closed: inspect every host-published port on running network containers.
mapfile -t containers < <(docker ps -q --filter "network=$NETWORK")
if (( ${#containers[@]} == 0 )); then
 echo 'BLOCKED: no running I138 containers on dedicated Docker network' >&2; exit 3
fi
published=0
for container in "${containers[@]}"; do
 bindings="$(docker inspect --format '{{range $port, $bindings := .NetworkSettings.Ports}}{{range $bindings}}{{println .HostIp}}{{end}}{{end}}' "$container")"
 while IFS= read -r ip; do
  [[ -z "$ip" ]] && continue
  if [[ "$ip" != '127.0.0.1' ]]; then
   echo 'BLOCKED: I138 service has non-loopback Docker host port binding (address redacted)' >&2
   exit 3
  fi
  published=$((published + 1))
 done <<< "$bindings"
done
if (( published == 0 )); then
 echo 'BLOCKED: no verifiable Docker loopback host-port bindings' >&2; exit 3
fi
echo "PASS: I138 isolated Docker bridge and $published published binding(s) restricted to 127.0.0.1"
STATUS="$(npx --yes supabase@2.122.0 status --output env)"
get_value() {
 printf '%s\n' "$STATUS" | sed -n "s/^$1=//p" | head -n 1 | tr -d '"\r'
}
export I138_LOCAL_URL="$(get_value API_URL)"
export I138_ANON_KEY="$(get_value ANON_KEY)"
export I138_SERVICE_KEY="$(get_value SERVICE_ROLE_KEY)"
export I138_EPHEMERAL_CONFIRM=local-only
# Local API URL and credentials are checked again inside e2e.mjs.
# Never output local keys, JWTs, passwords, or signed URLs into a log.
node "$I138/e2e.mjs"
echo 'PASS: #138 pre-fix red-case A/B/anon behavior replicated locally'

# The approved source migration is applied ONLY to this temporary local Docker
# PostgreSQL, never to Supabase hosted/project-bound resources.
mapfile -t db_containers < <(docker ps -q --filter "network=$NETWORK" --filter "name=supabase_db_")
if (( ${#db_containers[@]} != 1 )); then
 echo 'BLOCKED: cannot uniquely identify disposable local Postgres' >&2; exit 3
fi
docker cp "$ROOT/supabase/migrations/20261103010000_restrict_private_library_direct_import_mutations.sql" \
 "${db_containers[0]}:/tmp/issue138_restrict_private_library.sql"
docker exec "${db_containers[0]}" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres \
 -f /tmp/issue138_restrict_private_library.sql >/dev/null
# PostgREST schema cache does not need refresh for a GRANT change, but notify
# explicitly; isolated test reuses the same live GoTrue / PostgREST stack.
docker exec "${db_containers[0]}" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres \
 -c "NOTIFY pgrst, 'reload schema';" >/dev/null
echo 'PASS: #138 candidate column privileges applied to disposable LOCAL DB only'
node "$I138/e2e-fixed.mjs"
