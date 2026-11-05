#!/usr/bin/env bash
# #137 TEST ONLY: sibling Storage API on already isolated CLI Postgres/Storage.
set -euo pipefail
[[ "${DO_NOT_CONTACT_PRODUCTION:-}" == "true" ]] || exit 3
[[ "${R0_EPHEMERAL_CONFIRM:-}" == "local-only" ]] || exit 3
[[ "${R0_LOCAL_URL:-}" == "http://127.0.0.1:54321" ]] || exit 3
for name in SUPABASE_SERVICE_ROLE_KEY SUPABASE_DB_PASSWORD \
 SUPABASE_ACCESS_TOKEN AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY S3_SECRET_ACCESS_KEY; do
 [[ -z "${!name:-}" ]] || { echo "BLOCKED: inherited credential" >&2; exit 3; }
done
[[ -d "${R0_WORKSPACE:-}" ]] || { echo "BLOCKED: disposable workspace missing" >&2; exit 3; }
[[ "$R0_WORKSPACE" == /tmp/libread-r0-* ]] || {
 echo "BLOCKED: non-ephemeral workspace" >&2; exit 3; }
NETWORK="${R0_WORKSPACE##*/}-loopback"
[[ "$(docker network inspect --format '{{index .Options "com.docker.network.bridge.host_binding_ipv4"}}' "$NETWORK")" == "127.0.0.1" ]] || exit 3
mapfile -t local_storage < <(docker ps --filter "network=$NETWORK" \
 --format '{{.ID}} {{.Image}}' | awk '$2 ~ /(^|\/)storage-api:/ {print $1}')
(( ${#local_storage[@]} == 1 )) || {
 echo "BLOCKED: exactly one disposable Storage API required" >&2; exit 3; }
origin="${local_storage[0]}"
image="$(docker inspect --format '{{.Config.Image}}' "$origin")"
[[ "$image" =~ (^|/)storage-api:v[0-9]+ ]] || {
 echo "BLOCKED: unrecognized Storage image" >&2; exit 3; }
name="${NETWORK}-static-s3"
[[ -z "$(docker ps -aq --filter "name=^/$name$")" ]] || {
 echo "BLOCKED: static S3 sibling name occupied" >&2; exit 3; }
env_file="$R0_WORKSPACE/static-s3-clone.env"
[[ ! -e "$env_file" ]] || exit 3
umask 077
# Credentials are local to the already-disposable stack. Do not print them.
docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$origin" > "$env_file"
chmod 600 "$env_file"
static_access="$(openssl rand -hex 16)"
static_secret="$(openssl rand -hex 32)"
started=0
cleanup() {
 local result=$?
 trap - EXIT
 set +e
 if (( started )); then
   docker rm -f "$name" >/dev/null 2>&1
   if [[ $? != 0 ]]; then
     echo "CLEANUP_HOLD: isolated static S3 sibling needs inspection" >&2
     exit 4
   fi
 fi
 rm -f -- "$env_file"
 unset static_access static_secret
 exit "$result"
}
trap cleanup EXIT
# Same synthetic DB and backend volume; original service never replaced.
docker run -d --name "$name" --pull never \
 --network "$NETWORK" --network-alias "$name" \
 --volumes-from "$origin" --env-file "$env_file" \
 --env "S3_PROTOCOL_ACCESS_KEY_ID=$static_access" \
 --env "S3_PROTOCOL_ACCESS_KEY_SECRET=$static_secret" \
 --env RUN_MIGRATIONS=false \
 --publish 127.0.0.1:54333:5000 "$image" >/dev/null
started=1
mapfile -t ips < <(docker inspect \
 --format '{{range $p,$bindings := .NetworkSettings.Ports}}{{range $bindings}}{{println .HostIp}}{{end}}{{end}}' "$name")
(( ${#ips[@]} == 1 )) && [[ "${ips[0]}" == "127.0.0.1" ]] || {
 echo "BLOCKED: sibling port not exclusively loopback" >&2; exit 3; }
ready=0
for _ in $(seq 1 70); do
  [[ "$(docker inspect --format '{{.State.Running}}' "$name")" == true ]] || break
  if curl -fsS --noproxy '*' --max-time 2 \
      http://127.0.0.1:54333/status >/dev/null 2>&1; then ready=1; break; fi
  sleep 0.5
done
if (( ! ready )); then
 state="$(docker inspect --format '{{.State.Status}}:{{.State.ExitCode}}' "$name")"
 echo "FAIL: local static S3 sibling unhealthy; state=$state" >&2
 exit 1
fi
echo "PASS: sibling Storage API healthy; static keys and loopback-only port"
R0_STATIC_S3_BASE=http://127.0.0.1:54333 \
R0_STATIC_S3_ACCESS_ID="$static_access" \
R0_STATIC_S3_SECRET="$static_secret" \
 node scripts/issue137-b2/r0-static-s3-authenticated-local-e2e.mjs
echo "PASS: isolated static S3 key verification completed"
