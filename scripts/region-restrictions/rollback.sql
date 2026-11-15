-- Rollback for supabase/migrations/20261116090000_region_restrictions.sql.
-- Removes the per-country restriction table, its helper functions and the
-- RESTRICTIVE select policies. The base public-read policies are untouched.
-- ORDER: roll the app code back (revert PR #214) BEFORE running this. The
-- PR #214 code fails closed when the table is missing: every work page,
-- translation and audio API would answer an error until the code is reverted.
-- Before running: every restricted work becomes readable everywhere once the
-- app no longer finds a restriction, so make those works private first if
-- their rights still require it (issue139-restrictions-rollback.sql refuses
-- while the 8 re-published works are public).
begin;
drop policy if exists episodes_region_restricted_select on public.episodes;
drop policy if exists recordings_region_restricted_select on public.recordings;
drop policy if exists episode_human_translations_region_restricted_select on public.episode_human_translations;
drop function if exists public.series_region_unrestricted_or_owner(uuid);
drop table if exists public.series_region_restrictions;
drop function if exists public.is_iso_country_code_array(text[]);
commit;
