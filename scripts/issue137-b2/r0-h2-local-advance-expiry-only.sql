-- #137 TEST-ONLY clock simulation. This changes lease times solely inside
-- the exclusive unlinked Supabase sandbox, not a deployable patch or Cron.
\set ON_ERROR_STOP on
begin;
do $only_disposable$
declare n integer;
begin
 if not exists(select 1 from libread_r0_disposable.sentinel
   where id and purpose='SYNTHETIC-R0-ONLY') then
  raise exception 'ISSUE137_H2_LIVE_DB_REJECTED' using errcode='42501';
 end if;
 select count(*) into n from libread_internal.h2_human_stage_lease
 where state='aborted';
 if n<>2 then raise exception 'ISSUE137_H2_EXPECTED_EXACTLY_TWO_SYNTHETIC_LEASES'; end if;
 update libread_internal.h2_human_stage_lease
 set expires_at=clock_timestamp()-interval '4 hours',
     retire_after=clock_timestamp()-interval '1 hour'
 where state='aborted';
 if (select count(*) from libread_internal.h2_human_stage_lease
   where state='aborted' and expires_at<clock_timestamp()
     and retire_after<clock_timestamp()) <> 2 then
  raise exception 'ISSUE137_H2_LOCAL_AGE_SIMULATION_FAILED';
 end if;
end $only_disposable$;
commit;
select 'ISSUE137_H2_DISPOSABLE_EXPIRY_SIMULATED' as result;
