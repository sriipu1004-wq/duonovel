alter table public.series
add column if not exists genres text[];

update public.series
set genres = '{}'::text[]
where genres is null;

alter table public.series
alter column genres set default '{}'::text[];

update public.series
set genres = '{}'::text[]
where genres is null;

alter table public.series
alter column genres set not null;

create index if not exists series_genres_gin_idx
  on public.series
  using gin (genres);

comment on column public.series.genres is
  'Canonical source for normalized series genres. Used as the authoritative genre array for filtering, search, and related display logic.';