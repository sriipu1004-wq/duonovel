-- Issue #139 (rights) CI fixture (disposable PostgreSQL only, never Production).
-- Minimal copy of the Production columns, constraints and the public read
-- view that apply.sql / rollback.sql / dryrun.sql touch, as read on 2026-11-15.
-- Seeds the 8 target public works (63 chapters) of the official account plus
-- non-target rows that must stay untouched.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
end $$;

create schema auth;
create table auth.users (id uuid primary key, email text);
insert into auth.users values
  ('11111111-1111-4111-8111-111111111111', 'libread08@gmail.com'),
  ('22222222-2222-4222-8222-222222222222', 'other@example.invalid');

create table public.series (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null,
  title text not null,
  is_public boolean default true,
  created_at timestamptz default now(),
  tags text[] not null default '{}',
  genres text[] not null default '{}',
  effect_settings jsonb,
  publication_status text not null default 'private'
    check (publication_status in ('private','public')),
  content_rating text not null default 'general' check (content_rating in ('general','r18')),
  content_warnings text[] not null default '{}'
    check (content_warnings <@ array['sexual_r18','violence']),
  source_language text,
  translation_permission_mode text not null default 'closed'
);
create table public.episodes (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references public.series(id) on delete cascade,
  episode_number integer not null,
  title text not null,
  body text not null,
  created_at timestamptz default now(),
  is_published boolean not null default true,
  posting_status text not null default 'draft'
    check (posting_status in ('draft','scheduled','posted')),
  scheduled_for timestamptz,
  posted_at timestamptz,
  last_edited_at timestamptz,
  unique (series_id, episode_number),
  check ((posting_status = 'scheduled' and scheduled_for is not null)
      or (posting_status in ('draft','posted') and scheduled_for is null))
);
create view public.public_episode_work_summaries as
  select e.series_id, count(*)::integer episode_count
  from public.episodes e join public.series s on s.id = e.series_id
  where s.publication_status = 'public' and e.posting_status = 'posted' and e.is_published = true
  group by e.series_id;
-- Kept-as-is tables read by dryrun.sql only.
create table public.recordings (id uuid primary key default gen_random_uuid(),
  series_id uuid, episode_id uuid, is_public boolean default true);
create table public.episode_translations (id uuid primary key default gen_random_uuid(), episode_id uuid);
create table public.episode_human_translations (id uuid primary key default gen_random_uuid(),
  series_id uuid, episode_id uuid);
create table public.user_series_bookmarks (id uuid primary key default gen_random_uuid(), series_id uuid);

-- Targets: 8 public works of the official account, 63 posted chapters.
insert into public.series (id, author_id, title, is_public, publication_status, source_language)
select x.id, '11111111-1111-4111-8111-111111111111', 't' || x.k, true, 'public', 'ja'
from (values ('8514e9da-7864-4dad-a397-de06abee8fdc'::uuid, 6),
             ('d5cc7bf2-c76e-49e8-a078-150636fc0344'::uuid, 4),
             ('4d328931-ca04-4843-bcb5-9ac080cfbbf1'::uuid, 5),
             ('ac25272b-fc09-4f20-a94a-816791e750d0'::uuid, 8),
             ('82309887-add7-4406-aa18-d8a435c3b967'::uuid, 6),
             ('f7ba9cd3-0ede-48df-92d7-2ea297f33475'::uuid, 13),
             ('833b0303-d034-4ebb-ae6f-e023dd765a64'::uuid, 15),
             ('4f48c202-3ba1-47cb-b887-90880534c96e'::uuid, 6)) x(id, k);
insert into public.episodes (series_id, episode_number, title, body, is_published, posting_status, posted_at, last_edited_at)
select s.id, n, 'c' || n, 'b', true, 'posted',
       '2026-10-01T00:00Z'::timestamptz + make_interval(mins => n),
       case when n = 2 then '2026-10-05T00:00Z'::timestamptz end
from public.series s
join (values ('8514e9da-7864-4dad-a397-de06abee8fdc'::uuid, 6), ('d5cc7bf2-c76e-49e8-a078-150636fc0344', 4),
             ('4d328931-ca04-4843-bcb5-9ac080cfbbf1', 5), ('ac25272b-fc09-4f20-a94a-816791e750d0', 8),
             ('82309887-add7-4406-aa18-d8a435c3b967', 6), ('f7ba9cd3-0ede-48df-92d7-2ea297f33475', 13),
             ('833b0303-d034-4ebb-ae6f-e023dd765a64', 15), ('4f48c202-3ba1-47cb-b887-90880534c96e', 6)) x(id, k)
  on x.id = s.id
cross join lateral generate_series(1, x.k) n;
insert into public.recordings (series_id, episode_id)
select e.series_id, e.id from public.episodes e;
insert into public.episode_translations (episode_id)
select e.id from public.episodes e
where e.series_id = '833b0303-d034-4ebb-ae6f-e023dd765a64' and e.episode_number = 1;

-- Non-targets: another public work and a private work (legacy is_public true,
-- like Production's private rows) of the official account, and a public work
-- of another account. None may change.
insert into public.series (id, author_id, title, is_public, publication_status, source_language) values
  ('00000000-0000-4000-8000-0000000000a1', '11111111-1111-4111-8111-111111111111', 'n1', true, 'public', 'ja'),
  ('00000000-0000-4000-8000-0000000000a2', '11111111-1111-4111-8111-111111111111', 'n2', true, 'private', 'ja'),
  ('00000000-0000-4000-8000-0000000000a3', '22222222-2222-4222-8222-222222222222', 'n3', true, 'public', 'ja');
insert into public.episodes (series_id, episode_number, title, body, is_published, posting_status, posted_at) values
  ('00000000-0000-4000-8000-0000000000a1', 1, 'c1', 'b', true, 'posted', '2026-01-01T00:00Z'),
  ('00000000-0000-4000-8000-0000000000a1', 2, 'c2', 'b', false, 'draft', null),
  ('00000000-0000-4000-8000-0000000000a3', 1, 'c1', 'b', true, 'posted', '2026-01-02T00:00Z');

create schema ci;
create table ci.series_before as select * from public.series;
create table ci.episodes_before as select * from public.episodes;
