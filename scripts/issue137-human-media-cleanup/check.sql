-- Issue #137 S2-1: disposable local PostgreSQL only (CI service container).
-- Never run against hosted Supabase. Applies H1 (already on hosted) and the
-- S2-1 migration UNCHANGED, then asserts owner-prefix validation, privileges,
-- the retry receipt rules and rollback.
\set ON_ERROR_STOP on
\set QUIET on

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
grant usage on schema public to anon, authenticated, service_role;

create table public.users (id uuid primary key, show_r18_content boolean, r18_confirmed_at timestamptz);
create table public.series (
  id uuid primary key, author_id uuid references public.users(id),
  publication_status text not null default 'public',
  recording_permission_mode text not null default 'open',
  content_rating text not null default 'general',
  content_warnings text[] not null default '{}'
);
create table public.episodes (
  id uuid primary key, series_id uuid not null references public.series(id) on delete cascade,
  posting_status text not null default 'posted', is_published boolean default true
);
create table public.user_recording_consents (
  user_id uuid not null references public.users(id), consent_key text not null,
  consent_version text not null, primary key (user_id, consent_key)
);
create table public.recordings (
  id uuid primary key default gen_random_uuid(),
  series_id uuid references public.series(id) on delete cascade,
  episode_id uuid references public.episodes(id) on delete cascade,
  reader_id uuid references public.users(id),
  reader_user_id uuid references public.users(id) on delete set null,
  reader_name text, audio_storage_path text, is_public boolean default true,
  voice_model_id uuid, created_at timestamptz not null default now()
);
create schema storage;
create table storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text, name text,
  owner uuid, metadata jsonb, unique (bucket_id, name)
);
grant usage on schema storage to service_role;
grant select, insert, update, delete on storage.objects to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;

create function public.t_expect(p_sql text, p_expected text) returns void
language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if position(p_expected in sqlerrm) = 0 then
      raise exception 'FAIL: expected % but got: %  [sql: %]', p_expected, sqlerrm, p_sql;
    end if;
    return;
  end;
  raise exception 'FAIL: expected % but statement succeeded [sql: %]', p_expected, p_sql;
end $$;
create function public.t_ok(p_cond boolean, p_msg text) returns void
language plpgsql as $$
begin
  if p_cond is distinct from true then raise exception 'FAIL: %', p_msg; end if;
end $$;

\i supabase/migrations/20261114120000_issue137_h1_human_atomic.sql
\i supabase/migrations/20261114140000_issue137_human_media_cleanup_pending.sql
\echo PASS 1: S2-1 migration applied on top of H1

-- Fixed IDs: series S, episode E, owner A, other owner B, other series S2.
-- S  = 10000000-0000-0000-0000-000000000001  E = 20000000-0000-0000-0000-000000000001
-- A  = 00000000-0000-0000-0000-00000000000a  B = 00000000-0000-0000-0000-00000000000b
-- S2 = 10000000-0000-0000-0000-000000000002

-- 2. Privileges.
select public.t_ok(not has_function_privilege(r, f, 'EXECUTE'), r || ' must not EXECUTE ' || f)
  from unnest(array['anon','authenticated']) r,
  unnest(array[
    'public.issue137_human_media_cleanup_record(uuid,uuid,uuid,text[],text)',
    'public.issue137_human_media_cleanup_pending(uuid,integer)',
    'public.issue137_human_media_cleanup_resolve(uuid,boolean)']) f;
select public.t_ok(not has_table_privilege(r, 'libread_internal.human_media_cleanup_pending', p),
  r || ' must not ' || p || ' the pending table')
  from unnest(array['anon','authenticated']) r, unnest(array['SELECT','INSERT','UPDATE','DELETE']) p;
set role authenticated;
select public.t_expect($q$select public.issue137_human_media_cleanup_pending(null, 10)$q$, 'permission denied');
reset role;
set role anon;
select public.t_expect($q$select public.issue137_human_media_cleanup_record(
  '00000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  array['human/10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-00000000000a/1-x/original.webm'],
  'delete')$q$, 'permission denied');
reset role;
\echo PASS 2: anon/authenticated cannot EXECUTE nor touch the pending table

-- 3. Record: only exact paths under the owner's prefix.
set role service_role;
create temp table t_rec as select public.issue137_human_media_cleanup_record(
  '00000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  array[
    'human/10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-00000000000a/1-x/playback-from-webm.m4a',
    'human/10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-00000000000a/1-x/original.webm',
    'human/10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-00000000000a/1-x/playback-from-webm.m4a.timing.json'],
  'delete') as id;
select public.t_ok((select count(*) from t_rec) = 1, 'valid record stored');
-- Another owner's path under A's record.
select public.t_expect($q$select public.issue137_human_media_cleanup_record(
  '00000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  array['human/10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-00000000000b/1-x/original.webm'],
  'delete')$q$, 'S21_PATH_OUTSIDE_OWNER_PREFIX');
-- Another series.
select public.t_expect($q$select public.issue137_human_media_cleanup_record(
  '00000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  array['human/10000000-0000-0000-0000-000000000002/20000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-00000000000a/1-x/original.webm'],
  'replace')$q$, 'S21_PATH_OUTSIDE_OWNER_PREFIX');
-- Traversal / nesting / prefix only / other namespace.
select public.t_expect(format($q$select public.issue137_human_media_cleanup_record(
  '00000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001', array[%L], 'delete')$q$, v),
  'S21_PATH_OUTSIDE_OWNER_PREFIX')
  from unnest(array[
    'human/10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-00000000000a/../00000000-0000-0000-0000-00000000000b/x.m4a',
    'human/10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-00000000000a/1-x/deeper/x.m4a',
    'human/10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-00000000000a/',
    'human-temp/10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-00000000000a/1-x/part-0001.webm']) v;
select public.t_expect($q$select public.issue137_human_media_cleanup_record(
  '00000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001', array[]::text[], 'delete')$q$, 'S21_BAD_INPUT');
select public.t_expect($q$select public.issue137_human_media_cleanup_record(
  '00000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  array['human/10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-00000000000a/1-x/original.webm'],
  'visibility')$q$, 'S21_BAD_INPUT');
reset role;
\echo PASS 3: record accepts only exact paths under the owner prefix

-- 4. Pending listing.
set role service_role;
select public.t_ok((select count(*) from public.issue137_human_media_cleanup_pending(
  '00000000-0000-0000-0000-00000000000a', 10)) = 1, 'A has 1 pending');
select public.t_ok((select count(*) from public.issue137_human_media_cleanup_pending(
  '00000000-0000-0000-0000-00000000000b', 10)) = 0, 'B sees none of A');
select public.t_ok((select count(*) from public.issue137_human_media_cleanup_pending(null, 10)) = 1,
  'operator sweep sees all');
reset role;
\echo PASS 4: pending is listed per owner (or all for an operator sweep)

-- 5. Resolve receipt.
insert into storage.objects(bucket_id, name) values ('human-recording-audio',
  'human/10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-00000000000a/1-x/original.webm');
set role service_role;
select public.t_ok(public.issue137_human_media_cleanup_resolve((select id from t_rec), false) = false,
  'reported failure is not resolved');
select public.t_ok(public.issue137_human_media_cleanup_resolve((select id from t_rec), true) = false,
  'claimed success with an object still present is not resolved');
reset role;
delete from storage.objects;
-- A row still referencing a listed path holds the receipt.
insert into public.recordings(audio_storage_path, voice_model_id) values (
  'human/10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-00000000000a/1-x/playback-from-webm.m4a',
  '40000000-0000-0000-0000-000000000001');
set role service_role;
select public.t_ok(public.issue137_human_media_cleanup_resolve((select id from t_rec), true) = false,
  'referenced path is not resolved');
reset role;
delete from public.recordings;
set role service_role;
select public.t_ok(public.issue137_human_media_cleanup_resolve((select id from t_rec), true) = true,
  'resolved once nothing remains');
select public.t_expect(format('select public.issue137_human_media_cleanup_resolve(%L, true)',
  (select id from t_rec)), 'S21_NOT_PENDING');
select public.t_ok((select attempts from libread_internal.human_media_cleanup_pending
  where id = (select id from t_rec)) = 4, 'every attempt counted');
select public.t_ok((select count(*) from public.issue137_human_media_cleanup_pending(null, 10)) = 0,
  'resolved rows are no longer pending');
reset role;
\echo PASS 5: resolve only when Storage and references are both clear

\i scripts/issue137-human-media-cleanup/rollback.sql
select public.t_ok(to_regclass('libread_internal.human_media_cleanup_pending') is null, 'table dropped');
select public.t_ok(to_regprocedure('public.issue137_human_media_cleanup_record(uuid,uuid,uuid,text[],text)') is null,
  'record RPC dropped');
select public.t_ok(to_regprocedure(
  'public.issue137_h1_human_commit(uuid,uuid,uuid,bigint,text,uuid,text,text,boolean,text,boolean)') is not null,
  'H1 untouched');
\echo PASS 6: rollback removes S2-1 only
\echo PASS: issue137 S2-1 human media cleanup migration
