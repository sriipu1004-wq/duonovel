create extension if not exists "pgcrypto";

create table if not exists public.bgm_library_favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bgm_library_id uuid not null references public.bgm_library(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint bgm_library_favorites_user_track_key unique (user_id, bgm_library_id)
);

create index if not exists bgm_library_favorites_user_id_idx
  on public.bgm_library_favorites (user_id);

create index if not exists bgm_library_favorites_bgm_library_id_idx
  on public.bgm_library_favorites (bgm_library_id);