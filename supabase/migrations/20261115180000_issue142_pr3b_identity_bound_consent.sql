-- Issue #142 PR3b (PR #205 independent review, the S2 items that must be
-- fixed before the Google provider is enabled).
--
-- 1. public.account_google_consent_satisfied() is bound to the CURRENT Google
--    identity instead of "the JWT says google and the consent key is not
--    empty". It is now SECURITY DEFINER and reads, for auth.uid() only:
--      - auth.identities: the most recently created identity with
--        provider = 'google' (same choice as findGoogleIdentity() in
--        src/lib/auth/registrationGate.ts);
--      - auth.users.raw_app_meta_data ->> 'google_consent_identity_id'
--        (written only by the service role in POST /api/account/google-consent);
--      - public.account_consents: a row for (user, that identity).
--    It returns true when the user has no Google identity (email-only users,
--    anon), and otherwise only when BOTH the app_metadata key equals that
--    identity's id AND an account_consents row exists for it.
--    Effects compared with PR3:
--      - a re-linked Google identity (new identity id) is blocked again until
--        STEP 2 is repeated (review S2-1);
--      - the JWT is no longer trusted for either side, so a session issued
--        before Google was linked (providers without "google") is also
--        blocked, and a stale JWT carrying an old consent key does not help.
--    The signature is unchanged, so the 15 RESTRICTIVE policies created by
--    20261115120000 use the new body without being recreated.
--    Privileges: owner postgres (BYPASSRLS in production, checked
--    2026-11-15, and SELECT on auth.users / auth.identities); search_path is
--    empty and every name is schema-qualified; no arguments, so a caller can
--    learn only its own state. EXECUTE stays with anon, authenticated and
--    service_role (needed because the policies call it as the caller).
--    Cost: the policies call it as (select ...), an InitPlan evaluated once
--    per statement; it does two index lookups (auth.users pkey,
--    auth.identities identities_user_id_idx) and one on
--    account_consents_user_id_idx.
-- 2. storage.objects: RESTRICTIVE INSERT and UPDATE policies for the public
--    bucket "illustrations" (review S2-2). Rows of other buckets are not
--    affected (bucket_id <> 'illustrations' short-circuits). The existing
--    PERMISSIVE policies ("Users can upload owned-series illustrations",
--    "Users can update owned-series illustrations", read from production
--    2026-11-15) are not altered. The only other bucket with an
--    authenticated write policy is ai-narration-private (private, official
--    writer only), so it is left alone. DELETE is not restricted (removing a
--    public file reduces exposure).
--
-- Rollback: scripts/issue142-google-consent/rollback-pr3b.sql (restores the
-- PR3 body of the function and drops the two storage policies).

begin;

set local lock_timeout = '5s';

-- 1. Identity-bound consent ---------------------------------------------------

create or replace function public.account_google_consent_satisfied()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select auth.uid() as uid
  ),
  google_identity as (
    select i.id
    from auth.identities i
    join me on i.user_id = me.uid
    where i.provider = 'google'
    order by i.created_at desc nulls last, i.id desc
    limit 1
  )
  select
    case
      when (select uid from me) is null then true
      when not exists (select 1 from google_identity) then true
      else coalesce(
        (
          select
            (u.raw_app_meta_data ->> 'google_consent_identity_id') = g.id::text
            and exists (
              select 1
              from public.account_consents c
              where c.user_id = u.id
                and c.identity_id = g.id
                and c.provider = 'google'
            )
          from auth.users u
          cross join google_identity g
          where u.id = (select uid from me)
        ),
        false
      )
    end
$$;

comment on function public.account_google_consent_satisfied() is
  'Issue #142: true unless the caller has a Google identity whose consent (app_metadata.google_consent_identity_id + account_consents row) is not recorded for that exact identity. SECURITY DEFINER; reads only the caller''s own rows.';

revoke execute on function public.account_google_consent_satisfied() from public;
grant execute on function public.account_google_consent_satisfied() to anon, authenticated, service_role;

-- 2. Storage: public bucket "illustrations" ---------------------------------

drop policy if exists issue142_google_consent_illustrations_insert on storage.objects;
create policy issue142_google_consent_illustrations_insert
  on storage.objects
  as restrictive
  for insert
  to authenticated
  with check (
    bucket_id <> 'illustrations'
    or (select public.account_google_consent_satisfied())
  );

drop policy if exists issue142_google_consent_illustrations_update on storage.objects;
create policy issue142_google_consent_illustrations_update
  on storage.objects
  as restrictive
  for update
  to authenticated
  using (
    bucket_id <> 'illustrations'
    or (select public.account_google_consent_satisfied())
  )
  with check (
    bucket_id <> 'illustrations'
    or (select public.account_google_consent_satisfied())
  );

commit;
