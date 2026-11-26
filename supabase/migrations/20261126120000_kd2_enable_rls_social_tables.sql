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

alter table public.author_follows enable row level security;
alter table public.author_profile_likes enable row level security;
alter table public.reader_card_likes enable row level security;
alter table public.bgm_library_favorites enable row level security;
alter table public.nemo_generation_queue enable row level security;
