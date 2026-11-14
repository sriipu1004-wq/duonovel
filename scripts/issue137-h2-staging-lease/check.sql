-- Issue #137 H2: disposable local PostgreSQL only (CI service container).
-- Never run against hosted Supabase. Builds the minimum table shapes, applies
-- H1 (already on hosted) and then the H2 migration UNCHANGED, and asserts
-- every lease state, the storage guard, privileges, retirement and rollback.
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
  id uuid primary key,
  series_id uuid not null references public.series(id) on delete cascade,
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
-- Minimal Supabase Storage shape.
create schema storage;
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text, name text, owner uuid, metadata jsonb,
  created_at timestamptz default now(),
  unique (bucket_id, name)
);
grant usage on schema storage to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to service_role;
-- Deliberately broad: proves the trigger, not grants/RLS, stops bearer writes.
grant select, insert, update, delete on storage.objects to authenticated;
grant select, insert, update, delete on all tables in schema public to service_role;

-- Fixture IDs by short key.
create table public.t_ids (k text primary key, id uuid not null);
insert into public.t_ids values
  ('A','00000000-0000-0000-0000-00000000000a'), ('B','00000000-0000-0000-0000-00000000000b'),
  ('C','00000000-0000-0000-0000-00000000000c'), ('D','00000000-0000-0000-0000-00000000000d'),
  ('S1','10000000-0000-0000-0000-000000000001'), ('S2','10000000-0000-0000-0000-000000000002'),
  ('S3','10000000-0000-0000-0000-000000000003'),
  ('E1','20000000-0000-0000-0000-000000000001'), ('E2','20000000-0000-0000-0000-000000000002'),
  ('E3','20000000-0000-0000-0000-000000000003'),
  ('L1','60000000-0000-0000-0000-000000000001'), ('L2','60000000-0000-0000-0000-000000000002'),
  ('L3','60000000-0000-0000-0000-000000000003'), ('L4','60000000-0000-0000-0000-000000000004'),
  ('L5','60000000-0000-0000-0000-000000000005'), ('L6','60000000-0000-0000-0000-000000000006'),
  ('L9','60000000-0000-0000-0000-000000000009');
grant select on public.t_ids to public;
create function public.i(p_k text) returns uuid language sql stable
  as $$ select id from public.t_ids where k = p_k $$;
create function public.p(s text, e text, a text, l text, n int, ext text default 'webm')
  returns text language sql stable as $$
  select 'human-temp/' || public.i(s) || '/' || public.i(e) || '/' || public.i(a) || '/'
    || public.i(l) || '/part-' || lpad(n::text, 4, '0') || '.' || ext $$;
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
-- Shorthands (9 MiB -> 2 parts of 8 MiB). Bodies reference objects the
-- migrations create below, so body validation is deferred to call time.
set check_function_bodies = off;
create function public.t_open(l text, s text, e text, a text, total bigint default 9437184,
  parts int default 2, ext text default 'webm') returns boolean language sql as $$
  select public.issue137_h2_stage_open(public.i(l), public.i(s), public.i(e), public.i(a), ext, total, parts) $$;
create function public.t_close(l text, s text, e text, a text, mode text,
  total bigint default 9437184, ext text default 'webm') returns boolean language sql as $$
  select public.issue137_h2_stage_close(public.i(l), public.i(s), public.i(e), public.i(a), ext, total, mode) $$;
create function public.t_put(path text, bucket text default 'human-recording-audio')
  returns void language sql as $$
  insert into storage.objects(bucket_id, name, metadata) values (bucket, path, '{}'::jsonb) $$;

reset check_function_bodies;
insert into public.users(id, show_r18_content, r18_confirmed_at)
  select public.i(k), false, null from unnest(array['A','B','C','D']) k;
insert into public.series(id, author_id) values (public.i('S1'), public.i('C'));
insert into public.series(id, author_id, content_rating) values (public.i('S2'), public.i('C'), 'r18');
insert into public.series(id, author_id, publication_status) values (public.i('S3'), public.i('C'), 'private');
insert into public.episodes(id, series_id) values
  (public.i('E1'), public.i('S1')), (public.i('E2'), public.i('S2'));
insert into public.episodes(id, series_id, posting_status, is_published) values
  (public.i('E3'), public.i('S3'), 'draft', false);
insert into public.user_recording_consents
  select public.i(k), 'recording_studio_global', '2026-04-16' from unnest(array['A','B','C']) k;

-- H1 is already applied on hosted; H2 builds on its schema.
\i supabase/migrations/20261114120000_issue137_h1_human_atomic.sql
\i supabase/migrations/20261114130000_issue137_h2_human_staging_lease.sql
\echo PASS 1: H2 migration applied on top of H1 (no B2)

-- These helpers are test-only and run the RPCs through service_role grants.
grant execute on function public.t_open(text,text,text,text,bigint,int,text),
  public.t_close(text,text,text,text,text,bigint,text) to service_role;

-- 2. Privileges.
select public.t_ok(not has_function_privilege(r, f, 'EXECUTE'), r || ' must not EXECUTE ' || f)
  from unnest(array['anon','authenticated']) r,
  unnest(array[
    'public.issue137_h2_stage_open(uuid,uuid,uuid,uuid,text,bigint,integer)',
    'public.issue137_h2_stage_close(uuid,uuid,uuid,uuid,text,bigint,text)',
    'public.issue137_h2_stage_retire_candidates(uuid,integer)',
    'public.issue137_h2_stage_claim_retirement(uuid)',
    'public.issue137_h2_stage_finish_retirement(uuid)',
    'libread_internal.h2_source_is_staging_eligible(uuid,uuid,uuid)',
    'libread_internal.h2_guard_human_temp_storage()']) f;
select public.t_ok(not has_table_privilege(r, 'libread_internal.h2_human_stage_lease', p),
  r || ' must not ' || p || ' the lease table')
  from unnest(array['anon','authenticated']) r, unnest(array['SELECT','INSERT','UPDATE','DELETE']) p;
select public.t_ok(not has_schema_privilege(r, 'libread_internal', 'USAGE'),
  r || ' must not use libread_internal') from unnest(array['anon','authenticated']) r;
select public.t_ok(has_function_privilege('service_role',
  'public.issue137_h2_stage_open(uuid,uuid,uuid,uuid,text,bigint,integer)', 'EXECUTE'),
  'service_role can open');
set role authenticated;
select public.t_expect($q$select public.issue137_h2_stage_open(public.i('L9'),public.i('S1'),
  public.i('E1'),public.i('A'),'webm',9437184,2)$q$, 'permission denied');
select public.t_expect($q$select * from libread_internal.h2_human_stage_lease$q$, 'permission denied');
reset role;
set role anon;
select public.t_expect($q$select public.issue137_h2_stage_close(public.i('L9'),public.i('S1'),
  public.i('E1'),public.i('A'),'webm',9437184,'abort')$q$, 'permission denied');
reset role;
\echo PASS 2: anon/authenticated cannot EXECUTE H2 RPCs nor touch the lease table

-- 3. Open: eligibility, input shape, reuse.
set role service_role;
select public.t_ok(public.t_open('L1','S1','E1','A'), 'A opens L1 on public S1/E1');
select public.t_expect($q$select public.t_open('L1','S1','E1','A')$q$, 'H2_STAGE_SESSION_REUSED');
select public.t_expect($q$select public.t_open('L1','S1','E1','B')$q$, 'H2_STAGE_SESSION_REUSED');
select public.t_expect($q$select public.t_open('L9','S1','E1','A', 9437184, 3)$q$, 'H2_STAGE_BAD_INPUT');
select public.t_expect($q$select public.t_open('L9','S1','E1','A', 1000, 1)$q$, 'H2_STAGE_BAD_INPUT');
select public.t_expect($q$select public.t_open('L9','S1','E1','A', 9437184, 2, 'WEBM')$q$, 'H2_STAGE_BAD_INPUT');
select public.t_expect($q$select public.t_open('L9','S1','E1','D')$q$, 'H2_STAGE_SOURCE_OR_CONSENT_DENIED');
select public.t_expect($q$select public.t_open('L9','S2','E2','B')$q$, 'H2_STAGE_SOURCE_OR_CONSENT_DENIED');
select public.t_expect($q$select public.t_open('L9','S3','E3','A')$q$, 'H2_STAGE_SOURCE_OR_CONSENT_DENIED');
select public.t_expect($q$select public.t_open('L9','S1','E2','A')$q$, 'H2_STAGE_SOURCE_OR_CONSENT_DENIED');
reset role;
-- The series author may stage on their own draft; an R18-confirmed reader on R18.
update public.users set show_r18_content = true, r18_confirmed_at = now() where id = public.i('B');
set role service_role;
select public.t_ok(public.t_open('L2','S3','E3','C'), 'author stages on own draft');
select public.t_ok(public.t_open('L3','S2','E2','B'), 'R18-confirmed reader stages on R18');
reset role;
\echo PASS 3: open requires eligible source/consent/R18, exact shape, and a fresh session

-- 4. Storage guard on the ACTIVE lease L1 (A, S1/E1, 2 parts, webm).
set role authenticated;
select public.t_put(public.p('S1','E1','A','L1',1));
reset role;
set role service_role;
select public.t_put(public.p('S1','E1','A','L1',2));
select public.t_expect($q$select public.t_put(public.p('S1','E1','A','L1',3))$q$, 'H2_STAGE_LEASE_REVOKED');
select public.t_expect($q$select public.t_put(public.p('S1','E1','A','L1',2,'mp3'))$q$, 'H2_STAGE_LEASE_REVOKED');
select public.t_expect($q$select public.t_put(public.p('S1','E1','B','L1',1))$q$, 'H2_STAGE_LEASE_REVOKED');
select public.t_expect($q$select public.t_put(public.p('S1','E2','A','L1',1))$q$, 'H2_STAGE_LEASE_REVOKED');
select public.t_expect($q$select public.t_put(public.p('S1','E1','A','L9',1))$q$, 'H2_STAGE_LEASE_REVOKED');
select public.t_expect($q$select public.t_put('human-temp/x/y/z/w/part-0001.webm')$q$, 'H2_STAGE_PATH_INVALID');
select public.t_expect($q$select public.t_put(public.p('S1','E1','A','L1',1) || '/nested')$q$, 'H2_STAGE_PATH_INVALID');
select public.t_expect($q$update storage.objects set name = name || 'x'
  where name = public.p('S1','E1','A','L1',1)$q$, 'H2_STAGE_PATH_IMMUTABLE');
select public.t_expect($q$select public.t_put('human/' || public.i('S1') || '/' || public.i('E1') || '/'
  || public.i('A') || '/' || public.i('L1') || '/part-0001.webm')$q$, 'H2_LEGACY_MULTIPART_NEW_WRITE_HOLD');
-- Final media and other buckets are not affected.
select public.t_put('human/' || public.i('S1') || '/' || public.i('E1') || '/' || public.i('A')
  || '/1-x/playback-from-webm.m4a');
select public.t_put(public.p('S1','E1','A','L9',1), 'other-bucket');
reset role;
\echo PASS 4: storage guard admits only exact parts of an ACTIVE owned lease

-- 5. Revocation while ACTIVE: consent withdrawal, permission close, unpublish.
update public.user_recording_consents set consent_version = 'withdrawn' where user_id = public.i('B');
set role service_role;
select public.t_expect($q$select public.t_put(public.p('S2','E2','B','L3',1))$q$, 'H2_STAGE_LEASE_REVOKED');
select public.t_expect($q$select public.t_close('L3','S2','E2','B','seal')$q$, 'H2_STAGE_REVOKED');
reset role;
update public.user_recording_consents set consent_version = '2026-04-16' where user_id = public.i('B');
update public.users set r18_confirmed_at = null where id = public.i('B');
set role service_role;
select public.t_expect($q$select public.t_put(public.p('S2','E2','B','L3',1))$q$, 'H2_STAGE_LEASE_REVOKED');
-- Abort still works on a revoked source.
select public.t_ok(public.t_close('L3','S2','E2','B','abort'), 'abort works after revocation');
reset role;
\echo PASS 5: consent / R18 revocation blocks bearer writes and seal; abort still works

-- 6. Close: foreign owner, unknown session, seal, reuse after close.
set role service_role;
select public.t_expect($q$select public.t_close('L1','S1','E1','B','seal')$q$, 'H2_STAGE_NOT_FOUND_OR_NOT_OWNER');
select public.t_expect($q$select public.t_close('L1','S1','E1','B','abort')$q$, 'H2_STAGE_NOT_FOUND_OR_NOT_OWNER');
select public.t_expect($q$select public.t_close('L9','S1','E1','A','seal')$q$, 'H2_STAGE_NOT_FOUND_OR_NOT_OWNER');
select public.t_expect($q$select public.t_close('L1','S1','E1','A','seal', 9437185)$q$, 'H2_STAGE_NOT_FOUND_OR_NOT_OWNER');
select public.t_expect($q$select public.t_close('L1','S1','E1','A','publish')$q$, 'H2_STAGE_INVALID_CLOSE_MODE');
select public.t_ok(public.t_close('L1','S1','E1','A','seal'), 'A seals L1');
select public.t_expect($q$select public.t_close('L1','S1','E1','A','seal')$q$, 'H2_STAGE_ALREADY_CLOSED');
select public.t_expect($q$select public.t_close('L1','S1','E1','A','abort')$q$, 'H2_STAGE_ALREADY_CLOSED');
reset role;
-- An old bearer cannot write after the seal (part 1 was removed, re-upload denied).
delete from storage.objects where name = public.p('S1','E1','A','L1',1);
set role authenticated;
select public.t_expect($q$select public.t_put(public.p('S1','E1','A','L1',1))$q$, 'H2_STAGE_LEASE_REVOKED');
reset role;
set role service_role;
select public.t_expect($q$select public.t_put(public.p('S3','E3','C','L3',1))$q$, 'H2_STAGE_LEASE_REVOKED');
reset role;
\echo PASS 6: foreign/unknown/mismatched close is rejected; sealed/aborted leases reject writes and reuse

-- 7. Expiry.
set role service_role;
select public.t_ok(public.t_open('L4','S1','E1','A'), 'A opens L4');
reset role;
update libread_internal.h2_human_stage_lease
  set expires_at = clock_timestamp() - interval '1 minute' where session_id = public.i('L4');
set role service_role;
select public.t_expect($q$select public.t_put(public.p('S1','E1','A','L4',1))$q$, 'H2_STAGE_LEASE_REVOKED');
select public.t_expect($q$select public.t_close('L4','S1','E1','A','seal')$q$, 'H2_STAGE_EXPIRED');
reset role;
\echo PASS 7: expired lease rejects writes and seal

-- 8. Retirement: too early, actor scoping, reference hold, physical receipt.
set role service_role;
select public.t_ok((select count(*) from public.issue137_h2_stage_retire_candidates(null, 20)) = 0,
  'nothing matured yet');
select public.t_expect($q$select public.issue137_h2_stage_claim_retirement(public.i('L1'))$q$,
  'H2_STAGE_RETIRE_TOO_EARLY_OR_NOT_ELIGIBLE');
reset role;
update libread_internal.h2_human_stage_lease
  set expires_at = clock_timestamp() - interval '2 hours',
      retire_after = clock_timestamp() - interval '1 minute'
  where session_id in (public.i('L1'), public.i('L4'), public.i('L3'));
set role service_role;
select public.t_ok((select count(*) from public.issue137_h2_stage_retire_candidates(public.i('A'), 20)) = 2,
  'A sees its 2 matured leases (sealed L1, expired-active L4)');
select public.t_ok((select count(*) from public.issue137_h2_stage_retire_candidates(public.i('B'), 20)) = 1,
  'B sees only its own aborted L3');
-- Active, unexpired L2 is never a candidate.
select public.t_ok(not exists (select 1 from public.issue137_h2_stage_retire_candidates(null, 100)
  where session_id = public.i('L2')), 'active unexpired lease is not retired');
reset role;
-- A recording referencing the temp prefix holds retirement.
insert into public.recordings(series_id, episode_id, reader_id, reader_name, audio_storage_path)
  values (public.i('S1'), public.i('E1'), public.i('A'), 'A', public.p('S1','E1','A','L4',1));
set role service_role;
select public.t_expect($q$select public.issue137_h2_stage_claim_retirement(public.i('L4'))$q$,
  'H2_STAGE_RECORDING_REFERENCE_HOLD');
select public.t_ok(public.issue137_h2_stage_claim_retirement(public.i('L1')), 'claim L1');
-- Claimed lease rejects writes too.
select public.t_expect($q$select public.t_put(public.p('S1','E1','A','L1',1))$q$, 'H2_STAGE_LEASE_REVOKED');
-- Part 2 still exists: no receipt.
select public.t_expect($q$select public.issue137_h2_stage_finish_retirement(public.i('L1'))$q$,
  'H2_STAGE_PHYSICAL_OR_REFERENCE_REMAINS');
reset role;
-- (Storage API remove of the exact part paths.)
delete from storage.objects where name = public.p('S1','E1','A','L1',2);
set role service_role;
select public.t_ok(public.issue137_h2_stage_finish_retirement(public.i('L1')), 'finish L1 after removal');
select public.t_expect($q$select public.issue137_h2_stage_finish_retirement(public.i('L1'))$q$,
  'H2_STAGE_NOT_RETIRING');
select public.t_ok((select state from libread_internal.h2_human_stage_lease
  where session_id = public.i('L1')) = 'retired', 'L1 retired');
reset role;
\echo PASS 8: retirement only for matured leases of the actor, with reference hold and physical receipt

-- 9. Rollback leaves H1 intact and removes all H2 objects.
\i scripts/issue137-h2-staging-lease/rollback.sql
select public.t_ok(not exists (select 1 from pg_trigger where tgname = 'issue137_h2_stage_storage_guard'),
  'storage trigger dropped');
select public.t_ok(to_regclass('libread_internal.h2_human_stage_lease') is null, 'lease table dropped');
select public.t_ok(to_regprocedure('public.issue137_h2_stage_open(uuid,uuid,uuid,uuid,text,bigint,integer)') is null,
  'open RPC dropped');
select public.t_ok(to_regprocedure(
  'public.issue137_h1_human_commit(uuid,uuid,uuid,bigint,text,uuid,text,text,boolean,text,boolean)') is not null,
  'H1 untouched');
select public.t_put('human-temp/anything');
\echo PASS 9: rollback removes H2 only
\echo PASS: issue137 H2 human staging lease migration
