-- Account deletion verification fixture (LT-004 draft). LOCAL disposable Supabase ONLY.
-- Never run against hosted / Production / Preview databases.
-- Models the foreign-key delete behaviours listed in docs/account-deletion-design.md §2
-- (read-only check of Production on 2026-11-07) with MINIMAL columns. It is not the
-- full Production schema, not a migration, and it implements no deletion logic.
-- All tables live in the dedicated schema acctdel_fx so nothing in public is touched.
-- Storage rows are metadata only (storage.objects); no files are uploaded.

\set ON_ERROR_STOP on

-- Guard: refuse to run on a database that already has this fixture or looks like
-- the real application database (public.series exists there, not in a fresh local stack).
do $$
begin
  if to_regnamespace('acctdel_fx') is not null then
    raise exception 'acctdel_fx already exists: use a fresh local stack (scripts/dev/local-supabase.sh stop/start)';
  end if;
  if to_regclass('public.series') is not null then
    raise exception 'public.series exists: this does not look like a fresh local stack; refusing';
  end if;
  if to_regclass('auth.users') is null or to_regclass('storage.objects') is null then
    raise exception 'auth.users / storage.objects missing: start the local Supabase stack first';
  end if;
end;
$$;

begin;

create schema acctdel_fx;
revoke all on schema acctdel_fx from public;

-- ---------- synthetic Auth users (fixed UUIDs, example.invalid addresses) ----------
-- A = the account to be deleted, B = another author, C = unrelated user.
insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-00000000000a', 'authenticated', 'authenticated', 'acctdel-a@example.invalid', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-4000-8000-00000000000b', 'authenticated', 'authenticated', 'acctdel-b@example.invalid', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-4000-8000-00000000000c', 'authenticated', 'authenticated', 'acctdel-c@example.invalid', now(), now());

-- ---------- tables (FK behaviour copied from design §2) ----------
-- cascade
create table acctdel_fx.users (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null
);

-- no action: series.author_id (design §3-1: blocks auth.users delete)
create table acctdel_fx.series (
  id uuid primary key,
  author_id uuid not null references auth.users(id),
  title text not null,
  publication_status text not null check (publication_status in ('public', 'private'))
);

create table acctdel_fx.episodes (
  id uuid primary key,
  series_id uuid not null references acctdel_fx.series(id) on delete cascade,
  episode_number integer not null,
  body text not null
);

-- no action: recordings.reader_id / set null: recordings.reader_user_id
create table acctdel_fx.recordings (
  id uuid primary key,
  series_id uuid not null references acctdel_fx.series(id) on delete cascade,
  episode_id uuid not null references acctdel_fx.episodes(id) on delete cascade,
  reader_id uuid references auth.users(id),
  reader_user_id uuid references auth.users(id) on delete set null,
  bucket_id text not null,
  storage_path text not null
);

-- cascade (design §3-2: human translations on other people's works vanish silently)
create table acctdel_fx.episode_human_translations (
  id uuid primary key,
  series_id uuid not null references acctdel_fx.series(id) on delete cascade,
  episode_id uuid not null references acctdel_fx.episodes(id) on delete cascade,
  translator_user_id uuid not null references auth.users(id) on delete cascade,
  target_language text not null,
  status text not null check (status in ('draft', 'published', 'withdrawn'))
);

-- cascade (design §3-3: billing records vs retention duty, owner decision pending)
create table acctdel_fx.libread_billing_customers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text not null unique
);

create table acctdel_fx.libread_billing_subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text not null,
  stripe_subscription_id text not null unique,
  status text not null
);

create table acctdel_fx.public_episode_translation_unlocks (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  episode_id uuid not null references acctdel_fx.episodes(id) on delete cascade,
  target_language text not null,
  credit_cost integer not null default 0
);

-- no FK (design §2: linked by column only; credit_ledger is append-only, §3-5)
create table acctdel_fx.credit_ledger (
  id uuid primary key,
  user_id uuid not null,
  amount integer not null check (amount <> 0),
  entry_type text not null,
  idempotency_key text not null,
  unique (user_id, idempotency_key)
);

create table acctdel_fx.credit_purchase_lots (
  id uuid primary key,
  user_id uuid not null,
  pack_id text not null,
  credits_granted integer not null check (credits_granted > 0)
);

-- set null
create table acctdel_fx.bilingual_word_explanations (
  id uuid primary key,
  owner_user_id uuid references auth.users(id) on delete set null,
  selected_text text not null
);

create table acctdel_fx.series_view_events (
  id uuid primary key,
  series_id uuid not null references acctdel_fx.series(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null
);

-- cascade (social / private library examples)
create table acctdel_fx.user_series_bookmarks (
  user_id uuid not null references auth.users(id) on delete cascade,
  series_id uuid not null references acctdel_fx.series(id) on delete cascade,
  primary key (user_id, series_id)
);

create table acctdel_fx.private_library_works (
  id uuid primary key,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  title text not null
);

-- ---------- synthetic rows ----------
insert into acctdel_fx.users (id, display_name) values
  ('a0000000-0000-4000-8000-00000000000a', 'fixture-A'),
  ('b0000000-0000-4000-8000-00000000000b', 'fixture-B'),
  ('c0000000-0000-4000-8000-00000000000c', 'fixture-C');

-- A owns one public and one private work; B owns one public work.
insert into acctdel_fx.series (id, author_id, title, publication_status) values
  ('a1000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-00000000000a', 'A public work', 'public'),
  ('a1000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-00000000000a', 'A private work', 'private'),
  ('b1000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-00000000000b', 'B public work', 'public');

insert into acctdel_fx.episodes (id, series_id, episode_number, body) values
  ('a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 1, 'synthetic body A1'),
  ('a2000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000002', 1, 'synthetic body A2'),
  ('b2000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 1, 'synthetic body B1');

-- Recordings: A reads A's work; A reads B's work (human narration on someone else's work);
-- B reads A's work (someone else's narration on the deleted user's work).
insert into acctdel_fx.recordings (id, series_id, episode_id, reader_id, reader_user_id, bucket_id, storage_path) values
  ('a3000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-00000000000a', 'acctdel-fx-private', 'a0000000-0000-4000-8000-00000000000a/a3-1.m4a'),
  ('a3000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-00000000000a', 'acctdel-fx-private', 'a0000000-0000-4000-8000-00000000000a/a3-2.m4a'),
  ('b3000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-00000000000b', 'b0000000-0000-4000-8000-00000000000b', 'acctdel-fx-private', 'b0000000-0000-4000-8000-00000000000b/b3-1.m4a');

-- Human translations: A translates B's work; B translates A's work.
insert into acctdel_fx.episode_human_translations (id, series_id, episode_id, translator_user_id, target_language, status) values
  ('a4000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-00000000000a', 'en', 'published'),
  ('b4000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-00000000000b', 'ko', 'published');

insert into acctdel_fx.libread_billing_customers (user_id, stripe_customer_id) values
  ('a0000000-0000-4000-8000-00000000000a', 'cus_fixture_A'),
  ('c0000000-0000-4000-8000-00000000000c', 'cus_fixture_C');

insert into acctdel_fx.libread_billing_subscriptions (user_id, stripe_customer_id, stripe_subscription_id, status) values
  ('a0000000-0000-4000-8000-00000000000a', 'cus_fixture_A', 'sub_fixture_A', 'active');

insert into acctdel_fx.public_episode_translation_unlocks (id, user_id, episode_id, target_language, credit_cost) values
  ('a5000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-00000000000a', 'b2000000-0000-4000-8000-000000000001', 'en', 1),
  ('c5000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-00000000000c', 'a2000000-0000-4000-8000-000000000001', 'en', 1);

insert into acctdel_fx.credit_ledger (id, user_id, amount, entry_type, idempotency_key) values
  ('a6000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-00000000000a', 10, 'purchase', 'fx-a-purchase-1'),
  ('a6000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-00000000000a', -1, 'unlock', 'fx-a-unlock-1'),
  ('c6000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-00000000000c', 10, 'purchase', 'fx-c-purchase-1');

insert into acctdel_fx.credit_purchase_lots (id, user_id, pack_id, credits_granted) values
  ('a7000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-00000000000a', 'pack_fixture', 10);

insert into acctdel_fx.bilingual_word_explanations (id, owner_user_id, selected_text) values
  ('a8000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-00000000000a', 'synthetic word');

insert into acctdel_fx.series_view_events (id, series_id, user_id) values
  ('a9000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-00000000000a'),
  ('c9000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-00000000000c');

insert into acctdel_fx.user_series_bookmarks (user_id, series_id) values
  ('a0000000-0000-4000-8000-00000000000a', 'b1000000-0000-4000-8000-000000000001'),
  ('c0000000-0000-4000-8000-00000000000c', 'a1000000-0000-4000-8000-000000000001');

insert into acctdel_fx.private_library_works (id, owner_user_id, title) values
  ('aa000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-00000000000a', 'A private import');

-- Storage metadata rows only (no file bytes). Bucket is fixture-only and private.
insert into storage.buckets (id, name, public) values
  ('acctdel-fx-private', 'acctdel-fx-private', false);

insert into storage.objects (bucket_id, name, owner_id) values
  ('acctdel-fx-private', 'a0000000-0000-4000-8000-00000000000a/a3-1.m4a', 'a0000000-0000-4000-8000-00000000000a'),
  ('acctdel-fx-private', 'a0000000-0000-4000-8000-00000000000a/a3-2.m4a', 'a0000000-0000-4000-8000-00000000000a'),
  ('acctdel-fx-private', 'a0000000-0000-4000-8000-00000000000a/library/import.txt', 'a0000000-0000-4000-8000-00000000000a'),
  ('acctdel-fx-private', 'b0000000-0000-4000-8000-00000000000b/b3-1.m4a', 'b0000000-0000-4000-8000-00000000000b');

-- Snapshot table used by snapshot.sql
create table acctdel_fx.snapshots (
  label text not null,
  check_name text not null,
  row_count bigint not null,
  taken_at timestamptz not null default now(),
  primary key (label, check_name)
);

commit;

select 'FIXTURE_LOADED' as status,
       (select count(*) from auth.users where email like 'acctdel-%@example.invalid') as synthetic_users,
       (select count(*) from storage.objects where bucket_id = 'acctdel-fx-private') as storage_rows;
