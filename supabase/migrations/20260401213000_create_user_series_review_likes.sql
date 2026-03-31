create table if not exists public.user_series_review_likes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  review_id uuid not null references public.user_series_reviews (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint user_series_review_likes_user_id_review_id_key unique (user_id, review_id)
);

create index if not exists idx_user_series_review_likes_review_id
  on public.user_series_review_likes (review_id);

create index if not exists idx_user_series_review_likes_user_id_created_at
  on public.user_series_review_likes (user_id, created_at desc);

alter table public.user_series_review_likes enable row level security;

drop policy if exists "user_series_review_likes_select_all" on public.user_series_review_likes;
create policy "user_series_review_likes_select_all"
on public.user_series_review_likes
for select
using (true);

drop policy if exists "user_series_review_likes_insert_own" on public.user_series_review_likes;
create policy "user_series_review_likes_insert_own"
on public.user_series_review_likes
for insert
with check (auth.uid() = user_id);

drop policy if exists "user_series_review_likes_delete_own" on public.user_series_review_likes;
create policy "user_series_review_likes_delete_own"
on public.user_series_review_likes
for delete
using (auth.uid() = user_id);