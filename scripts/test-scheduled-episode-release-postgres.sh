#!/usr/bin/env bash
# Child84: real PostgreSQL SQL fixture. NEVER run against Production.
set -euo pipefail

if [[ -z "$CHILD84_PG_CONTAINER" ]]; then
  echo "CHILD84_PG_CONTAINER must be an ephemeral CI postgres service container" >&2
  exit 1
fi

psql_fixture() {
  docker exec -i "$CHILD84_PG_CONTAINER" psql -U postgres -d child84_validation -v ON_ERROR_STOP=1 -q
}

# Extract the ACTUAL release query embedded in cron.schedule; do not paste a
# copy of the implementation into the test and accidentally test stale SQL.
node --input-type=module <<'NODE'
import { readFileSync, writeFileSync } from "node:fs";
const migration = readFileSync("supabase/migrations/20261010230000_child84_scheduled_episode_db_release.sql","utf8");
const job = migration.match(/\$job\$([\s\S]*?)\$job\$/);
if (!job || !job[1].includes("for update of e skip locked")) {
  throw new Error("Cannot extract guarded scheduled-release SQL");
}
writeFileSync("/tmp/child84-scheduled-job.sql",job[1].trim()+"\n");
NODE

# These are synthetic fixtures in GitHub Actions' isolated Postgres service.
psql_fixture <<'SQL'
CREATE TABLE public.episodes (
  id uuid PRIMARY KEY,
  series_id uuid NOT NULL,
  episode_number integer NOT NULL,
  posting_status text NOT NULL CHECK (posting_status IN ('draft','scheduled','posted')),
  is_published boolean NOT NULL DEFAULT false,
  scheduled_for timestamptz NULL,
  posted_at timestamptz NULL,
  CHECK ((posting_status='scheduled' AND scheduled_for IS NOT NULL)
      OR (posting_status<>'scheduled' AND scheduled_for IS NULL))
);
CREATE TABLE public.libread_scheduled_episode_release_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  released_at timestamptz NOT NULL DEFAULT now(),
  released_count integer NOT NULL CHECK (released_count>0 AND released_count<=200),
  episode_ids uuid[] NOT NULL,
  CONSTRAINT libread_scheduled_episode_release_audit_count_check
    CHECK (cardinality(episode_ids)=released_count)
);
INSERT INTO public.episodes
  (id,series_id,episode_number,posting_status,is_published,scheduled_for,posted_at)
SELECT lpad(to_hex(v.id),32,'0')::uuid, lpad(to_hex(v.sid),32,'0')::uuid,
       v.n,v.st,v.pub,v.due,
       CASE WHEN v.st='posted' THEN '2020-01-01T00:00:00Z'::timestamptz ELSE NULL END
FROM (VALUES
 (1,10,1,'scheduled',false,'2020-01-02T00:00:00Z'::timestamptz),
 (2,10,2,'scheduled',false,'2020-01-02T00:00:00Z'::timestamptz),
 (3,11,1,'draft',false,null::timestamptz),
 (4,12,1,'scheduled',false,'2100-01-02T00:00:00Z'::timestamptz),
 (5,13,1,'posted',true,null::timestamptz),
 (6,14,1,'scheduled',false,'2020-01-02T00:00:00Z'::timestamptz),
 (7,14,2,'scheduled',false,'2020-01-02T00:00:00Z'::timestamptz),
 (8,15,1,'posted',true,null::timestamptz),
 (9,15,2,'scheduled',false,'2020-01-02T00:00:00Z'::timestamptz),
 (10,16,1,'scheduled',false,'2020-01-02T00:00:00Z'::timestamptz),
 (11,16,2,'draft',false,null::timestamptz),
 (12,16,3,'scheduled',false,'2020-01-02T00:00:00Z'::timestamptz),
 (13,17,1,'draft',false,null::timestamptz),
 (14,17,3,'scheduled',false,'2020-01-02T00:00:00Z'::timestamptz),
 (15,18,1,'posted',true,null::timestamptz),
 (16,18,3,'scheduled',false,'2020-01-02T00:00:00Z'::timestamptz),
 (17,19,1,'draft',false,null::timestamptz),
 (18,19,2,'posted',true,null::timestamptz),
 (19,19,3,'scheduled',false,'2020-01-02T00:00:00Z'::timestamptz)
) AS v(id,sid,n,st,pub,due);
SQL

psql_fixture < /tmp/child84-scheduled-job.sql
psql_fixture <<'SQL'
DO $verify$
DECLARE got integer[];
BEGIN
 SELECT ARRAY(SELECT right(u.id::text,12)::integer FROM
   public.libread_scheduled_episode_release_audit a,
   LATERAL unnest(a.episode_ids) AS u(id)
   WHERE a.id=1 ORDER BY u.id) INTO got;
 IF got IS DISTINCT FROM ARRAY[1,6,9,10,16,19] THEN
   RAISE EXCEPTION 'First release wrong IDs: %',got;
 END IF;
 IF (SELECT released_count FROM public.libread_scheduled_episode_release_audit WHERE id=1) <> 6 THEN
   RAISE EXCEPTION 'First release count wrong';
 END IF;
 IF (SELECT count(*) FROM public.episodes WHERE posting_status='scheduled' AND is_published=true)>0 THEN
   RAISE EXCEPTION 'Unreleased scheduled episode leaked';
 END IF;
 IF (SELECT posting_status FROM public.episodes WHERE right(id::text,12)::int=14) <> 'scheduled' THEN
   RAISE EXCEPTION 'Gap preceding draft was incorrectly released';
 END IF;
 IF (SELECT posted_at FROM public.episodes WHERE right(id::text,12)::int=1) IS DISTINCT FROM
   '2020-01-02T00:00:00Z'::timestamptz THEN
   RAISE EXCEPTION 'posted_at should preserve scheduled release timestamp';
 END IF;
END $verify$;
SQL

psql_fixture < /tmp/child84-scheduled-job.sql
psql_fixture <<'SQL'
DO $verify$
DECLARE got integer[];
BEGIN
 SELECT ARRAY(SELECT right(u.id::text,12)::integer FROM
   public.libread_scheduled_episode_release_audit a,
   LATERAL unnest(a.episode_ids) AS u(id)
   WHERE a.id=2 ORDER BY u.id) INTO got;
 IF got IS DISTINCT FROM ARRAY[2,7] THEN RAISE EXCEPTION 'Second release: %',got; END IF;
 IF (SELECT count(*) FROM public.libread_scheduled_episode_release_audit) <> 2 THEN
   RAISE EXCEPTION 'Audit count mismatch after second run';
 END IF;
END $verify$;
SQL

# No-op when there are no more due rows or when a draft/future row blocks.
psql_fixture < /tmp/child84-scheduled-job.sql
psql_fixture <<'SQL'
DO $verify$
BEGIN
 IF (SELECT count(*) FROM public.libread_scheduled_episode_release_audit) <> 2 THEN
   RAISE EXCEPTION 'Idempotent no-op added an audit row';
 END IF;
 IF (SELECT count(*) FROM public.episodes WHERE posting_status='scheduled') <> 3 THEN
   RAISE EXCEPTION 'Draft/future/gap episode incorrectly published';
 END IF;
END $verify$;
SQL

# Force audit INSERT to fail and verify the preceding UPDATE is rolled back.
psql_fixture <<'SQL'
INSERT INTO public.episodes
  (id,series_id,episode_number,posting_status,is_published,scheduled_for)
VALUES (lpad(to_hex(20),32,'0')::uuid,lpad(to_hex(20),32,'0')::uuid,
  1,'scheduled',false,'2020-01-02T00:00:00Z'::timestamptz);
ALTER TABLE public.libread_scheduled_episode_release_audit
  ADD CONSTRAINT simulate_audit_failure CHECK (released_count<0) NOT VALID;
SQL
if psql_fixture < /tmp/child84-scheduled-job.sql >/dev/null 2>&1; then
  echo "FAIL: audit constraint failure should abort episode UPDATE" >&2
  exit 1
fi
psql_fixture <<'SQL'
DO $verify$
BEGIN
 IF (SELECT posting_status FROM public.episodes WHERE right(id::text,12)::int=20) <> 'scheduled' THEN
   RAISE EXCEPTION 'SQL statement did not roll back on audit failure';
 END IF;
 IF (SELECT count(*) FROM public.libread_scheduled_episode_release_audit) <> 2 THEN
   RAISE EXCEPTION 'Failed audit mutated history';
 END IF;
END $verify$;
ALTER TABLE public.libread_scheduled_episode_release_audit DROP CONSTRAINT simulate_audit_failure;
SQL
psql_fixture < /tmp/child84-scheduled-job.sql
psql_fixture <<'SQL'
DO $verify$
BEGIN
 IF (SELECT posting_status FROM public.episodes WHERE right(id::text,12)::int=20) <> 'posted' THEN
   RAISE EXCEPTION 'Valid retry failed after audit repair';
 END IF;
 IF (SELECT released_count FROM public.libread_scheduled_episode_release_audit WHERE id=4) IS NOT NULL THEN
   RAISE EXCEPTION 'Unexpected additional audit';
 END IF;
 IF (SELECT released_count FROM public.libread_scheduled_episode_release_audit WHERE id=3) <> 1 THEN
   RAISE EXCEPTION 'Valid retry must release precisely one episode';
 END IF;
END $verify$;
SQL

# Test the database batch bound with >200 due episodes.
psql_fixture <<'SQL'
INSERT INTO public.episodes
  (id,series_id,episode_number,posting_status,is_published,scheduled_for)
SELECT lpad(to_hex(i),32,'0')::uuid,lpad(to_hex(i),32,'0')::uuid,
  1,'scheduled',false,'2020-01-02T00:00:00Z'::timestamptz
FROM generate_series(1000,1204) i;
SQL
psql_fixture < /tmp/child84-scheduled-job.sql
psql_fixture <<'SQL'
DO $verify$
BEGIN
 IF (SELECT released_count FROM public.libread_scheduled_episode_release_audit WHERE id=4) <> 200 THEN
   RAISE EXCEPTION '200-row cap failed';
 END IF;
 IF (SELECT count(*) FROM public.episodes WHERE posting_status='scheduled' AND right(id::text,12)::int>=1000)<>5 THEN
   RAISE EXCEPTION 'Wrong batch remainder';
 END IF;
END $verify$;
SQL
psql_fixture < /tmp/child84-scheduled-job.sql
psql_fixture <<'SQL'
DO $verify$
BEGIN
 IF (SELECT released_count FROM public.libread_scheduled_episode_release_audit WHERE id=5) <> 5 THEN
   RAISE EXCEPTION 'Five-row remainder count failed';
 END IF;
 IF (SELECT count(*) FROM public.episodes WHERE posting_status='scheduled' AND right(id::text,12)::int>=1000)<>0 THEN
   RAISE EXCEPTION 'Batch continuation missed due rows';
 END IF;
 IF (SELECT sum(released_count) FROM public.libread_scheduled_episode_release_audit)<>214 THEN
   RAISE EXCEPTION 'Aggregate counts wrong';
 END IF;
END $verify$;
SQL

echo "PASS: PostgreSQL 17 executes actual release SQL; order/gaps, transaction rollback, idempotence and 200-row batch bounds"
