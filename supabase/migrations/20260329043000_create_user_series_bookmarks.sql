create table if not exists public.user_series_bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  series_id uuid not null references public.series (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint user_series_bookmarks_user_id_series_id_key unique (user_id, series_id)
);

create index if not exists idx_user_series_bookmarks_user_id_created_at
  on public.user_series_bookmarks (user_id, created_at desc);

create index if not exists idx_user_series_bookmarks_series_id
  on public.user_series_bookmarks (series_id);

alter table public.user_series_bookmarks enable row level security;

drop policy if exists "user_series_bookmarks_select_own" on public.user_series_bookmarks;
create policy "user_series_bookmarks_select_own"
on public.user_series_bookmarks
for select
using (auth.uid() = user_id);

drop policy if exists "user_series_bookmarks_insert_own" on public.user_series_bookmarks;
create policy "user_series_bookmarks_insert_own"
on public.user_series_bookmarks
for insert
with check (auth.uid() = user_id);

drop policy if exists "user_series_bookmarks_delete_own" on public.user_series_bookmarks;
create policy "user_series_bookmarks_delete_own"
on public.user_series_bookmarks
for delete
using (auth.uid() = user_id);