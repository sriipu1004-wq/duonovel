-- Issue #139: READ-ONLY preflight for publishing the 4 approved Aozora works
-- (12 chapters) imported as private Drafts on 2026-11-15.
-- Output is aggregates only (no titles, bodies or account identifiers).
-- Expected before apply.sql: series_n=4, private_n=4, rights_checked_n=4,
-- general_n=4, episodes_n=12, draft_n=12, posted_at_null_n=12,
-- ep_count_ok=true, warnings_ok=true, one_author=true.
begin read only;
with target(series_id, manifest_id, expected_episodes, expected_warnings) as (
  values
    ('e47476bc-07d3-4c65-86a1-78237e3c6948'::uuid, 'aozora-000692', 1, array['violence']::text[]),
    ('6d832ac6-b457-43ff-97ef-50281b337ca3'::uuid, 'aozora-033200', 1, array[]::text[]),
    ('7babc9f9-f015-4135-ba92-da0f54864158'::uuid, 'aozora-053520', 8, array['violence']::text[]),
    ('a173c008-3e53-4126-927b-366e44a69b48'::uuid, 'aozora-004386', 2, array[]::text[])
), s as (
  select t.*, s.is_public, s.publication_status, s.content_rating, s.content_warnings,
         s.author_id, s.effect_settings->'publicDomain' pd
  from target t join public.series s on s.id = t.series_id
), e as (
  select e.series_id, count(*) n,
         count(*) filter (where e.posting_status = 'draft' and e.is_published = false) draft_n,
         count(*) filter (where e.posted_at is null and e.scheduled_for is null) posted_at_null_n,
         min(e.episode_number) mn, max(e.episode_number) mx
  from public.episodes e where e.series_id in (select series_id from target)
  group by e.series_id
)
select
  count(*) series_n,
  count(*) filter (where s.is_public = false and s.publication_status = 'private') private_n,
  count(*) filter (where s.pd->>'rightsChecked' = 'true'
                     and s.pd->>'manifestId' = s.manifest_id
                     and s.pd->>'sourceProvider' = 'Aozora Bunko') rights_checked_n,
  count(*) filter (where s.content_rating = 'general') general_n,
  coalesce(sum(e.n), 0) episodes_n,
  coalesce(sum(e.draft_n), 0) draft_n,
  coalesce(sum(e.posted_at_null_n), 0) posted_at_null_n,
  bool_and(e.n = s.expected_episodes and e.mn = 1 and e.mx = s.expected_episodes) ep_count_ok,
  bool_and(s.content_warnings @> s.expected_warnings and s.content_warnings <@ s.expected_warnings) warnings_ok,
  count(distinct s.author_id) = 1 one_author
from s left join e on e.series_id = s.series_id;
rollback;
