-- Per-country publication restriction for public works (owner 2026-11-15:
-- 「特定の国では許可されてないけど他の国では問題ない…その国からのアクセス
-- 限定でこの作品は非公開」).
--
-- A row means: the work stays public, but some visitors must not receive its
-- text, translations or audio. Exactly one of the two lists is set:
--   blocked_countries: withheld from these countries (block list);
--   allowed_countries: served only to these countries (allow list, for works
--     whose status cannot be confirmed country by country).
-- A visitor whose country (Vercel x-vercel-ip-country) is unknown is always
-- withheld. The app enforces the country check (proxy + pages + APIs,
-- reading through the service role).
--
-- The database cannot see the visitor's country, so for a restricted work the
-- direct Data API path (anon / authenticated keys) is closed for everyone but
-- the work's author: RESTRICTIVE select policies on episodes, recordings and
-- episode_human_translations. Unrestricted works are unaffected.
--
-- Writes to the table are service-role only (no insert/update/delete policy),
-- so an author cannot lift a rights restriction on their own work.
-- Idempotent: safe to apply twice.

create or replace function public.is_iso_country_code_array(codes text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select codes is not null
    and cardinality(codes) > 0
    and not exists (
      select 1 from unnest(codes) c where c is null or c !~ '^[A-Z]{2}$'
    )
$$;

create table if not exists public.series_region_restrictions (
  series_id uuid primary key references public.series(id) on delete cascade,
  blocked_countries text[],
  allowed_countries text[],
  reason text not null
    constraint series_region_restrictions_reason_check
      check (length(btrim(reason)) between 1 and 2000),
  decided_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint series_region_restrictions_one_list_check check (
    (blocked_countries is not null and allowed_countries is null
      and public.is_iso_country_code_array(blocked_countries))
    or (allowed_countries is not null and blocked_countries is null
      and public.is_iso_country_code_array(allowed_countries))
  )
);

comment on table public.series_region_restrictions is
  'Works withheld from visitors in blocked_countries, or outside allowed_countries, or of unknown country. Service-role writes only; rights decisions.';

alter table public.series_region_restrictions enable row level security;

revoke all on public.series_region_restrictions from public, anon, authenticated;
-- Clients may read which works are restricted where, but not the internal
-- rights note in `reason`.
grant select (series_id, blocked_countries, allowed_countries)
  on public.series_region_restrictions to anon, authenticated;
grant select, insert, update, delete on public.series_region_restrictions to service_role;

drop policy if exists series_region_restrictions_select_all on public.series_region_restrictions;
create policy series_region_restrictions_select_all
  on public.series_region_restrictions
  for select
  to anon, authenticated
  using (true);

-- The policies below are plain (SECURITY INVOKER) expressions so the planner
-- can turn them into an anti-join. They read series_region_restrictions
-- (series_id is granted to anon / authenticated) and series (the caller's own
-- RLS shows their own works, which is all the author exception needs).
drop policy if exists episodes_region_restricted_select on public.episodes;
create policy episodes_region_restricted_select
  on public.episodes
  as restrictive
  for select
  to anon, authenticated
  using (
    not exists (
      select 1 from public.series_region_restrictions r
      where r.series_id = episodes.series_id
    )
    or exists (
      select 1 from public.series s
      where s.id = episodes.series_id
        and s.author_id = (select auth.uid())
    )
  );

drop policy if exists recordings_region_restricted_select on public.recordings;
create policy recordings_region_restricted_select
  on public.recordings
  as restrictive
  for select
  to anon, authenticated
  using (
    not exists (
      select 1 from public.series_region_restrictions r
      where r.series_id = recordings.series_id
    )
    or exists (
      select 1 from public.series s
      where s.id = recordings.series_id
        and s.author_id = (select auth.uid())
    )
  );

drop policy if exists episode_human_translations_region_restricted_select on public.episode_human_translations;
create policy episode_human_translations_region_restricted_select
  on public.episode_human_translations
  as restrictive
  for select
  to anon, authenticated
  using (
    not exists (
      select 1 from public.series_region_restrictions r
      where r.series_id = episode_human_translations.series_id
    )
    or exists (
      select 1 from public.series s
      where s.id = episode_human_translations.series_id
        and s.author_id = (select auth.uid())
    )
  );

-- An earlier draft of this migration used a SECURITY DEFINER helper; drop it
-- (after its policies were replaced above) if a database ever received it.
drop function if exists public.series_region_unrestricted_or_owner(uuid);
