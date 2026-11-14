-- Disposable local PostgreSQL only (CI service container). Not hosted.
\set ON_ERROR_STOP on
create role authenticated nologin;
create role service_role nologin;
create table public.works(id serial primary key, owner text not null);
create table public.usage_log(work_id int not null);
grant usage on schema public to authenticated;
grant select, insert on public.works to authenticated;
grant usage on sequence public.works_id_seq to authenticated;
create function public.count_private_library_import_usage()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.usage_log(work_id) values (new.id);
  return new;
end $$;
revoke execute on function public.count_private_library_import_usage() from public;
grant execute on function public.count_private_library_import_usage() to authenticated, service_role;
create trigger count_private_library_import_usage after insert on public.works
  for each row execute function public.count_private_library_import_usage();

-- The migration under test, unchanged.
\i supabase/migrations/20261114030000_revoke_authenticated_execute_trigger_fn.sql

do $$ begin
  if has_function_privilege('authenticated', 'public.count_private_library_import_usage()', 'EXECUTE')
  then raise exception 'FAIL: authenticated still has EXECUTE'; end if;
  if not has_function_privilege('service_role', 'public.count_private_library_import_usage()', 'EXECUTE')
  then raise exception 'FAIL: service_role lost EXECUTE'; end if;
end $$;

set role authenticated;
insert into public.works(owner) values ('a');
reset role;
do $$ begin
  if (select count(*) from public.usage_log) <> 1
  then raise exception 'FAIL: trigger did not fire for authenticated insert'; end if;
end $$;
\echo PASS: authenticated lost EXECUTE, trigger still fires on authenticated insert
