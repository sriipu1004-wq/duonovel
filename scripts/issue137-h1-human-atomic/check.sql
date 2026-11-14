-- Issue #137 H1: disposable local PostgreSQL only (CI service container).
-- Never run against hosted Supabase. Builds the minimum table shapes the
-- migration touches, applies the migration UNCHANGED, then asserts the
-- guard trigger, the four RPC actions, revision CAS, owner isolation and
-- EXECUTE privileges, and finally exercises the two-stage rollback.
\set ON_ERROR_STOP on
\set QUIET on

-- Supabase-like roles. service_role bypasses RLS like the hosted role.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
grant usage on schema public to anon, authenticated, service_role;

-- Minimal shapes (columns confirmed on hosted 2026-11-14, read-only).
create table public.users (
  id uuid primary key,
  show_r18_content boolean,
  r18_confirmed_at timestamptz
);
create table public.series (
  id uuid primary key,
  author_id uuid references public.users(id),
  publication_status text not null default 'public',
  recording_permission_mode text not null default 'open',
  content_rating text not null default 'general',
  content_warnings text[] not null default '{}'
);
create table public.episodes (
  id uuid primary key,
  series_id uuid not null references public.series(id) on delete cascade,
  posting_status text not null default 'posted',
  is_published boolean default true
);
create table public.user_recording_consents (
  user_id uuid not null references public.users(id),
  consent_key text not null,
  consent_version text not null,
  primary key (user_id, consent_key)
);
create table public.recordings (
  id uuid primary key default gen_random_uuid(),
  series_id uuid references public.series(id) on delete cascade,
  episode_id uuid references public.episodes(id) on delete cascade,
  reader_id uuid references public.users(id),
  reader_user_id uuid references public.users(id) on delete set null,
  reader_name text,
  audio_storage_path text,
  is_public boolean default true,
  voice_model_id uuid,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on all tables in schema public to service_role;
-- Deliberately broad: proves the trigger, not table grants, stops Human writes.
grant select, insert, update, delete on public.recordings to authenticated;

-- Test helpers (public, invoker rights: they run as the current role).
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

-- Fixtures. A, B = narrators, C = author, D = extra user.
insert into public.users(id, show_r18_content, r18_confirmed_at) values
  ('00000000-0000-0000-0000-00000000000a', false, null),
  ('00000000-0000-0000-0000-00000000000b', false, null),
  ('00000000-0000-0000-0000-00000000000c', false, null),
  ('00000000-0000-0000-0000-00000000000d', false, null);
insert into public.series(id, author_id) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000c');
insert into public.series(id, author_id, content_rating) values
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000c', 'r18');
insert into public.episodes(id, series_id) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002'),
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001');
insert into public.user_recording_consents values
  ('00000000-0000-0000-0000-00000000000a', 'recording_studio_global', '2026-04-16'),
  ('00000000-0000-0000-0000-00000000000b', 'recording_studio_global', '2026-04-16');

-- The migration under test, unchanged.
\i supabase/migrations/20261114120000_issue137_h1_human_atomic.sql
\echo PASS 1: migration applied to a bare schema (no B2, no libread_internal beforehand)

-- 2. EXECUTE / USAGE privileges.
select public.t_ok(not has_function_privilege(r,
  'public.issue137_h1_human_commit(uuid,uuid,uuid,bigint,text,uuid,text,text,boolean,text,boolean)',
  'EXECUTE'), r || ' must not EXECUTE issue137_h1_human_commit')
  from unnest(array['anon','authenticated']) r;
select public.t_ok(not has_function_privilege(r,
  'public.issue137_h1_human_revision(uuid,uuid,uuid)', 'EXECUTE'),
  r || ' must not EXECUTE issue137_h1_human_revision')
  from unnest(array['anon','authenticated']) r;
select public.t_ok(not has_schema_privilege(r, 'libread_internal', 'USAGE'),
  r || ' must not have USAGE on libread_internal')
  from unnest(array['anon','authenticated']) r;
select public.t_ok(has_function_privilege('service_role',
  'public.issue137_h1_human_commit(uuid,uuid,uuid,bigint,text,uuid,text,text,boolean,text,boolean)',
  'EXECUTE'), 'service_role must EXECUTE issue137_h1_human_commit');
set role authenticated;
select public.t_expect($q$select public.issue137_h1_human_commit(
  '10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-00000000000a',0,'delete_all')$q$, 'permission denied');
select public.t_expect($q$select public.issue137_h1_human_revision(
  '10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-00000000000a')$q$, 'permission denied');
reset role;
set role anon;
select public.t_expect($q$select public.issue137_h1_human_commit(
  '10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-00000000000a',0,'delete_all')$q$, 'permission denied');
reset role;
\echo PASS 2: anon/authenticated cannot EXECUTE the RPCs nor use libread_internal

-- 3. Direct Human writes are blocked for every role (incl. superuser).
set role authenticated;
select public.t_expect($q$insert into public.recordings
  (series_id,episode_id,reader_id,reader_name,audio_storage_path,is_public)
  values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-00000000000a','A',
  'human/10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-00000000000a/1-x/playback-from-webm.m4a',
  true)$q$, 'H1_ATOMIC_RPC_REQUIRED');
reset role;
set role service_role;
select public.t_expect($q$insert into public.recordings
  (series_id,episode_id,reader_id,reader_name,audio_storage_path,is_public)
  values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-00000000000a','A','human/x/y/z/1-x/playback-from-webm.m4a',true)$q$,
  'H1_ATOMIC_RPC_REQUIRED');
-- The broad guard: omitting reader_name/reader_id does not escape it.
select public.t_expect($q$insert into public.recordings
  (series_id,episode_id,audio_storage_path,is_public)
  values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
  'human/x/y/z/1-x/playback-from-webm.m4a',true)$q$, 'H1_ATOMIC_RPC_REQUIRED');
-- A legacy public URL with a /human/ segment is guarded too.
select public.t_expect($q$insert into public.recordings
  (series_id,episode_id,reader_id,reader_name,audio_storage_path)
  values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-00000000000a','A',
  'https://x.supabase.co/storage/v1/object/public/recording-audio/human/a/b/c/p.m4a')$q$,
  'H1_ATOMIC_RPC_REQUIRED');
reset role;
select public.t_expect($q$insert into public.recordings
  (series_id,episode_id,reader_id,reader_name,audio_storage_path)
  values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-00000000000a','A','human/x/y/z/1-x/playback-from-webm.m4a')$q$,
  'H1_ATOMIC_RPC_REQUIRED');
\echo PASS 3: direct Human INSERT is blocked (authenticated, service_role, superuser)

-- 4. AI / TTS rows are not guarded (authenticated and service_role).
set role authenticated;
insert into public.recordings
  (id,series_id,episode_id,reader_id,reader_name,audio_storage_path,voice_model_id)
  values ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000c',
  'Aivis X','aivis/s/e/a.m4a','40000000-0000-0000-0000-000000000001');
-- Even a voice-model row stored under a human-looking path is an AI row.
insert into public.recordings
  (id,series_id,episode_id,reader_id,reader_name,audio_storage_path,voice_model_id)
  values ('30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000c',
  'Aivis Y','human/s/e/u/x/playback-from-wav.m4a','40000000-0000-0000-0000-000000000001');
update public.recordings set is_public = false where id = '30000000-0000-0000-0000-000000000001';
delete from public.recordings where id = '30000000-0000-0000-0000-000000000002';
reset role;
set role service_role;
-- NeMo/TTS rows: no voice_model_id but a non-human path.
insert into public.recordings
  (id,series_id,episode_id,reader_id,reader_name,audio_storage_path)
  values ('30000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000c',
  'NeMo','nemo/s/e/a.m4a');
update public.recordings set reader_name = 'NeMo 2' where id = '30000000-0000-0000-0000-000000000003';
delete from public.recordings where id = '30000000-0000-0000-0000-000000000003';
reset role;
select public.t_ok((select count(*) from public.recordings) = 1, 'AI row state after AI writes');
\echo PASS 4: AI (voice_model_id) and TTS (non-human path) rows are not guarded

-- 5. The four RPC actions, as service_role.
set role service_role;
select public.t_ok(public.issue137_h1_human_revision(
  '10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-00000000000a') = 0, 'absent scope is revision 0');
-- insert
select public.t_ok((public.issue137_h1_human_commit(
  '10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-00000000000a', 0, 'insert',
  '50000000-0000-0000-0000-00000000000a', 'Narrator A',
  'human/10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-00000000000a/1-aaa/playback-from-webm.m4a',
  true) ->> 'revision')::bigint = 1, 'insert returns revision 1');
select public.t_ok(exists (select 1 from public.recordings where id='50000000-0000-0000-0000-00000000000a'
  and reader_name='Narrator A' and is_public and voice_model_id is null), 'insert wrote the Human row');
-- replace (new take, renamed narrator; CAS on the prior path and flag)
select public.t_ok((public.issue137_h1_human_commit(
  '10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-00000000000a', 1, 'replace',
  '50000000-0000-0000-0000-00000000000a', 'Narrator A2',
  'human/10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-00000000000a/2-bbb/playback-from-wav.m4a',
  true,
  'human/10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-00000000000a/1-aaa/playback-from-webm.m4a',
  true) ->> 'revision')::bigint = 2, 'replace returns revision 2');
select public.t_ok(exists (select 1 from public.recordings where id='50000000-0000-0000-0000-00000000000a'
  and reader_name='Narrator A2' and audio_storage_path like '%/2-bbb/%'), 'replace updated path and name');
-- visibility
select public.t_ok((public.issue137_h1_human_commit(
  '10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-00000000000a', 2, 'visibility',
  '50000000-0000-0000-0000-00000000000a', null, null, false) ->> 'revision')::bigint = 3,
  'visibility returns revision 3');
select public.t_ok((select is_public from public.recordings
  where id='50000000-0000-0000-0000-00000000000a') = false, 'visibility set is_public=false');
reset role;
\echo PASS 5a: insert / replace / visibility through the RPC

-- 6. Revision mismatch is rejected (stale and future), with no side effect.
set role service_role;
select public.t_expect($q$select public.issue137_h1_human_commit(
  '10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-00000000000a', 2, 'visibility',
  '50000000-0000-0000-0000-00000000000a', null, null, true)$q$, 'H1_STALE_REVISION');
select public.t_expect($q$select public.issue137_h1_human_commit(
  '10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-00000000000a', 99, 'delete_all')$q$, 'H1_STALE_REVISION');
-- Replace CAS: correct revision but a stale prior path is a row conflict.
select public.t_expect($q$select public.issue137_h1_human_commit(
  '10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-00000000000a', 3, 'replace',
  '50000000-0000-0000-0000-00000000000a', 'Narrator A2',
  'human/10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-00000000000a/3-ccc/playback-from-wav.m4a',
  false,
  'human/10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-00000000000a/1-aaa/playback-from-webm.m4a',
  false)$q$, 'H1_OWNER_OR_ROW_CONFLICT');
-- A default-public new take cannot silently re-publish a private row.
select public.t_expect($q$select public.issue137_h1_human_commit(
  '10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-00000000000a', 3, 'replace',
  '50000000-0000-0000-0000-00000000000a', 'Narrator A2',
  'human/10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-00000000000a/3-ccc/playback-from-wav.m4a',
  true,
  'human/10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-00000000000a/2-bbb/playback-from-wav.m4a',
  false)$q$, 'H1_PRIVATE_REPUBLISH_DENIED');
select public.t_ok(public.issue137_h1_human_revision(
  '10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-00000000000a') = 3, 'failed commits must not bump revision');
reset role;
\echo PASS 6: revision mismatch, replace CAS and private re-publish are rejected

-- 7. Another owner's ID cannot be used to write A's row or A's path.
set role service_role;
-- B at B's own (fresh) revision cannot flip, replace or delete A's row.
select public.t_expect($q$select public.issue137_h1_human_commit(
  '10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-00000000000b', 0, 'visibility',
  '50000000-0000-0000-0000-00000000000a', null, null, false)$q$, 'H1_OWNER_OR_ROW_CONFLICT');
select public.t_expect($q$select public.issue137_h1_human_commit(
  '10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-00000000000b', 0, 'replace',
  '50000000-0000-0000-0000-00000000000a', 'B',
  'human/10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-00000000000b/9-bbb/playback-from-wav.m4a',
  false,
  'human/10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-00000000000a/2-bbb/playback-from-wav.m4a',
  false)$q$, 'H1_OWNER_OR_ROW_CONFLICT');
select public.t_expect($q$select public.issue137_h1_human_commit(
  '10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-00000000000b', 0, 'delete_all')$q$, 'H1_OWNER_OR_ROW_CONFLICT');
-- B cannot insert a row under A's storage path.
select public.t_expect($q$select public.issue137_h1_human_commit(
  '10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-00000000000b', 0, 'insert',
  '50000000-0000-0000-0000-00000000000b', 'B',
  'human/10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-00000000000a/9-bbb/playback-from-wav.m4a',
  false)$q$, 'H1_BAD_HUMAN_PATH_OR_INPUT');
-- The marker is scoped: a direct write after B's failed calls is still blocked.
select public.t_expect($q$update public.recordings set is_public = true
  where id = '50000000-0000-0000-0000-00000000000a'$q$, 'H1_ATOMIC_RPC_REQUIRED');
reset role;
select public.t_ok((select is_public = false and reader_id = '00000000-0000-0000-0000-00000000000a'
  from public.recordings where id = '50000000-0000-0000-0000-00000000000a'),
  'A row unchanged by B attempts');
-- A forged marker for B's scope does not open A's row.
begin;
select pg_catalog.set_config('libread.h1_atomic_scope',
  '10000000-0000-0000-0000-000000000001:20000000-0000-0000-0000-000000000001:00000000-0000-0000-0000-00000000000b', true);
select public.t_expect($q$delete from public.recordings
  where id = '50000000-0000-0000-0000-00000000000a'$q$, 'H1_ATOMIC_RPC_REQUIRED');
commit;
\echo PASS 7: another owner_id cannot write, replace, flip or delete A's Human row

-- 8. Consent / R18 / permission checks inside the commit RPC.
set role service_role;
-- D has no consent.
select public.t_expect($q$select public.issue137_h1_human_commit(
  '10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-00000000000d', 0, 'insert',
  '50000000-0000-0000-0000-00000000000d', 'D',
  'human/10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-00000000000d/1-ddd/playback-from-wav.m4a',
  false)$q$, 'H2_CONSENT_REVOKED');
-- B has consent but no R18 confirmation, on an R18 series.
select public.t_expect($q$select public.issue137_h1_human_commit(
  '10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-00000000000b', 0, 'insert',
  '50000000-0000-0000-0000-00000000000b', 'B',
  'human/10000000-0000-0000-0000-000000000002/20000000-0000-0000-0000-000000000002/00000000-0000-0000-0000-00000000000b/1-bbb/playback-from-wav.m4a',
  false)$q$, 'H2_R18_REVOKED');
-- Episode from another series.
select public.t_expect($q$select public.issue137_h1_human_commit(
  '10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-00000000000b', 0, 'insert',
  '50000000-0000-0000-0000-00000000000b', 'B',
  'human/10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000002/00000000-0000-0000-0000-00000000000b/1-bbb/playback-from-wav.m4a',
  false)$q$, 'H2_PERMISSION_REVOKED');
reset role;
update public.series set recording_permission_mode = 'closed'
  where id = '10000000-0000-0000-0000-000000000001';
set role service_role;
select public.t_expect($q$select public.issue137_h1_human_commit(
  '10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-00000000000a', 3, 'visibility',
  '50000000-0000-0000-0000-00000000000a', null, null, true)$q$, 'H2_PERMISSION_REVOKED');
reset role;
\echo PASS 8: consent, R18 and recording-permission checks reject the commit

-- 5b. delete_all still works after permission revocation (owner withdrawal).
set role service_role;
select public.t_ok((public.issue137_h1_human_commit(
  '10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-00000000000a', 3, 'delete_all') ->> 'deleted_count')::int = 1,
  'delete_all deletes the one Human row');
select public.t_ok(not exists (select 1 from public.recordings
  where id = '50000000-0000-0000-0000-00000000000a'), 'Human row gone after delete_all');
select public.t_ok(public.issue137_h1_human_revision(
  '10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-00000000000a') = 4, 'revision persists after deletion (4)');
reset role;
\echo PASS 5b: delete_all through the RPC (even after permission revocation)

-- 9. Parent deletions still cascade through the guard.
update public.series set recording_permission_mode = 'open'
  where id = '10000000-0000-0000-0000-000000000001';
set role service_role;
select public.issue137_h1_human_commit(
  '10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-00000000000a', 0, 'insert',
  '50000000-0000-0000-0000-0000000000a3', 'Narrator A',
  'human/10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000003/00000000-0000-0000-0000-00000000000a/1-eee/playback-from-wav.m4a',
  true);
reset role;
-- Seed a legacy alias row (reader_user_id) the only way possible: inside a
-- transaction holding the scope marker (as the RPC does).
begin;
select pg_catalog.set_config('libread.h1_atomic_scope',
  '10000000-0000-0000-0000-000000000001:20000000-0000-0000-0000-000000000001:00000000-0000-0000-0000-00000000000b', true);
insert into public.recordings(id,series_id,episode_id,reader_id,reader_user_id,reader_name,audio_storage_path)
  values ('50000000-0000-0000-0000-0000000000b1','10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000b',
  '00000000-0000-0000-0000-00000000000d','B',
  'human/10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-00000000000b/1-bbb/playback-from-wav.m4a');
commit;
delete from public.users where id = '00000000-0000-0000-0000-00000000000d';
select public.t_ok((select reader_user_id is null from public.recordings
  where id = '50000000-0000-0000-0000-0000000000b1'), 'ON DELETE SET NULL passes the guard');
delete from public.episodes where id = '20000000-0000-0000-0000-000000000003';
select public.t_ok(not exists (select 1 from public.recordings
  where id = '50000000-0000-0000-0000-0000000000a3'), 'episode delete cascades Human rows');
delete from public.series where id = '10000000-0000-0000-0000-000000000001';
select public.t_ok(not exists (select 1 from public.recordings), 'series delete cascades all rows');
\echo PASS 9: ON DELETE CASCADE / SET NULL from parents are not blocked

-- 10. Rollback stage 1 (trigger only), then stage 2 (all objects).
\i scripts/issue137-h1-human-atomic/rollback-1-drop-trigger.sql
select public.t_ok(not exists (select 1 from pg_trigger
  where tgname = 'issue137_h1_human_atomic_guard'), 'trigger dropped');
select public.t_ok(to_regprocedure(
  'public.issue137_h1_human_commit(uuid,uuid,uuid,bigint,text,uuid,text,text,boolean,text,boolean)')
  is not null, 'RPC survives stage 1');
set role service_role;
insert into public.recordings(series_id,episode_id,reader_id,reader_name,audio_storage_path)
  values ('10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-00000000000a','A','human/a/b/c/1-x/playback-from-wav.m4a');
reset role;
\i scripts/issue137-h1-human-atomic/rollback-2-drop-objects.sql
select public.t_ok(to_regnamespace('libread_internal') is null, 'schema dropped');
select public.t_ok(to_regprocedure('public.issue137_h1_human_revision(uuid,uuid,uuid)') is null,
  'revision RPC dropped');
\echo PASS 10: two-stage rollback restores direct writes and removes all H1 objects
\echo PASS: issue137 H1 human atomic migration
