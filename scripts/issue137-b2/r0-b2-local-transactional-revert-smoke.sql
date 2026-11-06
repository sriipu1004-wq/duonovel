\set ON_ERROR_STOP on
-- #137 LOCAL-ONLY transaction rollback smoke.
-- NEVER run on hosted Supabase. This exercises Postgres transactional DDL
-- ROLLBACK, NOT reversing a committed security migration or deleting media.
begin;
set local lock_timeout = '3s';
do $local_only$
declare n integer;
begin
 if to_regclass('libread_r0_disposable.sentinel') is null then
  raise exception 'ISSUE137_NONDISPOSABLE_DATABASE_HOLD';
 end if;
 if not exists (
  select 1 from libread_r0_disposable.sentinel
  where id=true and purpose='SYNTHETIC-R0-ONLY'
 ) then
  raise exception 'ISSUE137_NONDISPOSABLE_DATABASE_HOLD';
 end if;
 select count(*) into n from pg_trigger t
 join pg_class c on c.oid=t.tgrelid
 join pg_namespace ns on ns.oid=c.relnamespace
 where not t.tgisinternal and ns.nspname in ('public','storage')
   and t.tgname like 'issue137_b2_%';
 if n <> 9 then
  raise exception 'ISSUE137_BASELINE_TRIGGER_MISMATCH';
 end if;
 if (select count(*) from pg_policies where policyname like 'issue137_b2_%') <> 4 then
  raise exception 'ISSUE137_BASELINE_RLS_MISMATCH';
 end if;
 if has_function_privilege('anon','public.libread_public_catalog_revision()','EXECUTE') then
  raise exception 'ISSUE137_EPOCH_RPC_EXPOSED';
 end if;
end
$local_only$;
-- Simulate accidentally removing two essential protections, then
-- ROLLBACK the SAME transaction; never commit a security downgrade.
drop trigger issue137_b2_series_media_transition on public.series;
drop policy issue137_b2_series_r18_boundary on public.series;
do $removed$
begin
 if exists (select 1 from pg_trigger t
            where t.tgname='issue137_b2_series_media_transition') then
  raise exception 'ISSUE137_TEST_TRIGGER_DROP_FAILED';
 end if;
 if exists (select 1 from pg_policies
            where policyname='issue137_b2_series_r18_boundary') then
  raise exception 'ISSUE137_TEST_POLICY_DROP_FAILED';
 end if;
end
$removed$;
rollback;
-- The two protective DDL objects must be restored by transaction rollback.
do $restored$
begin
 if not exists (select 1 from pg_trigger t
  where t.tgname='issue137_b2_series_media_transition') then
  raise exception 'ISSUE137_ROLLBACK_LOST_TRIGGER';
 end if;
 if not exists (select 1 from pg_policies
  where policyname='issue137_b2_series_r18_boundary') then
  raise exception 'ISSUE137_ROLLBACK_LOST_RLS';
 end if;
end
$restored$;
select 'ISSUE137_LOCAL_TRANSACTIONAL_ROLLBACK_PASS' as marker;
