#!/usr/bin/env bash
# Disposable local Supabase stack (Postgres + GoTrue + PostgREST + Storage) for
# development and E2E checks inside a Claude Code cloud session or any Linux box.
#
#   scripts/dev/local-supabase.sh start   # start Docker if needed, then the stack
#   scripts/dev/local-supabase.sh status  # print local URLs and demo keys
#   scripts/dev/local-supabase.sh stop    # stop the stack and delete its data
#
# Safety: this stack is local-only (127.0.0.1) and uses Supabase's public demo
# keys. It never links to or contacts the hosted project. The workdir is outside
# the repository on purpose: the repository's supabase/migrations cannot
# bootstrap an empty database (see Issue #137), so they are NOT replayed here.
# Load the schema you need explicitly (e.g. a reviewed schema-only fixture).
set -euo pipefail

SUPABASE_CLI_VERSION="${SUPABASE_CLI_VERSION:-2.122.0}"
WORKDIR="${LIBREAD_LOCAL_SUPABASE_DIR:-${TMPDIR:-/tmp}/libread-local-supabase}"
# The default registry (public.ecr.aws) serves image layers from a CDN host that
# the cloud session proxy blocks; Docker Hub mirrors the same supabase/* images.
export SUPABASE_INTERNAL_IMAGE_REGISTRY="${SUPABASE_INTERNAL_IMAGE_REGISTRY:-docker.io}"
# Services not needed for Auth/REST/Storage checks; excluding them saves time and disk.
EXCLUDE="${LIBREAD_LOCAL_SUPABASE_EXCLUDE:-studio,imgproxy,edge-runtime,logflare,vector,supavisor,mailpit}"

supabase() { npx -y "supabase@${SUPABASE_CLI_VERSION}" "$@"; }

ensure_docker() {
  if docker info >/dev/null 2>&1; then return; fi
  if ! command -v dockerd >/dev/null 2>&1; then
    echo "docker daemon is not running and dockerd is not installed" >&2; exit 1
  fi
  local runner=""
  if [ "$(id -u)" -ne 0 ]; then runner="sudo -n"; fi
  echo "starting dockerd ..."
  $runner sh -c 'nohup dockerd >/tmp/libread-dockerd.log 2>&1 &'
  for _ in $(seq 1 30); do
    docker info >/dev/null 2>&1 && return
    sleep 1
  done
  echo "dockerd did not become ready; see /tmp/libread-dockerd.log" >&2; exit 1
}

case "${1:-}" in
  start)
    ensure_docker
    mkdir -p "$WORKDIR"
    cd "$WORKDIR"
    [ -f supabase/config.toml ] || supabase init --force >/dev/null
    supabase start -x "$EXCLUDE"
    ;;
  status)
    cd "$WORKDIR" && supabase status
    ;;
  stop)
    cd "$WORKDIR" && supabase stop --no-backup
    ;;
  *)
    echo "usage: $0 {start|status|stop}" >&2; exit 2
    ;;
esac
