create table if not exists public.bgm_library (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text not null default '',
  mood text not null default '',
  use_case text not null default '',
  duration_label text not null default '',
  loopable boolean not null default false,
  audio_path text not null,
  source_label text not null default 'サイト用意BGM',
  rights_label text not null default 'LIB read内利用想定',
  tags text[] not null default '{}'::text[],
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists bgm_library_is_active_sort_order_idx
  on public.bgm_library (is_active, sort_order, created_at desc);

grant select on public.bgm_library to anon, authenticated;

alter table public.bgm_library enable row level security;

drop policy if exists "bgm_library_select_public" on public.bgm_library;
create policy "bgm_library_select_public"
  on public.bgm_library
  for select
  using (true);

insert into public.bgm_library (
  slug,
  title,
  description,
  mood,
  use_case,
  duration_label,
  loopable,
  audio_path,
  source_label,
  rights_label,
  tags,
  is_active,
  sort_order
)
values
(
  'demo-bgm-001',
  'デモBGM 01',
  'BGM素材ページ最小版の試聴用デモ音源。まずはサイト側で用意したBGMだけを探して試せる状態を優先している。',
  '穏やか',
  '日常',
  '確認中',
  true,
  '/test-audio/demo-bgm.mp3',
  'サイト用意BGM',
  'LIB read内利用想定',
  array['デモ', '試聴', '最小版', '穏やか', '日常'],
  true,
  10
)
on conflict (slug) do update
set
  title = excluded.title,
  description = excluded.description,
  mood = excluded.mood,
  use_case = excluded.use_case,
  duration_label = excluded.duration_label,
  loopable = excluded.loopable,
  audio_path = excluded.audio_path,
  source_label = excluded.source_label,
  rights_label = excluded.rights_label,
  tags = excluded.tags,
  is_active = excluded.is_active,
  sort_order = excluded.sort_order,
  updated_at = timezone('utc', now());