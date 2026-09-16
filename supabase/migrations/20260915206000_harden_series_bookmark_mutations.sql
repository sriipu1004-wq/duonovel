-- Security/integrity hardening for series bookmarks.
--
-- Current bookmark UI writes through /api/bookmarks/series, but legacy RLS still
-- permits direct PostgREST INSERT/DELETE. A custom client can therefore bypass
-- route validation and supply its own created_at; the popularity trigger uses
-- created_at as the ranking bucket date. Keep owner SELECT access for saved-work
-- pages, but route all mutations through the authenticated server API.

begin;

revoke insert, delete
  on table public.user_series_bookmarks
  from anon, authenticated;

drop policy if exists user_series_bookmarks_insert_own
  on public.user_series_bookmarks;
drop policy if exists user_series_bookmarks_delete_own
  on public.user_series_bookmarks;

-- user_series_bookmarks_select_own remains unchanged. Server/session-rendered
-- saved-work views still need the signed-in user's own bookmark rows.

commit;
