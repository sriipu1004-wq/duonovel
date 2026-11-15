-- Per-country restriction migration: apply to a disposable PostgreSQL (CI
-- service container only; never the hosted project) and assert.
--   psql -X -v ON_ERROR_STOP=1 -f scripts/region-restrictions/check.sql
\set ON_ERROR_STOP on

-- Minimal Supabase-shaped fixture: roles, auth.uid(), and the three content
-- tables with the production public-read policies (shape as of 2026-11-15).
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema public to anon, authenticated, service_role;

create table public.series (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null,
  publication_status text not null default 'public'
);
create table public.episodes (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references public.series(id),
  posting_status text not null default 'posted',
  is_published boolean not null default true,
  body text not null default 'text'
);
create table public.recordings (
  id uuid primary key default gen_random_uuid(),
  series_id uuid,
  episode_id uuid not null references public.episodes(id),
  is_public boolean not null default true
);
create table public.episode_human_translations (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references public.series(id),
  episode_id uuid not null references public.episodes(id),
  status text not null default 'published'
);
alter table public.series enable row level security;
alter table public.episodes enable row level security;
alter table public.recordings enable row level security;
alter table public.episode_human_translations enable row level security;
grant select on public.series, public.episodes, public.recordings, public.episode_human_translations
  to anon, authenticated, service_role;
create policy series_select_public_or_owner on public.series for select
  using (author_id = auth.uid() or publication_status = 'public');
create policy episodes_public_or_owner_select on public.episodes for select
  using (exists (select 1 from public.series s where s.id = episodes.series_id
    and (s.author_id = auth.uid() or (s.publication_status = 'public'
      and episodes.posting_status = 'posted' and episodes.is_published = true))));
create policy recordings_select_public_visible on public.recordings for select to anon, authenticated
  using (is_public = true and exists (select 1 from public.episodes e join public.series s on s.id = e.series_id
    where e.id = recordings.episode_id and s.id = recordings.series_id and s.publication_status = 'public'));
create policy episode_human_translations_select on public.episode_human_translations for select
  using (status = 'published');

-- Same shape as public_episode_work_summaries (security_invoker = true).
create view public.public_episode_work_summaries with (security_invoker = true) as
  select e.series_id, count(*)::integer as episode_count
  from public.episodes e join public.series s on s.id = e.series_id
  where s.publication_status = 'public' and e.posting_status = 'posted' and e.is_published = true
  group by e.series_id;
grant select on public.public_episode_work_summaries to anon, authenticated, service_role;

-- Owner A has a restricted and an unrestricted work; both public.
insert into public.series(id, author_id) values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000000a'),
  ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-00000000000a');
insert into public.episodes(id, series_id) values
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000a1'),
  ('00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-0000000000a2');
insert into public.recordings(series_id, episode_id) values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000e1'),
  ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000e2');
insert into public.episode_human_translations(series_id, episode_id) values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000e1'),
  ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000e2');

-- The migration under test, applied twice (must be idempotent).
\i supabase/migrations/20261116090000_region_restrictions.sql
\i supabase/migrations/20261116090000_region_restrictions.sql

create view public.series_restrictions_probe with (security_invoker = true) as
  select series_id from public.series_region_restrictions;
grant select on public.series_restrictions_probe to anon, authenticated;

create function public.test_counts() returns text language sql as $$
  select (select count(*) from public.episodes)::text || ',' ||
         (select count(*) from public.recordings)::text || ',' ||
         (select count(*) from public.episode_human_translations)::text
$$;
grant execute on function public.test_counts() to anon, authenticated;

create function public.test_expect(label text, actual text, expected text) returns void
language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'FAIL: % expected % got %', label, expected, actual;
  end if;
  raise notice 'ok: %', label;
end $$;
grant execute on function public.test_expect(text, text, text) to anon, authenticated;

-- 1. No restriction rows: nothing changes for anyone.
set role anon;
select public.test_expect('anon, no restrictions', public.test_counts(), '2,2,2');
reset role;

-- 2. Restrict work a1 (service role path = table owner here).
insert into public.series_region_restrictions(series_id, blocked_countries, reason)
  values ('00000000-0000-4000-8000-0000000000a1', array['US'], 'test');

set role anon;
select public.test_expect('anon sees only the unrestricted work', public.test_counts(), '1,1,1');
select public.test_expect('anon can read the restriction list',
  (select count(*)::text from public.series_restrictions_probe), '1');
do $$ begin
  begin
    perform reason from public.series_region_restrictions;
    raise exception 'FAIL: anon read the reason column';
  exception when insufficient_privilege then raise notice 'ok: reason column hidden from anon';
  end;
end $$;
-- Through RLS the restricted work drops out of the summary view for anon...
select public.test_expect('anon summary view hides the restricted work',
  (select count(*)::text from public.public_episode_work_summaries), '1');
reset role;
-- ...so the app reads the view with the service role (bypasses RLS): the
-- restricted work keeps its catalog card.
set role service_role;
select public.test_expect('service role summary view keeps both works',
  (select count(*)::text from public.public_episode_work_summaries), '2');
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000000b', false);
select public.test_expect('other user sees only the unrestricted work', public.test_counts(), '1,1,1');
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000000a', false);
select public.test_expect('author still sees both works', public.test_counts(), '2,2,2');
reset role;

-- 3. Clients cannot write the restriction list.
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000000a', false);
do $$
begin
  begin
    delete from public.series_region_restrictions;
    if found then raise exception 'FAIL: author deleted a restriction'; end if;
  exception when insufficient_privilege then null;
  end;
  begin
    update public.series_region_restrictions set blocked_countries = array['XX'];
    if found then raise exception 'FAIL: author updated a restriction'; end if;
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.series_region_restrictions(series_id, blocked_countries, reason)
      values ('00000000-0000-4000-8000-0000000000a2', array['US'], 'x');
    raise exception 'FAIL: author inserted a restriction';
  exception when insufficient_privilege then null;
  end;
  raise notice 'ok: clients cannot write series_region_restrictions';
end $$;
reset role;
select public.test_expect('restriction row unchanged',
  (select array_to_string(blocked_countries, ',') from public.series_region_restrictions), 'US');

-- 4. Constraints.
do $$
declare bad text[];
begin
  foreach bad slice 1 in array array[array['us'], array['USA'], array['U1']] loop
    begin
      insert into public.series_region_restrictions(series_id, blocked_countries, reason)
        values ('00000000-0000-4000-8000-0000000000a2', bad, 'x');
      raise exception 'FAIL: accepted %', bad;
    exception when check_violation then null;
    end;
    begin
      insert into public.series_region_restrictions(series_id, allowed_countries, reason)
        values ('00000000-0000-4000-8000-0000000000a2', bad, 'x');
      raise exception 'FAIL: accepted allow %', bad;
    exception when check_violation then null;
    end;
  end loop;
  begin
    insert into public.series_region_restrictions(series_id, blocked_countries, allowed_countries, reason)
      values ('00000000-0000-4000-8000-0000000000a2', array['US'], array['JP'], 'x');
    raise exception 'FAIL: accepted both lists';
  exception when check_violation then null;
  end;
  begin
    insert into public.series_region_restrictions(series_id, reason)
      values ('00000000-0000-4000-8000-0000000000a2', 'x');
    raise exception 'FAIL: accepted no list';
  exception when check_violation then null;
  end;
  begin
    insert into public.series_region_restrictions(series_id, blocked_countries, reason)
      values ('00000000-0000-4000-8000-0000000000a2', '{}', 'x');
    raise exception 'FAIL: accepted empty list';
  exception when check_violation then null;
  end;
  begin
    insert into public.series_region_restrictions(series_id, blocked_countries, reason)
      values ('00000000-0000-4000-8000-0000000000a2', array['US'], '  ');
    raise exception 'FAIL: accepted blank reason';
  exception when check_violation then null;
  end;
  raise notice 'ok: constraints';
end $$;

-- Back to a signed-out caller (step 3 left author A's claim in the session).
select set_config('request.jwt.claim.sub', '', false);
-- An allow-list row is accepted and hides the work from the Data API too.
insert into public.series_region_restrictions(series_id, allowed_countries, reason)
  values ('00000000-0000-4000-8000-0000000000a2', array['JP', 'GB'], 'allow test');
set role anon;
select public.test_expect('anon with both works restricted', public.test_counts(), '0,0,0');
reset role;

-- 5. Lifting the restriction restores the public view.
delete from public.series_region_restrictions;
set role anon;
select public.test_expect('anon after lifting', public.test_counts(), '2,2,2');
reset role;

-- 6. Rollback script removes everything and leaves the base policies.
\i scripts/region-restrictions/rollback.sql
select public.test_expect('rollback: table gone',
  (to_regclass('public.series_region_restrictions') is null)::text, 'true');
select public.test_expect('rollback: restrictive policies gone',
  (select count(*)::text from pg_policies where policyname like '%region_restricted%'), '0');
set role anon;
select public.test_expect('anon after rollback', public.test_counts(), '2,2,2');
reset role;

\echo 'region restrictions check passed'
