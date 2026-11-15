-- Legacy official attribution CI fixture (disposable PostgreSQL only, never
-- Production). Minimal copy of the Production columns apply.sql /
-- rollback.sql / dryrun.sql touch, as read on 2026-11-15. The 28 target rows
-- are seeded afterwards by `node targets.mjs --fixture-sql`; this file adds
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
  description text,
  is_public boolean default true,
  created_at timestamptz default now(),
  tags text[] not null default '{}',
  effect_settings jsonb,
  publication_status text not null default 'private'
    check (publication_status in ('private','public')),
  source_language text
);

-- Non-targets: Public Domain official work (文鳥), a §104A work made private
-- (#210), and a user work with NULL settings.
insert into public.series (id, author_id, title, effect_settings, publication_status, is_public, source_language) values
  ('e943259d-600a-437e-9147-16fd722357a7', '11111111-1111-4111-8111-111111111111', '文鳥・夏目漱石',
   '{"publicDomain":{"rightsChecked":true,"originalAuthor":"夏目漱石"}}', 'public', true, 'ja'),
  ('4d328931-ca04-4843-bcb5-9ac080cfbbf1', '11111111-1111-4111-8111-111111111111', '人間失格・太宰治',
   null, 'private', false, 'ja'),
  ('33333333-3333-4333-8333-333333333333', '22222222-2222-4222-8222-222222222222', 'user work',
   null, 'public', true, 'ja');
