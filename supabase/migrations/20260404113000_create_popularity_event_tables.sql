create table if not exists public.series_view_events (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references public.series (id) on delete cascade,
  episode_id uuid not null references public.episodes (id) on delete cascade,
  episode_number integer not null check (episode_number > 0),
  user_id uuid references auth.users (id) on delete set null,
  session_id text not null check (char_length(trim(session_id)) > 0),
  created_at timestamptz not null default now(),
  constraint series_view_events_session_id_episode_id_key unique (session_id, episode_id)
);

create index if not exists idx_series_view_events_series_id_created_at
  on public.series_view_events (series_id, created_at desc);

create index if not exists idx_series_view_events_episode_id_created_at
  on public.series_view_events (episode_id, created_at desc);

create table if not exists public.recording_play_events (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references public.series (id) on delete cascade,
  episode_id uuid not null references public.episodes (id) on delete cascade,
  episode_number integer not null check (episode_number > 0),
  recording_id uuid not null references public.recordings (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  session_id text not null check (char_length(trim(session_id)) > 0),
  created_at timestamptz not null default now(),
  constraint recording_play_events_session_id_recording_id_key unique (session_id, recording_id)
);

create index if not exists idx_recording_play_events_series_id_created_at
  on public.recording_play_events (series_id, created_at desc);

create index if not exists idx_recording_play_events_recording_id_created_at
  on public.recording_play_events (recording_id, created_at desc);

alter table public.series_view_events enable row level security;
alter table public.recording_play_events enable row level security;

drop policy if exists "series_view_events_insert_public" on public.series_view_events;
create policy "series_view_events_insert_public"
on public.series_view_events
for insert
to anon, authenticated
with check (true);

drop policy if exists "recording_play_events_insert_public" on public.recording_play_events;
create policy "recording_play_events_insert_public"
on public.recording_play_events
for insert
to anon, authenticated
with check (true);