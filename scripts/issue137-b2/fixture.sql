-- Issue #137 B2: disposable LOCAL Supabase schema approximation only.
create table public.users (
 id uuid primary key references auth.users(id),
 show_r18_content boolean not null default false, r18_confirmed_at timestamptz, display_name text not null default 'SYNTHETIC'
);
create table public.series (
 id uuid primary key, author_id uuid not null references auth.users(id),
 publication_status text not null default 'public',
 content_rating text not null default 'general',
 content_warnings text[] not null default '{}'::text[]
);
create table public.episodes (
 id uuid primary key, series_id uuid not null references public.series(id),
 posting_status text not null default 'posted', is_published boolean not null default true,
 body text not null
);
create table public.recordings (
 id uuid primary key, series_id uuid references public.series(id),
 episode_id uuid not null references public.episodes(id),
 reader_id uuid, reader_user_id uuid,
 is_public boolean not null default true, audio_storage_path text
);
create table public.episode_human_translations (
 id uuid primary key, series_id uuid references public.series(id),
 translator_user_id uuid, episode_id uuid references public.episodes(id)
);
revoke all on public.users,public.series,public.episodes,public.recordings,public.episode_human_translations from public,anon,authenticated;
grant all on public.users,public.series,public.episodes,public.recordings,public.episode_human_translations to service_role;
grant select on public.series,public.episodes,public.recordings to anon,authenticated;
grant update on public.series,public.episodes to authenticated;
alter table public.users enable row level security;
alter table public.series enable row level security;
alter table public.episodes enable row level security;
alter table public.recordings enable row level security;
create policy fixture_users_self on public.users for select to authenticated
using (id=(select auth.uid()));
create policy series_select_public_or_owner on public.series for select to public
using (author_id=(select auth.uid()) or publication_status='public');
create policy series_owner_update on public.series for update to authenticated
using (author_id=(select auth.uid())) with check (author_id=(select auth.uid()));
create policy episodes_public_or_owner_select on public.episodes for select to public
using (exists (select 1 from public.series s where s.id=episodes.series_id
 and (s.author_id=(select auth.uid()) or
 (s.publication_status='public' and episodes.posting_status='posted' and episodes.is_published=true))));
create policy episodes_owner_update on public.episodes for update to authenticated
using (exists(select 1 from public.series s where s.id=episodes.series_id and s.author_id=(select auth.uid())))
with check (exists(select 1 from public.series s where s.id=episodes.series_id and s.author_id=(select auth.uid())));
create policy recordings_select_public_visible on public.recordings for select to anon,authenticated
using (is_public=true and exists (
 select 1 from public.episodes e join public.series s on s.id=e.series_id
 where e.id=recordings.episode_id and s.id=recordings.series_id
 and s.publication_status='public' and e.posting_status='posted' and e.is_published=true
));
create view public.public_episode_work_summaries with (security_invoker=true) as
 select e.series_id,count(*)::integer as episode_count
 from public.episodes e join public.series s on s.id=e.series_id
 where s.publication_status='public' and e.posting_status='posted' and e.is_published=true
 group by e.series_id;
grant select on public.public_episode_work_summaries to anon,authenticated;
