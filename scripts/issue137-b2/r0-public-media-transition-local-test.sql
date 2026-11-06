\set ON_ERROR_STOP on
-- Postgres 17 disposable contract: NO Supabase credentials or live SQL.
-- Synthetic IDs only. This does NOT measure hosted Storage/CDN or real byte transfer.
create role anon nologin;
create role authenticated nologin;
create schema storage;
create table public.series (
 id uuid primary key, publication_status text, content_rating text,
 content_warnings text[] default '{}'::text[]
);
create table public.episodes (
 id uuid primary key, series_id uuid, posting_status text, is_published boolean
);
create table public.recordings (
 id uuid primary key, series_id uuid, episode_id uuid,
 is_public boolean, audio_storage_path text
);
create table storage.objects (
 bucket_id text not null, name text not null,
 metadata jsonb default '{}'::jsonb,
 primary key(bucket_id,name)
);
\ir r0-public-media-transition-candidate.sql

create function pg_temp.expect_rejected(p_sql text,p_case text)
returns void language plpgsql as $fn$
begin
  execute p_sql;
  raise exception 'UNEXPECTED_ACCEPTANCE: %',p_case;
exception when check_violation then
  raise notice 'PASS expected 23514: %',p_case;
end;
$fn$;
create function pg_temp.assert_true(p_condition boolean,p_case text)
returns void language plpgsql as $fn$
begin
 if p_condition is distinct from true then
   raise exception 'ASSERTION_FAIL: %',p_case;
 end if;
 raise notice 'PASS: %',p_case;
end;
$fn$;

insert into public.series(id,publication_status,content_rating) values
 ('00000000-0000-4000-8000-000000000101','public','general'),
 ('00000000-0000-4000-8000-000000000102','public','general'),
 ('00000000-0000-4000-8000-000000000103','private','general');
insert into public.episodes(id,series_id,posting_status,is_published) values
 ('00000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-000000000101','posted',true),
 ('00000000-0000-4000-8000-000000000202','00000000-0000-4000-8000-000000000102','posted',true),
 ('00000000-0000-4000-8000-000000000203','00000000-0000-4000-8000-000000000103','posted',true);

-- A synthetic orphan PUBLIC object (no DB recording) is still containment-sensitive.
insert into storage.objects(bucket_id,name) values
 ('recording-audio','nemo/00000000-0000-4000-8000-000000000101/00000000-0000-4000-8000-000000000201/audio.wav');
select pg_temp.assert_true(
 libread_internal.issue137_r0_has_public_audio('00000000-0000-4000-8000-000000000101',null),
 'orphan public object is detected even without recordings row');
select pg_temp.expect_rejected($q$
 update public.series set content_rating='r18'
 where id='00000000-0000-4000-8000-000000000101'
$q$,'general-to-r18 with old PUBLIC file');
select pg_temp.expect_rejected($q$
 update public.series set content_warnings=array['sexual_r18']
 where id='00000000-0000-4000-8000-000000000101'
$q$,'sexual warning while PUBLIC file exists');
select pg_temp.expect_rejected($q$
 update public.episodes set series_id='00000000-0000-4000-8000-000000000102'
 where id='00000000-0000-4000-8000-000000000201'
$q$,'reparent episode with old PUBLIC file');
select pg_temp.assert_true(
 (select publication_status='public' and content_rating='general' and content_warnings='{}'::text[]
  from public.series where id='00000000-0000-4000-8000-000000000101'),
 'rejected transitions leave original rating and publication unchanged');
-- Existing public content and matching DB reference remain legal.
insert into public.recordings(id,series_id,episode_id,is_public,audio_storage_path)
values('00000000-0000-4000-8000-000000000301',
'00000000-0000-4000-8000-000000000101',
'00000000-0000-4000-8000-000000000201',true,
'https://fixture.invalid/storage/v1/object/public/recording-audio/nemo/00000000-0000-4000-8000-000000000101/00000000-0000-4000-8000-000000000201/audio.wav');
select pg_temp.assert_true((select count(*)=1 from public.recordings),
  'normal published recording metadata remains accepted');
update public.series set publication_status='public'
 where id='00000000-0000-4000-8000-000000000101';
select pg_temp.assert_true((select publication_status='public' from public.series
 where id='00000000-0000-4000-8000-000000000101'),
 'unrelated existing PUBLIC metadata remains editable');

-- EMERGENCY: logical withdrawal and rating correction occur together as
-- ONE DB write even though old public media continues to exist.
-- This is NOT physical revocation, nor an HTTP/CDN integration test.
update public.series set publication_status='private',content_rating='r18',
 content_warnings=array['sexual_r18']
where id='00000000-0000-4000-8000-000000000101';
select pg_temp.assert_true(
 (select publication_status='private' and content_rating='r18'
    and 'sexual_r18'=any(content_warnings) from public.series
    where id='00000000-0000-4000-8000-000000000101'),
 'emergency atomic unpublished and R18 classification succeeds');

-- Episode takedown must not be blocked by existing PUBLIC audio.
update public.episodes set is_published=false,posting_status='draft'
where id='00000000-0000-4000-8000-000000000201';
select pg_temp.assert_true(
 (select posting_status='draft' and is_published=false from public.episodes
  where id='00000000-0000-4000-8000-000000000201'),
 'emergency episode draft/hide succeeds without deleting physical media');

-- Verified preexisting URLs are still represented as objects/references, so
-- neither the series nor episode may silently reappear as PUBLIC.
select pg_temp.assert_true(
 libread_internal.issue137_r0_has_public_audio(
  '00000000-0000-4000-8000-000000000101',null),
 'emergency DB takedown leaves PUBLIC origin asset UNREVOKED');
select pg_temp.expect_rejected($q$
 update public.series set publication_status='public',content_rating='general',
 content_warnings='{}'::text[]
 where id='00000000-0000-4000-8000-000000000101'
$q$,'republication blocked while unresolved PUBLIC origin exists');
select pg_temp.expect_rejected($q$
 update public.episodes set is_published=true,posting_status='posted'
 where id='00000000-0000-4000-8000-000000000201'
$q$,'episode republish blocked until legacy media resolved');
select pg_temp.expect_rejected($q$
 insert into storage.objects(bucket_id,name)
 values('recording-audio','nemo/00000000-0000-4000-8000-000000000101/00000000-0000-4000-8000-000000000201/new.wav')
$q$,'new PUBLIC object upload rejected after emergency withdrawal');

-- Repeated or follow-up private classification does not re-expose source.
update public.series set content_rating='general' where
 id='00000000-0000-4000-8000-000000000101';
select pg_temp.assert_true(
 (select publication_status='private' from public.series
  where id='00000000-0000-4000-8000-000000000101'),
 'subsequent private-only rating adjustment does not republish');

-- LOCAL SYNTHETIC RETIREMENT ONLY. Real Supabase files MUST be removed through
-- a separately approved Storage API operation; deleting storage.objects rows
-- directly in hosted Postgres does not safely remove provider bytes/CDN.
delete from storage.objects where bucket_id='recording-audio'
 and name='nemo/00000000-0000-4000-8000-000000000101/00000000-0000-4000-8000-000000000201/audio.wav';
select pg_temp.assert_true(
 libread_internal.issue137_r0_has_public_audio(
  '00000000-0000-4000-8000-000000000101',null),
 'DB recording URL reference still blocks republish after object metadata deletion');
select pg_temp.expect_rejected($q$
 update public.series set publication_status='public'
 where id='00000000-0000-4000-8000-000000000101'
$q$,'retirement not proven while legacy DB URL reference persists');
delete from public.recordings
 where id='00000000-0000-4000-8000-000000000301';
select pg_temp.assert_true(
 not libread_internal.issue137_r0_has_public_audio(
  '00000000-0000-4000-8000-000000000101',null),
 'fixture origin and reference metadata both cleared');
update public.episodes set posting_status='posted',is_published=true
 where id='00000000-0000-4000-8000-000000000201';
update public.series set publication_status='public',content_rating='general',
 content_warnings='{}'::text[]
 where id='00000000-0000-4000-8000-000000000101';
select pg_temp.assert_true(
 (select publication_status='public' and content_rating='general'
  from public.series where id='00000000-0000-4000-8000-000000000101'),
 'synthetic source may republish only after both legacies are retired');
-- Real release still requires human rights approval; the fixture is not proof.

-- A no-media source can change to R18 without exposure; future public PUT must deny.
update public.series set content_rating='r18'
 where id='00000000-0000-4000-8000-000000000102';
select pg_temp.assert_true((select content_rating='r18' from public.series
 where id='00000000-0000-4000-8000-000000000102'),
 'no-public-media series may become R18');
select pg_temp.expect_rejected($q$
 insert into storage.objects(bucket_id,name) values
 ('recording-audio','aivis/00000000-0000-4000-8000-000000000102/00000000-0000-4000-8000-000000000202/audio.wav')
$q$,'PUBLIC write to R18 source');
select pg_temp.expect_rejected($q$
 insert into public.recordings(id,series_id,episode_id,is_public,audio_storage_path)
 values('00000000-0000-4000-8000-000000000302',
 '00000000-0000-4000-8000-000000000102',
 '00000000-0000-4000-8000-000000000202',true,
 'https://fixture.invalid/storage/v1/object/public/recording-audio/aivis/file.wav')
$q$,'PUBLIC recording reference to R18 source');
select pg_temp.expect_rejected($q$
 insert into public.recordings(id,series_id,episode_id,is_public,audio_storage_path)
 values('00000000-0000-4000-8000-000000000303',
 '00000000-0000-4000-8000-000000000101',
 '00000000-0000-4000-8000-000000000201',false,
 'https://fixture.invalid/storage/v1/object/public/recording-audio/nemo/file.wav')
$q$,'PRIVATE recording cannot point to PUBLIC URL');
select pg_temp.expect_rejected($q$
 insert into storage.objects(bucket_id,name) values
 ('recording-audio','human/00000000-0000-4000-8000-000000000103/00000000-0000-4000-8000-000000000203/stage.wav')
$q$,'PUBLIC file for private series');
select pg_temp.expect_rejected($q$
 insert into storage.objects(bucket_id,name) values
 ('recording-audio','unexpected/file.wav')
$q$,'unknown PUBLIC media namespace fails closed');
insert into storage.objects(bucket_id,name)
values('isolated-private','human/00000000-0000-4000-8000-000000000103/00000000-0000-4000-8000-000000000203/stage.wav');
select pg_temp.assert_true((select count(*)=1 from storage.objects where bucket_id='isolated-private'),
 'unrelated PRIVATE bucket unaffected by public guard');

-- Gate non-public episode on PUBLIC object creation even if series remains general.
update public.episodes set is_published=false
where id='00000000-0000-4000-8000-000000000203';
select pg_temp.expect_rejected($q$
 insert into storage.objects(bucket_id,name) values
 ('recording-audio','human/00000000-0000-4000-8000-000000000103/00000000-0000-4000-8000-000000000203/later.wav')
$q$,'hidden episode remains blocked');
-- Functions are internal even when callers can update their own app rows.
select pg_temp.assert_true(
 not has_function_privilege('authenticated',
   'libread_internal.issue137_r0_guard_series_transition()','EXECUTE'),
 'authenticated has no direct execute privilege for definer trigger');
select pg_temp.assert_true(
 not has_function_privilege('anon',
   'libread_internal.issue137_r0_has_public_audio(uuid,uuid)','EXECUTE'),
 'anon cannot invoke private public-audio lookup');

-- CHECK: no hosted secrets, no actual Storage object/body or auth user queried.
select 'ISSUE137_R0_ISOLATED_PG_NEGATIVES_PASS' AS marker;
