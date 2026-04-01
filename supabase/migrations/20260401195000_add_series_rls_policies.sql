alter table public.series enable row level security;

drop policy if exists "series_select_public_or_owner" on public.series;
create policy "series_select_public_or_owner"
on public.series
for select
using (
  author_id = auth.uid()
  or publication_status = 'public'
);

drop policy if exists "series_insert_owner_only" on public.series;
create policy "series_insert_owner_only"
on public.series
for insert
with check (
  auth.uid() is not null
  and author_id = auth.uid()
);

drop policy if exists "series_update_owner_only" on public.series;
create policy "series_update_owner_only"
on public.series
for update
using (
  author_id = auth.uid()
)
with check (
  author_id = auth.uid()
);

drop policy if exists "series_delete_owner_only" on public.series;
create policy "series_delete_owner_only"
on public.series
for delete
using (
  author_id = auth.uid()
);