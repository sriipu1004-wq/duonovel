-- Issue #139 (rights): READ-ONLY preflight for making the 8 §104A works
-- private. Output is aggregates only (no titles, bodies or account ids).
-- Expected before apply.sql (Production, 2026-11-15):
--   series_n=8, public_n=8, is_public_n=8, episodes_n=63, posted_n=63,
--   ep_count_ok=true, one_author=true, official_author=true,
--   not_applied=true, in_public_view_n=8
-- Informational (kept, not changed by apply.sql): recordings_n,
--   recordings_public_n, ai_translations_n, human_translations_n, bookmarks_n.
begin read only;
with target(series_id, expected_episodes) as (
  values
    ('8514e9da-7864-4dad-a397-de06abee8fdc'::uuid, 6),
    ('d5cc7bf2-c76e-49e8-a078-150636fc0344'::uuid, 4),
    ('4d328931-ca04-4843-bcb5-9ac080cfbbf1'::uuid, 5),
    ('ac25272b-fc09-4f20-a94a-816791e750d0'::uuid, 8),
    ('82309887-add7-4406-aa18-d8a435c3b967'::uuid, 6),
    ('f7ba9cd3-0ede-48df-92d7-2ea297f33475'::uuid, 13),
    ('833b0303-d034-4ebb-ae6f-e023dd765a64'::uuid, 15),
    ('4f48c202-3ba1-47cb-b887-90880534c96e'::uuid, 6)
), s as (
  select t.*, s.is_public, s.publication_status, s.author_id
  from target t join public.series s on s.id = t.series_id
), e as (
  select e.series_id, count(*) n,
         count(*) filter (where e.posting_status = 'posted' and e.is_published = true
                            and e.scheduled_for is null and e.posted_at is not null) posted_n,
         min(e.episode_number) mn, max(e.episode_number) mx
  from public.episodes e where e.series_id in (select series_id from target)
  group by e.series_id
)
select
  count(*) series_n,
  count(*) filter (where s.publication_status = 'public') public_n,
  count(*) filter (where s.is_public = true) is_public_n,
  coalesce(sum(e.n), 0) episodes_n,
  coalesce(sum(e.posted_n), 0) posted_n,
  coalesce(bool_and(e.n = s.expected_episodes and e.mn = 1 and e.mx = s.expected_episodes), false) ep_count_ok,
  count(distinct s.author_id) = 1 one_author,
  coalesce(bool_and(s.author_id = (select u.id from auth.users u where u.email = 'libread08@gmail.com')), false)
    and (select count(*) from auth.users u where u.email = 'libread08@gmail.com') = 1 official_author,
  to_regclass('libread_internal.issue139_unpublish_series_20261115') is null
    and to_regclass('libread_internal.issue139_unpublish_episodes_20261115') is null not_applied,
  (select count(*) from public.public_episode_work_summaries v
   where v.series_id in (select series_id from target)) in_public_view_n,
  (select count(*) from public.recordings r where r.series_id in (select series_id from target)) recordings_n,
  (select count(*) from public.recordings r where r.series_id in (select series_id from target) and r.is_public) recordings_public_n,
  (select count(*) from public.episode_translations x join public.episodes pe on pe.id = x.episode_id
   where pe.series_id in (select series_id from target)) ai_translations_n,
  (select count(*) from public.episode_human_translations x where x.series_id in (select series_id from target)) human_translations_n,
  (select count(*) from public.user_series_bookmarks b where b.series_id in (select series_id from target)) bookmarks_n
from s left join e on e.series_id = s.series_id;
rollback;
