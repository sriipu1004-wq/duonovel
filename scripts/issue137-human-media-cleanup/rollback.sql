-- Issue #137 S2-1 rollback (manual). The app treats a missing RPC as "not
-- recorded" and still answers success, so app/DB order is not critical.
-- Export unresolved rows first if their paths are still needed for cleanup.
begin;
drop function if exists public.issue137_human_media_cleanup_resolve(uuid,boolean);
drop function if exists public.issue137_human_media_cleanup_pending(uuid,integer);
drop function if exists public.issue137_human_media_cleanup_record(uuid,uuid,uuid,text[],text);
drop table if exists libread_internal.human_media_cleanup_pending;
select pg_catalog.pg_notify('pgrst', 'reload schema');
commit;
