#!/usr/bin/env bash
# Child84: exercise the unmodified pg_cron migration against a throwaway PG17
# container. This is NOT connected to or a backup of Production Supabase.
set -euo pipefail

name="child84-cron-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}"
cleanup() { docker rm -f "$name" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker build --quiet --tag child84-pgcron-fixture \
  --file scripts/child84-pgcron-test.Dockerfile .
docker run --detach --name "$name" \
  -e POSTGRES_PASSWORD=child84-ci-only \
  -e POSTGRES_DB=child84_validation \
  child84-pgcron-fixture \
  postgres -c shared_preload_libraries=pg_cron \
           -c cron.database_name=child84_validation \
           -c cron.use_background_workers=on

psql_ci() {
  docker exec -i "$name" psql -U postgres -d child84_validation -v ON_ERROR_STOP=1 "$@"
}
for i in $(seq 1 45); do
  if docker exec "$name" pg_isready -U postgres -d child84_validation >/dev/null 2>&1; then break; fi
  if [[ "$i" = "45" ]]; then echo "Postgres did not start" >&2; docker logs "$name" >&2; exit 1; fi
  sleep 1
done

psql_ci <<'SQL'
-- Supabase ships these API roles; ordinary Postgres does not.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE TABLE public.episodes (
  id uuid PRIMARY KEY,
  series_id uuid NOT NULL,
  episode_number integer NOT NULL,
  posting_status text NOT NULL CHECK (posting_status IN ('draft','scheduled','posted')),
  is_published boolean NOT NULL DEFAULT false,
  scheduled_for timestamptz,
  posted_at timestamptz
);
INSERT INTO public.episodes
(id, series_id, episode_number, posting_status, is_published, scheduled_for)
VALUES
('00000000-0000-0000-0000-000000000001',
 '00000000-0000-0000-0000-000000000010',1,'scheduled',false,now() - interval '5 minutes'),
('00000000-0000-0000-0000-000000000002',
 '00000000-0000-0000-0000-000000000011',1,'draft',false,null),
('00000000-0000-0000-0000-000000000003',
 '00000000-0000-0000-0000-000000000012',1,'scheduled',false,now() + interval '1 day');
SQL

# Apply the WHOLE migration. A separate SQL-fixture job already verifies
# row ordering, audit rollback, rights grants, and the 200-row cap.
psql_ci < supabase/migrations/20261010230000_child84_scheduled_episode_db_release.sql
psql_ci <<'SQL'
DO $verify$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM cron.job
    WHERE jobname='libread-scheduled-episode-release-v1'
      AND schedule='* * * * *'
  ) THEN RAISE EXCEPTION 'Named Cron job was not installed'; END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class
          WHERE oid='public.libread_scheduled_episode_release_audit'::regclass) THEN
    RAISE EXCEPTION 'Audit RLS not enabled'; END IF;
END $verify$;
SQL

# A once-per-minute job should trigger within the next minute. Allow startup
# and CI scheduling slack without assuming an exact wall-clock publication.
published=0
for i in $(seq 1 100); do
  published="$(psql_ci -Atc "SELECT count(*) FROM public.episodes WHERE id='00000000-0000-0000-0000-000000000001'::uuid AND posting_status='posted' AND is_published=true AND scheduled_for IS NULL AND posted_at IS NOT NULL;")"
  if [[ "$published" = "1" ]]; then break; fi
  sleep 1
done
if [[ "$published" != "1" ]]; then
  echo "FAIL: actual pg_cron job did not publish due fixture" >&2
  psql_ci -c "SELECT jobname,active,schedule FROM cron.job;" || true
  psql_ci -c "SELECT status,return_message FROM cron.job_run_details ORDER BY start_time DESC LIMIT 5;" || true
  docker logs "$name" 2>&1 | tail -50 >&2
  exit 1
fi

psql_ci <<'SQL'
DO $verify$
BEGIN
 IF (SELECT count(*) FROM public.libread_scheduled_episode_release_audit) <> 1 THEN
   RAISE EXCEPTION 'Expected exactly one release audit row'; END IF;
 IF (SELECT released_count FROM public.libread_scheduled_episode_release_audit LIMIT 1) <> 1 THEN
   RAISE EXCEPTION 'Wrong release count'; END IF;
 IF NOT EXISTS (SELECT 1 FROM cron.job_run_details j JOIN cron.job c USING(jobid)
    WHERE c.jobname='libread-scheduled-episode-release-v1' AND j.status='succeeded') THEN
   RAISE EXCEPTION 'No successful real cron execution record'; END IF;
 IF (SELECT posting_status FROM public.episodes WHERE
   id='00000000-0000-0000-0000-000000000002'::uuid) <> 'draft' THEN
   RAISE EXCEPTION 'Draft was published'; END IF;
 IF (SELECT posting_status FROM public.episodes WHERE
   id='00000000-0000-0000-0000-000000000003'::uuid) <> 'scheduled' THEN
   RAISE EXCEPTION 'Future scheduled episode was published early'; END IF;
END $verify$;
SELECT cron.unschedule('libread-scheduled-episode-release-v1');
DO $verify$
BEGIN
 IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='libread-scheduled-episode-release-v1') THEN
   RAISE EXCEPTION 'Unschedule did not remove active cron job'; END IF;
 IF (SELECT released_count FROM public.libread_scheduled_episode_release_audit LIMIT 1) <> 1 THEN
   RAISE EXCEPTION 'Unscheduling should preserve release audit'; END IF;
END $verify$;
SQL
echo "PASS: pg_cron scheduler actually ran release SQL, logged success, protected draft/future rows, and was unscheduled"
