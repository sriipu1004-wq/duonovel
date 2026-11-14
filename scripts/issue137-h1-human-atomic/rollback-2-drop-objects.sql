-- Issue #137 H1 rollback, stage 2 of 2. Run only AFTER the app no longer
-- calls issue137_h1_* (the pre-H1 app is deployed). Drops the RPCs, helper
-- functions, the revision table and the schema. `drop schema` is RESTRICT:
-- it fails (and the transaction rolls back) if anything else was later put
-- into libread_internal, so it never removes unrelated objects.
begin;
drop trigger if exists issue137_h1_human_atomic_guard on public.recordings;
drop function if exists public.issue137_h1_human_commit(
  uuid,uuid,uuid,bigint,text,uuid,text,text,boolean,text,boolean);
drop function if exists public.issue137_h1_human_rename(uuid,text);
drop function if exists public.issue137_h1_human_revision(uuid,uuid,uuid);
drop function if exists libread_internal.h1_guard_human_mutation();
drop function if exists libread_internal.h1_known_human(text,text,uuid,uuid,text);
drop table if exists libread_internal.h1_human_scope_revision;
drop schema if exists libread_internal;
select pg_catalog.pg_notify('pgrst', 'reload schema');
commit;
