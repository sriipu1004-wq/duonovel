-- An isolated fixture sentinel. The rollback rehearsal absolutely refuses any
-- database lacking this schema+row; NEVER add this sentinel to hosted Supabase.
create schema libread_r0_disposable;
revoke all on schema libread_r0_disposable from public,anon,authenticated;
create table libread_r0_disposable.sentinel (
 id boolean primary key default true check (id = true),
 purpose text not null check (purpose='SYNTHETIC-R0-ONLY')
);
revoke all on libread_r0_disposable.sentinel from public,anon,authenticated;
insert into libread_r0_disposable.sentinel(id,purpose)
values(true,'SYNTHETIC-R0-ONLY');

-- Issue #137 R0: disposable Supabase GoTrue/PostgREST/Storage fixture only.
-- NOT an application migration. NO hosted Supabase access/identities/files.
create table public.series (
  id uuid primary key,
  author_id uuid not null references auth.users(id),
  title text not null default 'Synthetic title',
  description text not null default 'synthetic summary',
  tags text[] not null default '{}'::text[],
  genres text[] not null default '{}'::text[],
  effect_settings jsonb not null default '{}'::jsonb,
  source_language text not null default 'ja',
  translation_permission_mode text not null default 'open',
  recording_permission_mode text not null default 'open',
  publication_status text not null default 'public',
  content_rating text not null default 'general',
  content_warnings text[] not null default '{}'::text[],
  content_warning_locks text[] not null default '{}'::text[],
  created_at timestamptz not null default now()
);
create table public.episodes (
  id uuid primary key,
  series_id uuid not null references public.series(id),
  episode_number integer not null default 1,
  body text not null default 'SYNTHETIC READER CONTENT',
  scheduled_for timestamptz,
  posted_at timestamptz not null default now(),
  posting_status text not null default 'posted',
  is_published boolean not null default true
);
create table public.recordings (
  id uuid primary key,
  series_id uuid references public.series(id),
  episode_id uuid not null references public.episodes(id),
  reader_id uuid not null,
  reader_user_id uuid,
  reader_name text,
  voice_model_id uuid,
  is_public boolean default true,
  audio_storage_path text not null,
  created_at timestamptz not null default now()
);
create table public.users (
  id uuid primary key references auth.users(id),
  display_name text not null default 'SYNTHETIC AUTHOR',
  show_r18_content boolean not null default false,
  r18_confirmed_at timestamptz
);
-- Test-only current narrator consent; no hosted user or token.
create table public.user_recording_consents (
 user_id uuid not null references auth.users(id),
 consent_key text not null,
 consent_version text not null,
 primary key (user_id,consent_key)
);
grant all on public.user_recording_consents to service_role;
grant select on public.user_recording_consents to authenticated;
alter table public.user_recording_consents enable row level security;
create policy r0_narrator_current_consent on public.user_recording_consents
 for select to authenticated using (user_id=(select auth.uid()));
-- LOCAL FIXTURE ONLY: emulate a previously approved PRIVATE bucket.
-- Production must provision it through the Storage API outside of B2 DDL.
insert into storage.buckets(id,name,public)
 values('r18-recording-audio','r18-recording-audio',false)
 on conflict(id) do nothing;
insert into storage.buckets(id,name,public)
 values('human-recording-audio','human-recording-audio',false)
 on conflict(id) do nothing;

create table public.episode_human_translations (
  id uuid primary key,
  series_id uuid not null references public.series(id),
  episode_id uuid not null references public.episodes(id),
  translator_user_id uuid
);
revoke all on public.series,public.episodes,public.recordings,
 public.users,public.episode_human_translations from public,anon,authenticated;
grant all on public.series,public.episodes,public.recordings,
 public.users,public.episode_human_translations to service_role;
grant select on public.series,public.episodes,public.recordings to anon;
grant select,update on public.series,public.episodes to authenticated;
grant select on public.recordings to authenticated;
-- Mirror observed hosted metadata: signed-in users have SELECT but RLS
-- users_select_own limits actual rows to id=auth.uid(). Anon is not granted.
grant select on public.users to authenticated;

alter table public.series enable row level security;
alter table public.episodes enable row level security;
alter table public.recordings enable row level security;
alter table public.users enable row level security;
alter table public.episode_human_translations enable row level security;
create policy r0_users_self on public.users for select to authenticated
  using (id=(select auth.uid()));

create policy r0_series_view on public.series for select to anon,authenticated
  using (publication_status='public' or author_id=(select auth.uid()));
create policy r0_series_owner_mutation on public.series for update to authenticated
  using (author_id=(select auth.uid()))
  with check (author_id=(select auth.uid()));
create policy r0_episode_read on public.episodes for select to anon,authenticated
  using (exists (
    select 1 from public.series s where s.id=episodes.series_id
      and (s.author_id=(select auth.uid()) or
        (s.publication_status='public' and
         episodes.posting_status='posted' and episodes.is_published=true))
  ));
create policy r0_episode_owner_mutation on public.episodes for update to authenticated
  using (exists(select 1 from public.series s
    where s.id=episodes.series_id and s.author_id=(select auth.uid())))
  with check (exists(select 1 from public.series s
    where s.id=episodes.series_id and s.author_id=(select auth.uid())));
create policy r0_recordings_public_select on public.recordings for select to anon,authenticated
  using (is_public=true and exists (
    select 1 from public.episodes e
      join public.series s on s.id=e.series_id
      where e.id=recordings.episode_id and s.id=recordings.series_id
        and s.publication_status='public'
        and s.content_rating='general'
        and e.posting_status='posted' and e.is_published=true
  ));

-- Private backup is visible ONLY to the narrator/owner selected in its path.
-- Ordinary user clients have no INSERT, UPDATE or DELETE policy on this bucket.
-- A privileged server-side actor is required for the test-only copy/delete.
create policy r0_backup_owner_select on storage.objects
  for select to authenticated
  using (
    bucket_id='r0-private-backup' and
    name like 'owner/' || (select auth.uid())::text || '/%'
  );

-- Genuine PostgREST public search summary view, no security-definer bypass.
-- Return only episodes whose current source and publication flags are visible.
create view public.public_episode_work_summaries with (security_invoker=true) as
select e.series_id, count(*)::integer as episode_count,
  min(e.id::text)::uuid as first_episode_id,
  min(e.episode_number)::integer as first_episode_number,
  min(e.posted_at) as first_posted_at,
  max(e.posted_at) as latest_posted_at,
  array_agg(e.episode_number order by e.episode_number)::integer[] as public_episode_numbers
from public.episodes e join public.series s on s.id=e.series_id
where s.publication_status='public' and e.posting_status='posted' and e.is_published=true
group by e.series_id;
grant select on public.public_episode_work_summaries to anon,authenticated;
