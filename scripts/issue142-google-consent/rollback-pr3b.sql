-- Issue #142 PR3b rollback for
-- supabase/migrations/20261115180000_issue142_pr3b_identity_bound_consent.sql.
--
-- 1. Drop the two RESTRICTIVE storage.objects policies for "illustrations"
--    (the original PERMISSIVE storage policies were never changed).
-- 2. Restore the PR3 body of public.account_google_consent_satisfied()
--    (JWT-based, SECURITY INVOKER; same signature, so the 15 PR3 policies
--    keep working). To remove PR3 as well, run rollback.sql afterwards.
begin;

set local lock_timeout = '5s';

drop policy if exists issue142_google_consent_illustrations_insert on storage.objects;
drop policy if exists issue142_google_consent_illustrations_update on storage.objects;

create or replace function public.account_google_consent_satisfied()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  with claims as (
    select coalesce(auth.jwt() -> 'app_metadata', '{}'::jsonb) as app
  )
  select
    not (
      coalesce(
        jsonb_typeof(app -> 'providers') = 'array' and (app -> 'providers') ? 'google',
        false
      )
      or coalesce(app ->> 'provider', '') = 'google'
    )
    or length(btrim(coalesce(app ->> 'google_consent_identity_id', ''))) > 0
  from claims
$$;

comment on function public.account_google_consent_satisfied() is null;

revoke execute on function public.account_google_consent_satisfied() from public;
grant execute on function public.account_google_consent_satisfied() to anon, authenticated, service_role;

commit;
