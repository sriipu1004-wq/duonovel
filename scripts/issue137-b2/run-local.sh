#!/usr/bin/env bash
# Start an ephemeral unlinked local Supabase Auth/REST/Storage stack.
# The ONLY directory deleted is the one created by mktemp below.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
B2="$ROOT/scripts/issue137-b2"
command -v docker >/dev/null || { echo 'BLOCKED: Docker missing; E2E not run'; exit 3; }
command -v node >/dev/null || { echo 'BLOCKED: Node.js missing; E2E not run'; exit 3; }
docker info >/dev/null 2>&1 || { echo 'BLOCKED: Docker daemon unavailable'; exit 3; }
WORK="$(mktemp -d "${TMPDIR:-/tmp}/libread-issue137-b2-XXXXXXXX")"
case "$WORK" in */libread-issue137-b2-*) ;; *) echo 'BLOCKED: unsafe temporary path' >&2; exit 2 ;; esac
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
   echo 'CLEANUP_FAIL: B2 Docker network still has containers or cannot be inspected (identifiers redacted)' >&2
   cleanup_failed=1
  elif ! docker network rm "$NETWORK" >/dev/null 2>&1; then
   echo 'CLEANUP_FAIL: unable to remove dedicated B2 Docker network' >&2
   cleanup_failed=1
  fi
 fi
 if (( cleanup_failed == 0 )); then
  if ! rm -rf -- "$WORK"; then
   echo 'CLEANUP_FAIL: temporary workspace removal failed' >&2
   cleanup_failed=1
  else
   echo 'PASS: B2 stop, zero remaining network containers, dedicated network and workspace cleanup verified'
  fi
 fi
 if (( cleanup_failed != 0 )); then
  echo "CLEANUP_HOLD: preserved workspace=$WORK; network=$NETWORK; manually verify B2-only resources, do NOT use docker prune or global supabase stop" >&2
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
cp "$B2/fixture.sql" supabase/migrations/20261026115900_issue137_b2_fixture.sql
cp "$B2/atomic-race-fixture.sql" supabase/migrations/20261026115910_issue137_b2_atomic_race_fixture.sql
cp "$ROOT/supabase/migrations/20261026120000_issue137_b2_r18_boundary.sql" supabase/migrations/20261026120000_issue137_b2_r18_boundary.sql
start_attempted=1
npx --yes supabase@2.122.0 start --network-id "$NETWORK" >/dev/null
# Fail closed: inspect every host-published port on running network containers.
mapfile -t containers < <(docker ps -q --filter "network=$NETWORK")
if (( ${#containers[@]} == 0 )); then
 echo 'BLOCKED: no running B2 containers on dedicated Docker network' >&2; exit 3
fi
published=0
for container in "${containers[@]}"; do
 bindings="$(docker inspect --format '{{range $port, $bindings := .NetworkSettings.Ports}}{{range $bindings}}{{println .HostIp}}{{end}}{{end}}' "$container")"
 while IFS= read -r ip; do
  [[ -z "$ip" ]] && continue
  if [[ "$ip" != '127.0.0.1' ]]; then
   echo 'BLOCKED: B2 service has non-loopback Docker host port binding (address redacted)' >&2
   exit 3
  fi
  published=$((published + 1))
 done <<< "$bindings"
done
if (( published == 0 )); then
 echo 'BLOCKED: no verifiable Docker loopback host-port bindings' >&2; exit 3
fi
echo "PASS: B2 isolated Docker bridge and $published published binding(s) restricted to 127.0.0.1"
STATUS="$(npx --yes supabase@2.122.0 status --output env)"
get_value() {
 printf '%s\n' "$STATUS" | sed -n "s/^$1=//p" | head -n 1 | tr -d '"\r'
}
export B2_LOCAL_URL="$(get_value API_URL)"
export B2_ANON_KEY="$(get_value ANON_KEY)"
export B2_SERVICE_KEY="$(get_value SERVICE_ROLE_KEY)"
export B2_EPHEMERAL_CONFIRM=local-only
# Local API URL and credentials are checked again inside e2e.mjs.
# Never output local keys, JWTs, passwords, or signed URLs into a log.
node "$B2/e2e.mjs"
# Independent synthetic race tests use the same validated localhost-only stack.
# Run from repository root so the CI-pinned tsx loader can import the
# actual Human provenance classifier; local Supabase remains unlinked.
(cd "$ROOT" && node --import tsx "$B2/atomic-race-e2e.mjs")
# Apply the UNAPPLIED H1 candidate only inside the already verified disposable
# local database, AFTER legacy negative controls which deliberately bypass it.
# Resolve the PostgreSQL container by image in our exclusive Docker network;
# never use local/host PostgreSQL settings, linked projects or hosted SQL.
db_container=''
while read -r id image_name; do
  if [[ "$image_name" == *supabase/postgres:* ]]; then
    [[ -z "$db_container" ]] || { echo 'BLOCKED: ambiguous local database container'; exit 3; }
    db_container="$id"
  fi
done < <(docker ps --filter "network=$NETWORK" --format '{{.ID}} {{.Image}}')
[[ -n "$db_container" ]] || { echo 'BLOCKED: no PostgreSQL container on dedicated bridge'; exit 3; }
docker cp "$ROOT/supabase/migrations/20261029190000_issue137_h1_human_atomic.sql" \
  "$db_container:/tmp/issue137_h1_human_atomic.sql"
docker exec "$db_container" psql -U postgres -d postgres \
  -v ON_ERROR_STOP=1 -f /tmp/issue137_h1_human_atomic.sql >/dev/null
echo 'PASS: H1 candidate installed only in disposable LOCAL PostgreSQL'
node "$B2/h1-atomic-e2e.mjs"
# Deterministic lock contention on the same disposable PostgreSQL instance.
B2_NETWORK="$NETWORK" bash "$B2/bucket-publicity-race-local.sh" "$db_container"
