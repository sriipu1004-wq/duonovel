-- NONPRODUCTION ONLY: post-COMMIT forward recovery drill, not a deployable
-- patch or a claim of complete DB+Storage crash restoration.
-- The OUTAGE is explicitly injected into the disposable test schema.
-- The forward correction drops ONLY its synthetic fault trigger/function;
-- it NEVER removes or relaxes any B2/H1 R18/security trigger/policy.
\set ON_ERROR_STOP on
do $gate$
begin
 if not exists(select 1 from libread_r0_disposable.sentinel
     where id and purpose='SYNTHETIC-R0-ONLY') then
   raise exception 'ISSUE137_NONLOCAL_RECOVERY_REJECTED' using errcode='42501';
 end if;
 if (select count(*) from supabase_migrations.schema_migrations
     where name='issue137_b2_h1_existing_schema_candidate') <> 1 then
   raise exception 'ISSUE137_FORWARD_MIGRATION_NOT_RECORDED_ON_LOCAL' using errcode='42501';
 end if;
 if (select count(*) from pg_constraint con join pg_class c on c.oid=con.conrelid
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and con.convalidated
      and con.conname in ('series_author_id_fkey','recordings_reader_id_fkey',
      'recordings_voice_model_id_fkey','series_content_warnings_check',
      'episodes_scheduled_for_consistency_check',
      'episodes_series_id_episode_number_key')) <> 6 then
   raise exception 'ISSUE137_HOSTED_SHAPE_CONSTRAINTS_NOT_VALIDATED' using errcode='42501';
 end if;
 if (select count(*) from pg_trigger
    where not tgisinternal and
      (tgname like 'issue137_b2_%' or tgname like 'issue137_h1_%')) <> 10
  or (select count(*) from pg_policies where policyname like 'issue137_b2_%') <> 4
  or to_regprocedure('public.issue137_h1_human_revision(uuid,uuid,uuid)') is null then
   raise exception 'ISSUE137_BASELINE_GUARDS_MISSING' using errcode='42501';
 end if;
end $gate$;
create temporary table issue137_test_guard_digest as
select
 (select md5(string_agg(t.tgname||t.tgenabled||pg_get_triggerdef(t.oid),
    E'\n' order by t.tgname))
  from pg_trigger t where not t.tgisinternal and
   (t.tgname like 'issue137_b2_%' or t.tgname like 'issue137_h1_%')) as triggers_sha,
 (select md5(string_agg(p.policyname||p.permissive||p.cmd||
   coalesce(p.qual,'')||coalesce(p.with_check,''),E'\n' order by p.policyname))
  from pg_policies p where p.policyname like 'issue137_b2_%') as policies_sha;
-- Deliberately inject a local-only post-COMMIT regression: legitimate
-- owner metadata updates fail, while media/R18 guards still exist.
create function libread_r0_disposable.injected_owner_edit_outage()
returns trigger language plpgsql security invoker set search_path=''
as $fault$
begin
 raise exception 'ISSUE137_SYNTHETIC_POSTCOMMIT_OWNER_OUTAGE' using errcode='P0001';
end $fault$;
create trigger issue137_np_fault_owner_edit
before update of description on public.series
for each row execute function libread_r0_disposable.injected_owner_edit_outage();
do $expect_fault$
declare sample_id uuid;
begin
 select id into sample_id from public.series order by id limit 1;
 if sample_id is null then
  raise exception 'ISSUE137_SYNTHETIC_SOURCE_MISSING';
 end if;
 begin
  update public.series set description='synthetic edit attempt' where id=sample_id;
  raise exception 'ISSUE137_OUTAGE_NOT_REPRODUCED';
 exception when sqlstate 'P0001' then
  if sqlerrm <> 'ISSUE137_SYNTHETIC_POSTCOMMIT_OWNER_OUTAGE' then raise; end if;
 end;
end $expect_fault$;
-- No blanket rollback of committed RLS, no bucket publicity change.
-- A narrowly scoped forward repair corrects only the known injected fault.
begin;
set local lock_timeout='5s';
set local statement_timeout='20s';
do $before$
begin
 if not exists (select 1 from pg_trigger where
  tgname='issue137_np_fault_owner_edit' and not tgisinternal) then
  raise exception 'ISSUE137_FAULT_TRIGGER_NOT_FOUND' using errcode='42501';
 end if;
end $before$;
drop trigger issue137_np_fault_owner_edit on public.series;
drop function libread_r0_disposable.injected_owner_edit_outage();
commit;
do $verify$
declare sample_id uuid; rec_id uuid; before_state text;
begin
 if exists (select 1 from pg_trigger where tgname='issue137_np_fault_owner_edit') then
  raise exception 'ISSUE137_FAULT_STILL_INSTALLED';
 end if;
 if exists (select 1 from issue137_test_guard_digest g where
    g.triggers_sha is distinct from
     (select md5(string_agg(t.tgname||t.tgenabled||pg_get_triggerdef(t.oid),
        E'\n' order by t.tgname))
      from pg_trigger t where not t.tgisinternal and
       (t.tgname like 'issue137_b2_%' or t.tgname like 'issue137_h1_%'))
  or g.policies_sha is distinct from
     (select md5(string_agg(p.policyname||p.permissive||p.cmd||
       coalesce(p.qual,'')||coalesce(p.with_check,''),E'\n' order by p.policyname))
      from pg_policies p where p.policyname like 'issue137_b2_%')) then
  raise exception 'ISSUE137_B2_H1_SECURITY_CHANGED_DURING_FIX';
 end if;
 select id,description into sample_id,before_state from public.series order by id limit 1;
 update public.series set description='post-commit repair confirmed' where id=sample_id;
 if not found or not exists(select 1 from public.series where id=sample_id
     and description='post-commit repair confirmed') then
  raise exception 'ISSUE137_AUTHOR_EDIT_NOT_RECOVERED';
 end if;
 select id into rec_id from public.recordings
  where reader_name='Synthetic Human' order by id limit 1;
 if rec_id is null then raise exception 'ISSUE137_HUMAN_GUARD_TEST_ROW_MISSING'; end if;
 begin
  update public.recordings set is_public=true where id=rec_id;
  raise exception 'ISSUE137_HUMAN_DIRECT_WRITE_UNSAFE';
 exception when others then
  if sqlerrm not like '%H1_ATOMIC_RPC_REQUIRED%' then raise; end if;
 end;
end $verify$;
select 'ISSUE137_LOCAL_FORWARD_REPAIR_SECURITY_PRESERVED' as result;
