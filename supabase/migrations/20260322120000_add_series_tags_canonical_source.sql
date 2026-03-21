alter table public.series
add column if not exists tags text[];

update public.series
set tags = '{}'::text[]
where tags is null;

alter table public.series
alter column tags set default '{}'::text[];

update public.series
set tags = '{}'::text[]
where tags is null;

alter table public.series
alter column tags set not null;

create index if not exists series_tags_gin_idx
  on public.series
  using gin (tags);

comment on column public.series.tags is
  'Canonical source for normalized series tags. Used as the authoritative tag array for filtering, search, and related display logic.';