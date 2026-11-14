-- Issue #142 PR3 rollback for
-- supabase/migrations/20261115120000_issue142_google_consent_rls.sql.
--
-- Order matters:
-- 0. If the before-user-created hook is registered (Dashboard >
--    Authentication > Hooks), disable it there FIRST. Dropping the function
--    while the hook still points at it makes every sign-up fail.
-- 1. Remove the RESTRICTIVE policies (the original PERMISSIVE policies were
--    never changed, so nothing has to be restored).
-- 2. Drop the helper functions.
-- 3. public.account_consents is kept by default (it is the consent record).
--    Drop it only with a separate, explicit decision (commented out below).
begin;

do $$
declare
  t text;
begin
  foreach t in array array[
    'series', 'episodes', 'user_episode_comments', 'user_series_reviews',
    'series_translation_glossary_entries', 'series_translation_glossary_targets',
    'series_translation_profiles', 'users'
  ]
  loop
    if to_regclass(format('public.%I', t)) is not null then
      execute format('drop policy if exists issue142_google_consent_insert on public.%I', t);
      execute format('drop policy if exists issue142_google_consent_update on public.%I', t);
    end if;
  end loop;
end;
$$;

drop function if exists public.account_google_consent_satisfied();
drop function if exists public.hook_before_user_created_block_google(jsonb);

-- drop table if exists public.account_consents;
-- drop function if exists public.account_consents_reject_change();

commit;
