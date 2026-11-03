-- Issue #137 R0: disposable Supabase GoTrue/PostgREST/Storage fixture only.
-- NOT an application migration. NO hosted Supabase access/identities/files.
create table public.series (
  id uuid primary key,
  author_id uuid not null references auth.users(id),
  publication_status text not null default 'public',
  content_rating text not null default 'general',
  content_warnings text[] not null default '{}'::text[]
);
create table public.episodes (
  id uuid primary key,
  series_id uuid not null references public.series(id),
  posting_status text not null default 'posted',
  is_published boolean not null default true
);
create table public.recordings (
  id uuid primary key,
  series_id uuid references public.series(id),
  episode_id uuid not null references public.episodes(id),
  is_public boolean not null default true,
  audio_storage_path text
);
revoke all on public.series,public.episodes,public.recordings
  from public,anon,authenticated;
grant all on public.series,public.episodes,public.recordings to service_role;
grant select on public.series,public.episodes,public.recordings to anon;
grant select,update on public.series,public.episodes to authenticated;
grant select on public.recordings to authenticated;

alter table public.series enable row level security;
alter table public.episodes enable row level security;
alter table public.recordings enable row level security;

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
