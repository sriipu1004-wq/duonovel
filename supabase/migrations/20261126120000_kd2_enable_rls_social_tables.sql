-- KD-2 (docs/roadmap.md, KD section): record in the migrations the RLS state
-- that production already has.
--
-- Production check 2026-11-26 (read-only catalog check, docs/security-inventory.md):
-- RLS is already enabled on all five tables below, but no migration enabled
-- it (migration drift). Applying this file to production changes nothing.
-- It only makes a database built from the migrations match production.
--
-- No policy or grant is added or changed here. In production,
-- author_follows, author_profile_likes, reader_card_likes and
-- nemo_generation_queue have no policies (the app reads them on the server
-- with the service role); bgm_library_favorites has own-row policies that
-- are not yet in the migrations (outside this change).

--
-- Each statement takes a brief ACCESS EXCLUSIVE lock on its table. Supabase
-- runs each migration inside a transaction (CLI and apply_migration), so no
-- begin/commit here; `set local lock_timeout` applies to that transaction:
-- if a lock cannot be taken within 3s the migration fails and rolls back
-- instead of queueing traffic.

set local lock_timeout = '3s';

alter table public.author_follows enable row level security;
alter table public.author_profile_likes enable row level security;
alter table public.reader_card_likes enable row level security;
alter table public.bgm_library_favorites enable row level security;
alter table public.nemo_generation_queue enable row level security;
