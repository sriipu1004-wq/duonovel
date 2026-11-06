-- #137 DIRECT POSTGRES role path vs Storage REST/S3. ISOLATED ONLY.
-- Real psql against loopback Supabase Postgres; no linked project or hosted keys.
-- The runner validates the literal local DSN, temp sentinel and session role.
-- All attempts, including a deliberately forged PRIVATE metadata record, are
-- rolled back. This file is NEVER a deployable migration.
\set ON_ERROR_STOP on
do $check_local_only$
begin
 if current_database() <> 'postgres'
    or not exists(select 1 from libread_r0_disposable.sentinel
       where id is true and purpose='SYNTHETIC-R0-ONLY') then
  raise exception 'ISSUE137_NONLOCAL_DIRECT_SQL_REFUSED' using errcode='42501';
 end if;
 if not exists(select 1 from pg_trigger t where not t.tgisinternal
  and t.tgrelid='storage.objects'::regclass and
   t.tgname='issue137_b2_public_audio_storage' and t.tgenabled='O') then
  raise exception 'ISSUE137_B2_STORAGE_GUARD_MISSING' using errcode='42501';
 end if;
 if not (has_table_privilege('service_role','storage.objects','INSERT')
   and has_table_privilege('service_role','storage.objects','UPDATE')) then
  raise exception 'ISSUE137_LOCAL_SERVICE_ROLE_DIRECT_ACCESS_ASSUMPTION_MISMATCH'
   using errcode='42501';
 end if;
end $check_local_only$;
begin;
set local role service_role;
do $direct_probe$
declare
 sid uuid; eid uuid; protected_sid uuid; protected_eid uuid;
 private_sid uuid; private_eid uuid;
 original_object uuid; private_phantom uuid;
 blocked boolean;
 begin
 -- A live local, published R18 fixture and a withdrawn origin are both required.
 select s.id,e.id into sid,eid
 from public.series s join public.episodes e on e.series_id=s.id
 where s.publication_status='public' and s.content_rating='r18'
   and e.posting_status='posted' and e.is_published is true
 order by s.id,e.id limit 1;
 if sid is null or eid is null then
  raise exception 'ISSUE137_R18_LOCAL_FIXTURE_MISSING' using errcode='42501';
 end if;
 -- Select ONLY the tested withdrawal that still has an actual PUBLIC
 -- origin; other synthetic PRIVATE works may already have retired theirs.
 -- The join prevents a flaky selection by UUID ordering, and refuses any
 -- provenance mismatch between stored path and current source/episode.
 select s.id,e.id,o.id into private_sid,private_eid,original_object
 from public.series s
 join public.episodes e on e.series_id=s.id
 join storage.objects o on o.bucket_id='recording-audio'
  and o.name like 'nemo/'||s.id::text||'/'||e.id::text||'/%'
 where s.publication_status='private' and s.content_rating='r18'
   and e.posting_status='posted' and e.is_published is true
 order by o.id limit 1;
 if private_sid is null or private_eid is null or original_object is null then
  raise exception 'ISSUE137_WITHDRAWN_PUBLIC_ORIGIN_MISSING' using errcode='42501';
 end if;
 -- Unlike a REST/S3 403, these are actual SQL executed as service_role,
 -- which bypasses RLS; the DB trigger must be the cause of denial.
 blocked:=false;
 begin
  insert into storage.objects(bucket_id,name,metadata)
  values('recording-audio',
    'nemo/'||sid::text||'/'||eid::text||'/db-direct-denied.wav',
    '{"mimetype":"audio/wav","size":64}'::jsonb);
 exception when others then
  if sqlerrm <> 'B2_PUBLIC_MEDIA_WRITE_BLOCKED' then raise; end if;
  blocked:=true;
 end;
 if not blocked then raise exception 'ISSUE137_DIRECT_R18_DB_INSERT_ALLOWED'; end if;
 blocked:=false;
 begin
  insert into storage.objects(bucket_id,name,metadata)
  values('r0-s3-alternate-public','misplaced/db-direct-denied.wav',
    '{"mimetype":"audio/wav","size":64}'::jsonb);
 exception when others then
  if sqlerrm <> 'B2_UNMONITORED_PUBLIC_AUDIO_HOLD' then raise; end if;
  blocked:=true;
 end;
 if not blocked then raise exception 'ISSUE137_DIRECT_ALTERNATE_DB_INSERT_ALLOWED'; end if;
 blocked:=false;
 begin
  insert into storage.objects(bucket_id,name,metadata)
  values('recording-audio',
   'nemo/'||private_sid::text||'/'||private_eid::text||'/db-postwithdraw-denied.wav',
   '{"mimetype":"audio/wav","size":64}'::jsonb);
 exception when others then
  if sqlerrm <> 'B2_PUBLIC_MEDIA_WRITE_BLOCKED' then raise; end if;
  blocked:=true;
 end;
 if not blocked then raise exception 'ISSUE137_DIRECT_PRIVATE_DB_INSERT_ALLOWED'; end if;
 blocked:=false;
 begin
  update storage.objects set
   metadata=coalesce(metadata,'{}'::jsonb)||
       '{"mimetype":"audio/wav","size":65536}'::jsonb
   where id=original_object;
 exception when others then
  if sqlerrm <> 'B2_PUBLIC_MEDIA_WRITE_BLOCKED' then raise; end if;
  blocked:=true;
 end;
 if not blocked then raise exception 'ISSUE137_DIRECT_OLD_ORIGIN_DB_UPDATE_ALLOWED'; end if;
 -- Crucial bounded negative finding: service_role can write PRIVATE object
 -- metadata directly, even with no actual bytes. This is intentionally
 -- possible and should NEVER be mistaken for verified physical custody.
 insert into storage.objects(bucket_id,name,metadata)
 values('r18-recording-audio',
  'nemo/'||sid::text||'/'||eid::text||'/db-synthetic-unbacked.wav',
  '{"mimetype":"audio/wav","size":64}'::jsonb) returning id into private_phantom;
 if private_phantom is null or not exists(select 1 from storage.objects
    where id=private_phantom) then
  raise exception 'ISSUE137_DIRECT_PRIVATE_DB_PATH_CONTROL_MISSING';
 end if;
 raise notice 'PASS: service_role direct PG SQL 4 protected PUBLIC insert/update attempts denied by exact B2 trigger messages; PRIVATE metadata-only insert possible INSIDE ROLLBACK';
 raise notice 'RISK: direct private Storage metadata is not physical-byte attestation; static key/DB writer custody must be constrained';
end $direct_probe$;
rollback;
-- Confirm transaction-only test data did NOT persist.
do $rolled_back$
begin
 if exists(select 1 from storage.objects
    where name like '%/db-synthetic-unbacked.wav'
    or name like '%/db-direct-denied.wav'
    or name like '%/db-postwithdraw-denied.wav') then
   raise exception 'ISSUE137_DIRECT_SQL_TEST_LEFT_METADATA' using errcode='42501';
 end if;
 raise notice 'ISSUE137_DIRECT_SQL_ROLE_BOUNDARY_AND_ROLLBACK_PASS';
end $rolled_back$;
