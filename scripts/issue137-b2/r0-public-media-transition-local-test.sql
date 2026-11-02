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
 update public.series set publication_status='private'
 where id='00000000-0000-4000-8000-000000000101'
$q$,'unpublish while PUBLIC file exists');
select pg_temp.expect_rejected($q$
 update public.episodes set is_published=false
 where id='00000000-0000-4000-8000-000000000201'
$q$,'unpublish episode while PUBLIC file exists');
select pg_temp.expect_rejected($q$
 update public.episodes set posting_status='draft'
 where id='00000000-0000-4000-8000-000000000201'
$q$,'draft episode while PUBLIC file exists');
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
