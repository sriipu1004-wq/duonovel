-- Issue #139 CI fixture (disposable PostgreSQL only, never Production).
-- Minimal copy of the Production columns, constraints and the public read
-- view that apply.sql / rollback.sql touch, as read on 2026-11-15.
-- Seeds the 4 target Drafts plus non-target rows that must stay untouched.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
end $$;

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

create function pg_temp.pd(manifest text) returns jsonb language sql as $$
  select jsonb_build_object('version', 1, 'publicDomain', jsonb_build_object(
    'manifestId', manifest, 'sourceProvider', 'Aozora Bunko', 'rightsChecked', true))
$$;

-- Target Drafts (official account 1111...).
insert into public.series (id, author_id, title, is_public, publication_status, content_warnings, effect_settings, source_language) values
  ('e47476bc-07d3-4c65-86a1-78237e3c6948', '11111111-1111-4111-8111-111111111111', 't1', false, 'private', '{violence}', pg_temp.pd('aozora-000692'), 'ja'),
  ('6d832ac6-b457-43ff-97ef-50281b337ca3', '11111111-1111-4111-8111-111111111111', 't2', false, 'private', '{}', pg_temp.pd('aozora-033200'), 'ja'),
  ('7babc9f9-f015-4135-ba92-da0f54864158', '11111111-1111-4111-8111-111111111111', 't3', false, 'private', '{violence}', pg_temp.pd('aozora-053520'), 'ja'),
  ('a173c008-3e53-4126-927b-366e44a69b48', '11111111-1111-4111-8111-111111111111', 't4', false, 'private', '{}', pg_temp.pd('aozora-004386'), 'ja');
insert into public.episodes (series_id, episode_number, title, body, is_published, posting_status)
select s.id, n, 'c' || n, 'b', false, 'draft'
from public.series s
join (values ('e47476bc-07d3-4c65-86a1-78237e3c6948'::uuid, 1), ('6d832ac6-b457-43ff-97ef-50281b337ca3', 1),
             ('7babc9f9-f015-4135-ba92-da0f54864158', 8), ('a173c008-3e53-4126-927b-366e44a69b48', 2)) x(id, k)
  on x.id = s.id
cross join lateral generate_series(1, x.k) n;

-- Non-targets: another private Draft PD work of the same account and a public
-- work with one Draft chapter. Neither may change.
insert into public.series (id, author_id, title, is_public, publication_status, effect_settings, source_language) values
  ('00000000-0000-4000-8000-0000000000a1', '11111111-1111-4111-8111-111111111111', 'n1', false, 'private', pg_temp.pd('aozora-999999'), 'ja'),
  ('00000000-0000-4000-8000-0000000000a2', '22222222-2222-4222-8222-222222222222', 'n2', true, 'public', null, 'ja');
insert into public.episodes (series_id, episode_number, title, body, is_published, posting_status, posted_at) values
  ('00000000-0000-4000-8000-0000000000a1', 1, 'c1', 'b', false, 'draft', null),
  ('00000000-0000-4000-8000-0000000000a2', 1, 'c1', 'b', true, 'posted', '2026-01-01T00:00Z'),
  ('00000000-0000-4000-8000-0000000000a2', 2, 'c2', 'b', false, 'draft', null);

create schema ci;
create table ci.series_before as select * from public.series;
create table ci.episodes_before as select * from public.episodes;
