#!/usr/bin/env bash
# Issue #137 R0: isolated, unlinked local Supabase Auth/REST/Storage.
# ONLY the mktemp-created directory and exclusive Docker bridge may be removed.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
R0="$ROOT/scripts/issue137-b2"
[[ "${DO_NOT_CONTACT_PRODUCTION:-}" == "true" ]] || {
  echo "BLOCKED: DO_NOT_CONTACT_PRODUCTION must be true" >&2; exit 3;
}
for name in SUPABASE_SERVICE_ROLE_KEY SUPABASE_DB_PASSWORD SUPABASE_ACCESS_TOKEN \
 AWS_SECRET_ACCESS_KEY S3_SECRET_ACCESS_KEY; do
 [[ -z "${!name:-}" ]] || {
   echo "BLOCKED: hosted credential found in environment" >&2; exit 3;
 }
done
command -v docker >/dev/null || { echo "BLOCKED: Docker unavailable"; exit 3; }
command -v node >/dev/null || { echo "BLOCKED: Node unavailable"; exit 3; }
docker info >/dev/null 2>&1 || {
  echo "BLOCKED: Docker daemon unavailable"; exit 3;
}
WORK="$(mktemp -d "${TMPDIR:-/tmp}/libread-r0-XXXXXXXX")"
case "$WORK" in */libread-r0-*) ;; *)
  echo "BLOCKED: unsafe temporary workspace" >&2; exit 3 ;;
esac
NETWORK="${WORK##*/}-loopback"
network_created=0
started=0
cleanup() {
  local original=$? failed=0 leftover=''
  trap - EXIT
  set +e
  if (( started )); then
    ( cd "$WORK" && npx --yes supabase@2.122.0 stop --no-backup >/dev/null 2>&1 )
    if [[ $? -ne 0 ]]; then failed=1; fi
  fi
  if (( network_created )); then
    leftover="$(docker ps -aq --filter "network=$NETWORK" 2>/dev/null)"
    if [[ -n "$leftover" ]]; then
      failed=1
    elif ! docker network rm "$NETWORK" >/dev/null 2>&1; then
      failed=1
    fi
  fi
  if (( failed == 0 )); then
    rm -rf -- "$WORK" || failed=1
  fi
  if (( failed )); then
    echo "CLEANUP_HOLD: isolated R0 resources preserved; manually inspect only this run, never docker prune" >&2
    exit 4
  fi
  echo "PASS: local stack, exclusive bridge and synthetic workspace cleaned"
  exit "$original"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
docker network create --driver bridge \
 --opt com.docker.network.bridge.host_binding_ipv4=127.0.0.1 \
 "$NETWORK" >/dev/null
network_created=1
[[ "$(docker network inspect --format '{{index .Options "com.docker.network.bridge.host_binding_ipv4"}}' "$NETWORK")" == "127.0.0.1" ]] || {
 echo "BLOCKED: local bridge has non-loopback binding" >&2; exit 3;
}
cd "$WORK"
# NEVER link to hosted project, NEVER pass any service credentials from Production.
npx --yes supabase@2.122.0 init --force >/dev/null
mkdir -p supabase/migrations
# The file is assembled ONLY in this temp project; the candidate under
# scripts/ is not an application migration and is NOT suitable for db push.
cat "$R0/r0-local-storage-fixture.sql" \
 "$R0/r0-public-media-transition-candidate.sql" \
 > supabase/migrations/20261103000000_issue137_r0_local_only.sql
started=1
npx --yes supabase@2.122.0 start --network-id "$NETWORK" >/dev/null
mapfile -t containers < <(docker ps -q --filter "network=$NETWORK")
(( ${#containers[@]} > 0 )) || {
 echo "BLOCKED: local Docker network has no running containers" >&2; exit 3;
}
bindings_count=0
for container in "${containers[@]}"; do
  bindings="$(docker inspect \
    --format '{{range $port, $bindings := .NetworkSettings.Ports}}{{range $bindings}}{{println .HostIp}}{{end}}{{end}}' "$container")"
  while IFS= read -r ip; do
    [[ -z "$ip" ]] && continue
    [[ "$ip" == "127.0.0.1" ]] || {
      echo "BLOCKED: local Docker container published a non-loopback port" >&2; exit 3;
    }
    bindings_count=$((bindings_count+1))
  done <<< "$bindings"
done
(( bindings_count > 0 )) || {
 echo "BLOCKED: no verified local loopback port bindings" >&2; exit 3;
}
echo "PASS: local Docker bridge and $bindings_count host bindings restricted to loopback"
STATUS="$(npx --yes supabase@2.122.0 status --output env)"
read_env() {
 printf '%s\n' "$STATUS" | sed -n "s/^$1=//p" | head -n 1 | tr -d '"\r'
}
export R0_LOCAL_URL="$(read_env API_URL)"
export R0_ANON_KEY="$(read_env ANON_KEY)"
export R0_SERVICE_KEY="$(read_env SERVICE_ROLE_KEY)"
export R0_EPHEMERAL_CONFIRM=local-only
# NEVER echo these values.
cd "$ROOT"
node scripts/issue137-b2/r0-local-storage-e2e.mjs
# Actual Next.js route over local HTTP + real SSR-cookie sessions.
# Never pass R0_SERVICE_KEY (or any privileged key) into the spawned app.
node scripts/issue137-b2/r0-next-http-e2e.mjs
