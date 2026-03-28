alter table public.episodes enable row level security;

drop policy if exists "episodes_select_own_series" on public.episodes;
drop policy if exists "episodes_insert_own_series" on public.episodes;
drop policy if exists "episodes_update_own_series" on public.episodes;
drop policy if exists "episodes_delete_own_series" on public.episodes;

create policy "episodes_select_own_series"
on public.episodes
for select
to authenticated
using (
  exists (
    select 1
    from public.series
    where series.id = episodes.series_id
      and series.author_id = auth.uid()
  )
);

create policy "episodes_insert_own_series"
on public.episodes
for insert
to authenticated
with check (
  exists (
    select 1
    from public.series
    where series.id = episodes.series_id
      and series.author_id = auth.uid()
  )
);

create policy "episodes_update_own_series"
on public.episodes
for update
to authenticated
using (
  exists (
    select 1
    from public.series
    where series.id = episodes.series_id
      and series.author_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.series
    where series.id = episodes.series_id
      and series.author_id = auth.uid()
  )
);

create policy "episodes_delete_own_series"
on public.episodes
for delete
to authenticated
using (
  exists (
    select 1
    from public.series
    where series.id = episodes.series_id
      and series.author_id = auth.uid()
  )
);