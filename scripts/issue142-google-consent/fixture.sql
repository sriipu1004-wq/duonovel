-- Issue #142 PR3: disposable PostgreSQL fixture (CI service container only;
-- never the hosted project). Minimal Supabase-like roles, auth.uid()/auth.jwt()
-- and the guarded tables with the PERMISSIVE policies copied verbatim from
-- production (pg_policies read 2026-11-15). Only the columns those policies
-- use are reproduced.
\set ON_ERROR_STOP on

-- Roles are cluster-wide; create them only once so that the PR3 and PR3b
-- checks can run in separate databases of the same service container.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then create role supabase_auth_admin nologin; end if;
end $$;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role, supabase_auth_admin;
grant usage on schema public to anon, authenticated, service_role, supabase_auth_admin;

-- auth.users / auth.identities: only the columns PR3b reads. RLS is enabled
-- with no policy and no grant to anon / authenticated, as in production
-- (relrowsecurity = true, 2026-11-15), so only a SECURITY DEFINER function
-- owned by a role that bypasses RLS can read them on behalf of a caller.
create table auth.users (
  id uuid primary key,
  raw_app_meta_data jsonb not null default '{}'::jsonb
);
create table auth.identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  created_at timestamptz not null default now()
);
create index identities_user_id_idx on auth.identities (user_id);
alter table auth.users enable row level security;
alter table auth.identities enable row level security;
revoke all on auth.users, auth.identities from public, anon, authenticated;

-- Same body as production auth.jwt() (pg_get_functiondef, 2026-11-15).
create function auth.jwt() returns jsonb language sql stable as $$
  select
    coalesce(
        nullif(current_setting('request.jwt.claim', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')
    )::jsonb
$$;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(
    coalesce(
      current_setting('request.jwt.claim.sub', true),
      (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')
    ), ''
  )::uuid
$$;

-- Supabase-style default privileges (production pg_default_acl: ALL to anon,
-- authenticated, service_role on new public tables).
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

create table public.series (
  id uuid primary key default gen_random_uuid(),
  author_id uuid,
  publication_status text not null default 'public',
  source_language text not null default 'ja'
);
create table public.episodes (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references public.series(id),
  posting_status text not null default 'posted',
  is_published boolean not null default true
);
create table public.user_episode_comments (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references public.episodes(id),
  user_id uuid not null,
  body text not null default ''
);
create table public.user_series_reviews (
  id uuid primary key default gen_random_uuid(),
  series_id text not null,
  user_id uuid not null,
  is_public boolean not null default true,
  body text not null default ''
);
create table public.series_translation_glossary_entries (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references public.series(id),
  source_language text not null,
  created_by_user_id uuid,
  origin text not null default 'author',
  term text not null default ''
);
create table public.series_translation_glossary_targets (
  id uuid primary key default gen_random_uuid(),
  glossary_entry_id uuid not null references public.series_translation_glossary_entries(id),
  target_language text not null,
  origin text not null default 'author',
  term text not null default ''
);
create table public.series_translation_profiles (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references public.series(id),
  target_language text not null,
  updated_by_user_id uuid,
  origin text not null default 'author',
  note text not null default ''
);
create table public.users (
  id uuid primary key,
  display_name text
);

do $$
declare t text;
begin
  foreach t in array array['series','episodes','user_episode_comments','user_series_reviews',
    'series_translation_glossary_entries','series_translation_glossary_targets',
    'series_translation_profiles','users']
  loop
    execute format('alter table public.%I enable row level security', t);
    -- Reads are open in the fixture so that the EXISTS sub-queries of the
    -- write policies and UPDATE visibility depend only on the write policies.
    execute format('create policy fixture_select_all on public.%I for select using (true)', t);
  end loop;
end $$;

-- Production PERMISSIVE write policies (verbatim conditions).
create policy series_insert_owner_only on public.series for insert to public
  with check ((auth.uid() IS NOT NULL) AND (author_id = auth.uid()));
create policy series_owner_update on public.series for update to authenticated
  using ((auth.uid() = author_id)) with check ((auth.uid() = author_id));
create policy series_update_owner_only on public.series for update to public
  using ((author_id = auth.uid())) with check ((author_id = auth.uid()));

create policy episodes_insert_own_series on public.episodes for insert to authenticated
  with check ((EXISTS ( SELECT 1 FROM series WHERE ((series.id = episodes.series_id) AND (series.author_id = auth.uid())))));
create policy episodes_owner_update on public.episodes for update to authenticated
  using ((EXISTS ( SELECT 1 FROM series s WHERE ((s.id = episodes.series_id) AND (s.author_id = auth.uid())))))
  with check ((EXISTS ( SELECT 1 FROM series s WHERE ((s.id = episodes.series_id) AND (s.author_id = auth.uid())))));
create policy episodes_update_own_series on public.episodes for update to authenticated
  using ((EXISTS ( SELECT 1 FROM series WHERE ((series.id = episodes.series_id) AND (series.author_id = auth.uid())))))
  with check ((EXISTS ( SELECT 1 FROM series WHERE ((series.id = episodes.series_id) AND (series.author_id = auth.uid())))));

create policy user_episode_comments_insert_visible_own on public.user_episode_comments for insert to authenticated
  with check (((user_id = auth.uid()) AND (EXISTS ( SELECT 1 FROM (episodes e JOIN series s ON ((s.id = e.series_id)))
    WHERE ((e.id = user_episode_comments.episode_id) AND ((s.author_id = auth.uid()) OR ((s.publication_status = 'public'::text) AND (e.posting_status = 'posted'::text) AND (e.is_published = true))))))));
create policy user_episode_comments_update_visible_own on public.user_episode_comments for update to authenticated
  using ((user_id = auth.uid()))
  with check (((user_id = auth.uid()) AND (EXISTS ( SELECT 1 FROM (episodes e JOIN series s ON ((s.id = e.series_id)))
    WHERE ((e.id = user_episode_comments.episode_id) AND ((s.author_id = auth.uid()) OR ((s.publication_status = 'public'::text) AND (e.posting_status = 'posted'::text) AND (e.is_published = true))))))));

create policy authenticated_insert_visible_own_user_series_reviews on public.user_series_reviews for insert to authenticated
  with check (((user_id = auth.uid()) AND (EXISTS ( SELECT 1 FROM series s
    WHERE (((s.id)::text = user_series_reviews.series_id) AND ((s.author_id = auth.uid()) OR (s.publication_status = 'public'::text)))))));
create policy authenticated_update_visible_own_user_series_reviews on public.user_series_reviews for update to authenticated
  using ((user_id = auth.uid()))
  with check (((user_id = auth.uid()) AND (EXISTS ( SELECT 1 FROM series s
    WHERE (((s.id)::text = user_series_reviews.series_id) AND ((s.author_id = auth.uid()) OR (s.publication_status = 'public'::text)))))));

create policy series_translation_glossary_owner_insert on public.series_translation_glossary_entries for insert to authenticated
  with check (((created_by_user_id = auth.uid()) AND (origin = 'author'::text) AND (EXISTS ( SELECT 1 FROM series owned_series
    WHERE ((owned_series.id = series_translation_glossary_entries.series_id) AND (owned_series.author_id = auth.uid()) AND (owned_series.source_language = series_translation_glossary_entries.source_language))))));
create policy series_translation_glossary_owner_update on public.series_translation_glossary_entries for update to authenticated
  using ((EXISTS ( SELECT 1 FROM series owned_series WHERE ((owned_series.id = series_translation_glossary_entries.series_id) AND (owned_series.author_id = auth.uid())))))
  with check (((origin = 'author'::text) AND (EXISTS ( SELECT 1 FROM series owned_series
    WHERE ((owned_series.id = series_translation_glossary_entries.series_id) AND (owned_series.author_id = auth.uid()) AND (owned_series.source_language = series_translation_glossary_entries.source_language))))));

create policy series_translation_glossary_target_owner_insert on public.series_translation_glossary_targets for insert to authenticated
  with check (((origin = 'author'::text) AND (EXISTS ( SELECT 1 FROM (series_translation_glossary_entries entry JOIN series owned_series ON ((owned_series.id = entry.series_id)))
    WHERE ((entry.id = series_translation_glossary_targets.glossary_entry_id) AND (owned_series.author_id = auth.uid()) AND (entry.source_language <> series_translation_glossary_targets.target_language))))));
create policy series_translation_glossary_target_owner_update on public.series_translation_glossary_targets for update to authenticated
  using ((EXISTS ( SELECT 1 FROM (series_translation_glossary_entries entry JOIN series owned_series ON ((owned_series.id = entry.series_id)))
    WHERE ((entry.id = series_translation_glossary_targets.glossary_entry_id) AND (owned_series.author_id = auth.uid())))))
  with check (((origin = 'author'::text) AND (EXISTS ( SELECT 1 FROM (series_translation_glossary_entries entry JOIN series owned_series ON ((owned_series.id = entry.series_id)))
    WHERE ((entry.id = series_translation_glossary_targets.glossary_entry_id) AND (owned_series.author_id = auth.uid()) AND (entry.source_language <> series_translation_glossary_targets.target_language))))));

create policy series_translation_profile_owner_insert on public.series_translation_profiles for insert to authenticated
  with check (((updated_by_user_id = auth.uid()) AND (origin = 'author'::text) AND (EXISTS ( SELECT 1 FROM series owned_series
    WHERE ((owned_series.id = series_translation_profiles.series_id) AND (owned_series.author_id = auth.uid()) AND (owned_series.source_language <> series_translation_profiles.target_language))))));
create policy series_translation_profile_owner_update on public.series_translation_profiles for update to authenticated
  using ((EXISTS ( SELECT 1 FROM series owned_series WHERE ((owned_series.id = series_translation_profiles.series_id) AND (owned_series.author_id = auth.uid())))))
  with check (((updated_by_user_id = auth.uid()) AND (origin = 'author'::text) AND (EXISTS ( SELECT 1 FROM series owned_series
    WHERE ((owned_series.id = series_translation_profiles.series_id) AND (owned_series.author_id = auth.uid()) AND (owned_series.source_language <> series_translation_profiles.target_language))))));

create policy users_update_own on public.users for update to authenticated
  using ((id = auth.uid())) with check ((id = auth.uid()));

-- Test users.
insert into auth.users (id) values
  ('00000000-0000-4000-8000-00000000000e'),  -- email only
  ('00000000-0000-4000-8000-00000000000a'),  -- Google, no consent
  ('00000000-0000-4000-8000-00000000000c'),  -- Google, consented
  ('00000000-0000-4000-8000-00000000000d'),  -- Google-only provider, empty consent key
  ('00000000-0000-4000-8000-00000000000b'),  -- PR3b: Google re-linked after consent
  ('00000000-0000-4000-8000-000000000001'),  -- PR3b: app_metadata key without consent row
  ('00000000-0000-4000-8000-000000000002');  -- PR3b: consent row without app_metadata key
insert into public.users (id, display_name)
  select id, 'user-' || right(id::text, 1) from auth.users;

-- Storage (PR3b): storage.objects with the production "illustrations"
-- policies copied verbatim (pg_policies read 2026-11-15) and
-- storage.foldername() as defined by Supabase Storage.
create schema storage;
grant usage on schema storage to anon, authenticated, service_role;
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text,
  name text,
  owner_id text,
  metadata jsonb
);
alter table storage.objects enable row level security;
grant select, insert, update, delete on storage.objects to anon, authenticated, service_role;
create function storage.foldername(name text) returns text[]
language plpgsql immutable as $$
declare _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[1:array_length(_parts, 1) - 1];
end $$;
grant execute on function storage.foldername(text) to anon, authenticated, service_role;

create policy "Anyone can read public illustrations" on storage.objects for select to public
  using ((bucket_id = 'illustrations'::text));
create policy "Users can delete owned-series illustrations" on storage.objects for delete to authenticated
  using (((bucket_id = 'illustrations'::text) AND (owner_id = (auth.uid())::text) AND ((storage.foldername(name))[1] = 'effects'::text) AND (EXISTS ( SELECT 1
   FROM series s
  WHERE (((s.id)::text = (storage.foldername(objects.name))[2]) AND (s.author_id = auth.uid()) AND (((storage.foldername(objects.name))[3] = (s.id)::text) OR (EXISTS ( SELECT 1
           FROM episodes e
          WHERE (((e.id)::text = (storage.foldername(objects.name))[3]) AND (e.series_id = s.id))))))))));
create policy "Users can update owned-series illustrations" on storage.objects for update to authenticated
  using (((bucket_id = 'illustrations'::text) AND (owner_id = (auth.uid())::text) AND ((storage.foldername(name))[1] = 'effects'::text) AND (EXISTS ( SELECT 1
   FROM series s
  WHERE (((s.id)::text = (storage.foldername(objects.name))[2]) AND (s.author_id = auth.uid()))))))
  with check (((bucket_id = 'illustrations'::text) AND (owner_id = (auth.uid())::text) AND ((storage.foldername(name))[1] = 'effects'::text) AND (EXISTS ( SELECT 1
   FROM series s
  WHERE (((s.id)::text = (storage.foldername(objects.name))[2]) AND (s.author_id = auth.uid()) AND (((storage.foldername(objects.name))[3] = (s.id)::text) OR (EXISTS ( SELECT 1
           FROM episodes e
          WHERE (((e.id)::text = (storage.foldername(objects.name))[3]) AND (e.series_id = s.id))))))))));
create policy "Users can upload owned-series illustrations" on storage.objects for insert to authenticated
  with check (((bucket_id = 'illustrations'::text) AND ((storage.foldername(name))[1] = 'effects'::text) AND (EXISTS ( SELECT 1
   FROM series s
  WHERE (((s.id)::text = (storage.foldername(objects.name))[2]) AND (s.author_id = auth.uid()) AND (((storage.foldername(objects.name))[3] = (s.id)::text) OR (EXISTS ( SELECT 1
           FROM episodes e
          WHERE (((e.id)::text = (storage.foldername(objects.name))[3]) AND (e.series_id = s.id))))))))));
-- Not in production: a writable bucket other than "illustrations", used to
-- show that the PR3b storage policies do not affect other buckets.
create policy fixture_other_bucket_write on storage.objects for all to authenticated
  using (bucket_id = 'fixture-other') with check (bucket_id = 'fixture-other');

-- Test helpers (run as the caller's role).
create function public.test_expect_denied(label text, statement text) returns void
language plpgsql as $$
begin
  begin
    execute statement;
  exception when insufficient_privilege or check_violation then
    raise notice 'ok denied: %', label;
    return;
  end;
  raise exception 'FAIL: % was allowed', label;
end $$;

create function public.test_rowcount(statement text) returns integer
language plpgsql as $$
declare n integer;
begin
  execute statement;
  get diagnostics n = row_count;
  return n;
end $$;

-- Claims as PostgREST sets them (request.jwt.claims).
create function public.test_as(user_id uuid, app_metadata jsonb) returns void
language sql as $$
  select set_config('request.jwt.claims',
    jsonb_build_object('sub', user_id, 'role', 'authenticated', 'app_metadata', app_metadata)::text,
    false);
$$;

grant execute on function public.test_expect_denied(text, text), public.test_rowcount(text),
  public.test_as(uuid, jsonb) to anon, authenticated, service_role;
