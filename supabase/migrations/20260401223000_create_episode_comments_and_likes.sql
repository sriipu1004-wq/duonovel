create table if not exists public.user_episode_comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  episode_id uuid not null references public.episodes (id) on delete cascade,
  body text not null,
  author_name_snapshot text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_episode_comments_episode_id_created_at
  on public.user_episode_comments (episode_id, created_at desc);

alter table public.user_episode_comments enable row level security;

drop policy if exists "user_episode_comments_select_all" on public.user_episode_comments;
create policy "user_episode_comments_select_all"
on public.user_episode_comments
for select
using (true);

drop policy if exists "user_episode_comments_insert_own" on public.user_episode_comments;
create policy "user_episode_comments_insert_own"
on public.user_episode_comments
for insert
with check (auth.uid() = user_id);

drop policy if exists "user_episode_comments_update_own" on public.user_episode_comments;
create policy "user_episode_comments_update_own"
on public.user_episode_comments
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "user_episode_comments_delete_own" on public.user_episode_comments;
create policy "user_episode_comments_delete_own"
on public.user_episode_comments
for delete
using (auth.uid() = user_id);

create table if not exists public.user_episode_comment_likes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  comment_id uuid not null references public.user_episode_comments (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint user_episode_comment_likes_user_id_comment_id_key unique (user_id, comment_id)
);

create index if not exists idx_user_episode_comment_likes_comment_id
  on public.user_episode_comment_likes (comment_id);

create index if not exists idx_user_episode_comment_likes_user_id_created_at
  on public.user_episode_comment_likes (user_id, created_at desc);

alter table public.user_episode_comment_likes enable row level security;

drop policy if exists "user_episode_comment_likes_select_all" on public.user_episode_comment_likes;
create policy "user_episode_comment_likes_select_all"
on public.user_episode_comment_likes
for select
using (true);

drop policy if exists "user_episode_comment_likes_insert_own" on public.user_episode_comment_likes;
create policy "user_episode_comment_likes_insert_own"
on public.user_episode_comment_likes
for insert
with check (auth.uid() = user_id);

drop policy if exists "user_episode_comment_likes_delete_own" on public.user_episode_comment_likes;
create policy "user_episode_comment_likes_delete_own"
on public.user_episode_comment_likes
for delete
using (auth.uid() = user_id);