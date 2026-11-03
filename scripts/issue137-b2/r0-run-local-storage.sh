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
# Generate an authentic migration filename using the PINNED local CLI;
# do not invent a Production timestamp or link/push/repair remote history.
# Only the mktemp disposable project can receive this candidate and fixture.
npx --yes supabase@2.122.0 migration new issue137_b2_r0_local_candidate >/dev/null
mapfile -t local_migrations < <(
 find "$WORK/supabase/migrations" -maxdepth 1 -type f \
  -name '*_issue137_b2_r0_local_candidate.sql' -print
)
(( ${#local_migrations[@]} == 1 )) || {
 echo "BLOCKED: CLI did not create exactly one local migration" >&2; exit 3;
}
cat "$R0/r0-local-storage-fixture.sql" \
 "$R0/r0-b2-unified-local-candidate.sql" \
 > "${local_migrations[0]}"
echo "PASS: CLI generated exactly one disposable candidate migration; no remote history touched"
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
# The synthetic crash/restart journal is local, private and deleted with WORK.
export R0_WORKSPACE="$WORK"
# NEVER echo these values.
cd "$ROOT"
# Existing single-asset baseline stays intact.
node scripts/issue137-b2/r0-local-storage-e2e.mjs
# NEW: 3-object scoped manifest, partial batch stop/resume, PRIVATE restore.
node scripts/issue137-b2/r0-batch-retirement-local-e2e.mjs
# Exercise signed S3 privileged writes against the FIRST isolated B2 stack,
# independently from browser hydration and the later combined H1 stage.
node scripts/issue137-b2/r0-privileged-s3-local-e2e.mjs
# Separate directly privileged service_role SQL, NOT the S3 or REST API.
# Forbid anything except the runner's disposable Supabase Postgres literal DSN.
command -v psql >/dev/null || { echo "BLOCKED: psql unavailable" >&2; exit 3; }
R0_DB_URL="$(read_env DB_URL)"
[[ "$R0_DB_URL" =~ ^postgresql://postgres:[^@]+@127[.]0[.]0[.]1:54322/postgres$ ]] || {
 echo "BLOCKED: direct service-role test requires exact local Postgres" >&2; exit 3
}
psql -X "$R0_DB_URL" -v ON_ERROR_STOP=1 \
  -f "$R0/r0-direct-service-role-storage-local.sql" > "$WORK/direct-sql-probe.out" 2>&1 || {
 echo "FAIL: isolated direct-SQL negative test failed" >&2
 sed -E 's#postgresql://[^ ]+#<local-dsn-redacted>#g' "$WORK/direct-sql-probe.out" | tail -25 >&2
 exit 1
}
grep -Fq "ISSUE137_DIRECT_SQL_ROLE_BOUNDARY_AND_ROLLBACK_PASS" "$WORK/direct-sql-probe.out" || {
 echo "FAIL: direct SQL test did not attest rollback" >&2; exit 1
}
echo "PASS: local service_role direct SQL B2 PUBLIC denial and PRIVATE metadata risk / transaction rollback"
node scripts/issue137-b2/r0-signed-upload-revocation-local-e2e.mjs
# Actual Next.js route over local HTTP + real SSR-cookie sessions.
# Never pass R0_SERVICE_KEY (or any privileged key) into the spawned app.
node scripts/issue137-b2/r0-next-http-e2e.mjs
node scripts/issue137-b2/r0-b2-auth-storage-negative-e2e.mjs
# The following DDL rollback rehearsal is sentinel-gated and transaction-only.
# It deliberately does NOT uninstall security on a deployed database.
command -v psql >/dev/null || { echo "BLOCKED: psql unavailable"; exit 3; }
R0_DB_URL="$(read_env DB_URL)"
[[ "$R0_DB_URL" =~ ^postgresql://postgres:[^@]+@127[.]0[.]0[.]1:54322/postgres$ ]] || {
 echo "BLOCKED: Postgres DSN is not precisely the local Supabase default" >&2; exit 3;
}
psql -X "$R0_DB_URL" -v ON_ERROR_STOP=1 \
 -f "$R0/r0-b2-local-transactional-revert-smoke.sql" \
 | grep -F "ISSUE137_LOCAL_TRANSACTIONAL_ROLLBACK_PASS" >/dev/null
echo "PASS: local transactional DDL rollback restored the tested R18 policy and series trigger"
# A second application must STOP rather than overwrite any existing release
# guards. No hosted keys, project link or remote repair call exists here.
if psql -X "$R0_DB_URL" -v ON_ERROR_STOP=1 \
 -f "$R0/r0-b2-unified-local-candidate.sql" > "$WORK/reapply.out" 2>&1; then
 echo "FAIL: duplicate candidate install was accepted" >&2; exit 1
fi
grep -Fq "ISSUE137_ALREADY_INSTALLED_TRIGGER_HOLD" "$WORK/reapply.out" || {
 echo "FAIL: duplicate candidate installation rejected for unexpected reason" >&2; exit 1
}
echo "PASS: unified SQL candidate refuses duplicate installation in real local PostgreSQL"

# Rehearse an ACTUAL single-migration B2/R0+H1 installation on the SAME
# disposable local environment after the baseline checks. No hosted link,
# remote repair or additional persistent stack. This local reset destroys ONLY
# the mktemp fixture owned by this runner, never a real project.
[[ "$WORK" == */libread-r0-* ]] && [[ -f "${local_migrations[0]}" ]] || {
 echo "BLOCKED: local-only migration/reset provenance missing" >&2; exit 3
}
cd "$WORK"
export R0_EPHEMERAL_CONFIRM=local-only
# Replace ONLY the local first-stage fixture migration with the selected
# hosted-shape legacy schema. Its B2/R0+H1 guards remain ABSENT at this point.
# Create ONE subsequent forward-only B2/R0+H1 migration via pinned CLI.
node "$R0/r0-b2-h1-render-single-local.mjs" --emit-fixture-local > "${local_migrations[0]}"
npx --yes supabase@2.122.0 migration new issue137_b2_h1_existing_schema_candidate >/dev/null
mapfile -t forward_migrations < <(
 find "$WORK/supabase/migrations" -maxdepth 1 -type f \
  -name '*_issue137_b2_h1_existing_schema_candidate.sql' -print
)
(( ${#forward_migrations[@]} == 1 )) || {
 echo "BLOCKED: exactly one LOCAL forward candidate expected" >&2; exit 3
}
node "$R0/r0-b2-h1-render-single-local.mjs" --emit-local > "${forward_migrations[0]}"
for sql_file in "${local_migrations[0]}" "${forward_migrations[0]}"; do
 [[ "$(grep -Eic '^[[:space:]]*begin;[[:space:]]*$' "$sql_file")" == 1 ]] || exit 3
 [[ "$(grep -Eic '^[[:space:]]*commit;[[:space:]]*$' "$sql_file")" == 1 ]] || exit 3
done
if grep -Eqi 'create table public\.(series|episodes|recordings|users)' "${forward_migrations[0]}"; then
 echo "BLOCKED: forward migration secretly contains local fixture" >&2; exit 3
fi
echo "PASS: isolated existing-schema fixture precedes exactly ONE B2/R0+H1 feature migration"
# A live 'db reset --local' left the existing Storage process pointing
# at a restarting Postgres container (CI 41610029545, unhealthy). Rebuild the
# WHOLE same disposable stack instead; NEVER run remote db reset/push/repair.
# --no-backup discards only this runner's isolated local stack data.
npx --yes supabase@2.122.0 stop --no-backup >/dev/null
started=0
[[ -z "$(docker ps -q --filter "network=$NETWORK")" ]] || {
 echo "BLOCKED: stopped local stack retains running containers" >&2; exit 3
}
[[ "$(docker network inspect --format '{{index .Options "com.docker.network.bridge.host_binding_ipv4"}}' "$NETWORK")" == "127.0.0.1" ]] || {
 echo "BLOCKED: local bridge changed during restart" >&2; exit 3
}
started=1
npx --yes supabase@2.122.0 start --network-id "$NETWORK" >/dev/null
# Revalidate network confinement and new ephemeral credentials post restart.
mapfile -t second_containers < <(docker ps -q --filter "network=$NETWORK")
(( ${#second_containers[@]} > 0 )) || {
 echo "BLOCKED: restarted local stack absent" >&2; exit 3
}
for container in "${second_containers[@]}"; do
 bindings="$(docker inspect --format '{{range $port, $bindings := .NetworkSettings.Ports}}{{range $bindings}}{{println .HostIp}}{{end}}{{end}}' "$container")"
 while IFS= read -r ip; do
  [[ -z "$ip" || "$ip" == "127.0.0.1" ]] || {
   echo "BLOCKED: restarted local stack exposed non-loopback binding" >&2; exit 3
  }
 done <<< "$bindings"
done
STATUS="$(npx --yes supabase@2.122.0 status --output env)"
export R0_LOCAL_URL="$(read_env API_URL)"
export R0_ANON_KEY="$(read_env ANON_KEY)"
export R0_SERVICE_KEY="$(read_env SERVICE_ROLE_KEY)"
[[ "${R0_LOCAL_URL}" == "http://127.0.0.1:54321" ]] || {
 echo "BLOCKED: local API origin changed on restart" >&2; exit 3
}
cd "$ROOT"
node scripts/issue137-b2/r0-h1-atomic-local-e2e.mjs
echo "PASS: single-file B2/R0+H1 with selected hosted CHECK/FK shape in fresh local stack"
R0_DB_URL="$(read_env DB_URL)"
[[ "$R0_DB_URL" =~ ^postgresql://postgres:[^@]+@127[.]0[.]0[.]1:54322/postgres$ ]] || {
 echo "BLOCKED: forward repair test may only use fresh local PG" >&2; exit 3
}
psql -X "$R0_DB_URL" -v ON_ERROR_STOP=1 \
 -f "$R0/r0-forward-repair-rehearsal-local.sql" \
 | grep -F "ISSUE137_LOCAL_FORWARD_REPAIR_SECURITY_PRESERVED" >/dev/null
echo "PASS: post-COMMIT incident recovered with a narrow forward fix, B2/H1 trigger/policy digests identical"
