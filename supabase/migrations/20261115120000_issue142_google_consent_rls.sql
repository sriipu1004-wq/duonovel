-- Issue #142 PR3 (PR #204 independent review, two S1 items that must be
-- fixed before the Google provider is enabled).
--
-- 1. public.account_consents: append-only record of STEP 2 consent for a
--    Google identity. Only the service role (POST /api/account/google-consent)
--    inserts. authenticated / anon cannot insert, update or delete; a user may
--    read their own rows.
-- 2. RESTRICTIVE RLS policies on the tables an authenticated user can write
--    directly through PostgREST and whose rows are public (or feed public
--    pages): a user whose JWT says they have a Google identity
--    (app_metadata.providers contains "google", or app_metadata.provider is
--    "google") must also carry app_metadata.google_consent_identity_id, which
--    only the service role can write. RESTRICTIVE policies are ANDed with the
--    existing PERMISSIVE policies, so the existing conditions keep exactly
--    their meaning (none of them is altered or dropped here).
--    Email-only users are unaffected: production check 2026-11-15 (aggregate
--    only): 17 auth.users, 11 active with app_metadata.providers = ["email"],
--    6 soft-deleted with empty app_metadata; 0 with "google"; 0 Google
--    identities.
-- 3. public.hook_before_user_created_block_google(event jsonb): Postgres
--    function for the before-user-created Auth Hook (official example
--    "Block by OAuth Provider"). It refuses a NEW user created through Google;
--    linking Google to an existing user does not create a user, so it is not
--    affected. Registering the hook (Dashboard > Authentication > Hooks) is a
--    separate owner operation and is NOT done by this migration.
--
-- Evidence for the JWT shape: Supabase "JWT Claims Reference"
-- (supabase.com/docs/guides/auth/jwt-fields) shows
-- app_metadata = {"provider": "email", "providers": ["email"]} in an
-- authenticated token; the Before User Created Hook docs show the same
-- app_metadata.provider / providers fields on the user about to be created.
-- auth.jwt() reads request.jwt.claims (production definition checked
-- 2026-11-15).
--
-- Known limit: the JWT is the one PostgREST received. A session issued before
-- a Google identity was linked carries providers without "google" until it is
-- refreshed (access token lifetime). Automatic linking happens on a Google
-- sign-in, which issues a new session whose JWT already lists "google".
--
-- Rollback: scripts/issue142-google-consent/rollback.sql.

begin;

-- 1. Consent record -----------------------------------------------------------

create table if not exists public.account_consents (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  identity_id uuid not null,
  provider text not null check (provider = 'google'),
  terms_version text not null check (length(btrim(terms_version)) > 0),
  privacy_version text not null check (length(btrim(privacy_version)) > 0),
  agreed_to_terms boolean not null check (agreed_to_terms),
  agreed_to_privacy boolean not null check (agreed_to_privacy),
  acknowledged_public_surface boolean not null check (acknowledged_public_surface),
  consented_at timestamptz not null default now(),
  recorded_at timestamptz not null default now()
);

comment on table public.account_consents is
  'Issue #142: append-only STEP 2 consent per Google identity. Written only by the service role (POST /api/account/google-consent).';

create index if not exists account_consents_user_id_idx
  on public.account_consents (user_id, consented_at desc);

alter table public.account_consents enable row level security;

-- Supabase default privileges grant ALL on new public tables to anon,
-- authenticated and service_role; take everything back first.
revoke all on table public.account_consents from public, anon, authenticated, service_role;
grant select on table public.account_consents to authenticated;
-- Append-only even for the service role: no UPDATE / DELETE / TRUNCATE.
-- (A hard delete of the auth user still removes the rows through the FK
-- cascade, which runs with the table owner's rights.)
grant select, insert on table public.account_consents to service_role;

drop policy if exists account_consents_select_own on public.account_consents;
create policy account_consents_select_own
  on public.account_consents
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.account_consents_reject_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'account_consents is append-only'
    using errcode = '42501';
end;
$$;

revoke execute on function public.account_consents_reject_change() from public, anon, authenticated;

drop trigger if exists account_consents_append_only on public.account_consents;
create trigger account_consents_append_only
  before update on public.account_consents
  for each row execute function public.account_consents_reject_change();

-- 2. Consent condition for direct writes -----------------------------------

-- true  : no Google identity in the JWT, or the server-recorded consent key
--         is present in app_metadata.
-- false : the JWT lists Google and app_metadata.google_consent_identity_id is
--         missing or empty.
create or replace function public.account_google_consent_satisfied()
returns boolean
language sql
stable
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

revoke execute on function public.account_google_consent_satisfied() from public;
grant execute on function public.account_google_consent_satisfied() to anon, authenticated, service_role;

-- RESTRICTIVE policies. TO public so that they also cover policies granted to
-- {public} (series_insert_owner_only / series_update_owner_only). The
-- service role bypasses RLS and is unaffected.
do $$
declare
  target record;
begin
  for target in
    select * from (values
      ('series', true, true),
      ('episodes', true, true),
      ('user_episode_comments', true, true),
      ('user_series_reviews', true, true),
      ('series_translation_glossary_entries', true, true),
      ('series_translation_glossary_targets', true, true),
      ('series_translation_profiles', true, true),
      ('users', false, true)
    ) as t(table_name, guard_insert, guard_update)
  loop
    if to_regclass(format('public.%I', target.table_name)) is null then
      raise exception 'issue142: table public.% is missing', target.table_name;
    end if;

    if target.guard_insert then
      execute format('drop policy if exists %I on public.%I',
        'issue142_google_consent_insert', target.table_name);
      execute format(
        'create policy %I on public.%I as restrictive for insert to public '
        'with check ((select public.account_google_consent_satisfied()))',
        'issue142_google_consent_insert', target.table_name);
    end if;

    if target.guard_update then
      execute format('drop policy if exists %I on public.%I',
        'issue142_google_consent_update', target.table_name);
      execute format(
        'create policy %I on public.%I as restrictive for update to public '
        'using ((select public.account_google_consent_satisfied())) '
        'with check ((select public.account_google_consent_satisfied()))',
        'issue142_google_consent_update', target.table_name);
    end if;
  end loop;
end;
$$;

-- 3. before-user-created Auth Hook (function only; registration is manual) --

create or replace function public.hook_before_user_created_block_google(event jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  app jsonb := coalesce(event -> 'user' -> 'app_metadata', '{}'::jsonb);
begin
  if coalesce(app ->> 'provider', '') = 'google'
     or coalesce(jsonb_typeof(app -> 'providers') = 'array' and (app -> 'providers') ? 'google', false)
  then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'message', 'New accounts cannot be created with Google yet. Register with email first, then sign in with Google.',
        'http_code', 403
      )
    );
  end if;
  return '{}'::jsonb;
end;
$$;

-- Permissions as in the official example: only supabase_auth_admin executes.
-- (supabase_auth_admin already has USAGE on schema public in production,
-- checked 2026-11-15.)
grant execute on function public.hook_before_user_created_block_google(jsonb) to supabase_auth_admin;
revoke execute on function public.hook_before_user_created_block_google(jsonb) from authenticated, anon, public;

commit;
