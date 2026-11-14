-- Issue #138: count_private_library_import_usage() is a trigger function
-- (RETURNS trigger) attached only to public.private_library_works. Clients
-- never call it directly, so authenticated does not need EXECUTE. PostgreSQL
-- checks EXECUTE on a trigger function only at CREATE TRIGGER time, not when
-- the trigger fires, so inserts by authenticated users keep counting usage.
-- Clears Supabase advisor lint 0029 for this function. No data change.
revoke execute on function public.count_private_library_import_usage() from authenticated;
