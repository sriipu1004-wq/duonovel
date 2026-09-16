begin;

-- The original reaction-table migration already created
-- user_series_reactions_user_series_uidx on (user_id, series_id).
-- Child 65 temporarily added a second equivalent unique index while auditing
-- the table. Keep the original canonical index and remove the duplicate.
drop index if exists public.user_series_reactions_user_series_unique;

-- Mutations now go through server APIs. Browser roles only need read access;
-- remove residual default table privileges that are not part of that contract.
revoke insert, update, delete, truncate, references, trigger
  on table public.user_series_reactions
  from anon, authenticated;
grant select on table public.user_series_reactions to anon, authenticated;

revoke insert, update, delete, truncate, references, trigger
  on table public.user_series_bookmarks
  from anon, authenticated;
grant select on table public.user_series_bookmarks to anon, authenticated;

commit;
