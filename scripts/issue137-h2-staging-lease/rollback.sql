-- Issue #137 H2 rollback (manual). Run only AFTER the app no longer calls
-- issue137_h2_* (otherwise multipart uploads fail closed until it is reverted;
-- single-file uploads are unaffected). Leaves H1 and libread_internal intact.
-- The lease table holds only UUIDs, sizes and timestamps (no personal content).
-- Temporary part objects are NOT deleted here: remove them through the
-- Storage API (prefix human-temp/ in human-recording-audio) if needed.
begin;
drop trigger if exists issue137_h2_stage_storage_guard on storage.objects;
drop function if exists public.issue137_h2_stage_finish_retirement(uuid);
drop function if exists public.issue137_h2_stage_claim_retirement(uuid);
drop function if exists public.issue137_h2_stage_retire_candidates(uuid,integer);
drop function if exists public.issue137_h2_stage_close(uuid,uuid,uuid,uuid,text,bigint,text);
drop function if exists public.issue137_h2_stage_open(uuid,uuid,uuid,uuid,text,bigint,integer);
drop function if exists libread_internal.h2_guard_human_temp_storage();
drop function if exists libread_internal.h2_source_is_staging_eligible(uuid,uuid,uuid);
drop table if exists libread_internal.h2_human_stage_lease;
select pg_catalog.pg_notify('pgrst', 'reload schema');
commit;
