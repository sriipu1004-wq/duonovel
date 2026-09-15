-- Security audit hardening for legacy recording-request state.
--
-- The current recording flow no longer creates or moderates
-- series_recording_requests. The live table is empty and current application
-- code only reads a signed-in user's historical rows on /record. Keeping the
-- old INSERT/UPDATE policies would allow a series owner to rewrite identity and
-- audit fields (requester_user_id, series_id, request_type, created_at, etc.)
-- through PostgREST even though no current feature needs that capability.

begin;

revoke insert, update, delete
  on table public.series_recording_requests
  from anon, authenticated;

drop policy if exists series_recording_requests_insert_own_pending
  on public.series_recording_requests;
drop policy if exists series_recording_requests_update_owned_series
  on public.series_recording_requests;

-- Preserve the existing SELECT policies so historical rows remain readable by
-- the requester and by the owner of the referenced series if legacy data is
-- restored later.

-- This wrapper delegates to complete_private_library_import(), which already
-- enforces auth.uid() ownership. Anonymous execution is unnecessary, though,
-- and exposing the wrapper through PostgREST only increases the public RPC
-- surface.
revoke execute on function public.complete_private_library_import_with_usage(uuid)
  from public, anon;
grant execute on function public.complete_private_library_import_with_usage(uuid)
  to authenticated, service_role;

commit;
