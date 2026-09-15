-- Prevent authenticated users from mass-assigning internal public.users columns.
-- RLS already limits updates to the caller's own row; column privileges now limit
-- which fields a caller may change on that row.

revoke update on table public.users from anon, authenticated;

grant update (
  display_name,
  x_url,
  note_url,
  show_r18_content,
  r18_confirmed_at
) on table public.users to authenticated;
