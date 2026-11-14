-- Issue #139: publish the 4 owner-approved Aozora works (12 chapters) that
-- were imported to Production as private Drafts on 2026-11-15.
-- Owner approval: button answer 2026-11-15「公開する (推奨)」.
--
-- Changes exactly what the author's publish flow changes, and nothing else:
--   series   : publication_status 'private' -> 'public', is_public false -> true
--   episodes : posting_status 'draft' -> 'posted', is_published false -> true,
--              posted_at null -> now() (saveOwnedEpisode sets posted_at on
--              first posting; last_edited_at stays null; scheduled_for stays null)
-- Rights metadata (effect_settings.publicDomain), content_rating,
-- content_warnings, permissions, tags, genres, titles and bodies are untouched.
--
-- Every previous value is stored first in libread_internal so rollback.sql
-- can restore it exactly. Run once, in one transaction. Run dryrun.sql first.
begin;

-- Serialize against concurrent edits of these 4 series for this transaction.
select id from public.series
where id in ('e47476bc-07d3-4c65-86a1-78237e3c6948',
             '6d832ac6-b457-43ff-97ef-50281b337ca3',
             '7babc9f9-f015-4135-ba92-da0f54864158',
             'a173c008-3e53-4126-927b-366e44a69b48')
for update;

create schema if not exists libread_internal;
create table libread_internal.issue139_publish_series_20261115 (
  series_id uuid primary key,
  manifest_id text not null,
  expected_episodes integer not null,
  expected_warnings text[] not null,
  is_public_before boolean,
  publication_status_before text not null
);
create table libread_internal.issue139_publish_episodes_20261115 (
  episode_id uuid primary key,
  series_id uuid not null,
  episode_number integer not null,
  is_published_before boolean not null,
  posting_status_before text not null,
  scheduled_for_before timestamptz,
  posted_at_before timestamptz,
  last_edited_at_before timestamptz,
  posted_at_after timestamptz
);
alter table libread_internal.issue139_publish_series_20261115 enable row level security;
alter table libread_internal.issue139_publish_episodes_20261115 enable row level security;
revoke all on libread_internal.issue139_publish_series_20261115 from public, anon, authenticated;
revoke all on libread_internal.issue139_publish_episodes_20261115 from public, anon, authenticated;

insert into libread_internal.issue139_publish_series_20261115
  (series_id, manifest_id, expected_episodes, expected_warnings,
   is_public_before, publication_status_before)
select t.series_id, t.manifest_id, t.expected_episodes, t.expected_warnings,
       s.is_public, s.publication_status
from (values
  ('e47476bc-07d3-4c65-86a1-78237e3c6948'::uuid, 'aozora-000692', 1, array['violence']::text[]),
  ('6d832ac6-b457-43ff-97ef-50281b337ca3'::uuid, 'aozora-033200', 1, array[]::text[]),
  ('7babc9f9-f015-4135-ba92-da0f54864158'::uuid, 'aozora-053520', 8, array['violence']::text[]),
  ('a173c008-3e53-4126-927b-366e44a69b48'::uuid, 'aozora-004386', 2, array[]::text[])
) t(series_id, manifest_id, expected_episodes, expected_warnings)
join public.series s on s.id = t.series_id;

insert into libread_internal.issue139_publish_episodes_20261115
  (episode_id, series_id, episode_number, is_published_before, posting_status_before,
   scheduled_for_before, posted_at_before, last_edited_at_before)
select e.id, e.series_id, e.episode_number, e.is_published, e.posting_status,
       e.scheduled_for, e.posted_at, e.last_edited_at
from public.episodes e
join libread_internal.issue139_publish_series_20261115 t on t.series_id = e.series_id;

-- Guards: exact scope and the current private Draft state; abort on drift.
do $$ begin
  if (select count(*) from libread_internal.issue139_publish_series_20261115) <> 4 then
    raise exception 'ISSUE139_PUBLISH_SERIES_COUNT_MISMATCH';
  end if;
  if (select count(*) from libread_internal.issue139_publish_episodes_20261115) <> 12 then
    raise exception 'ISSUE139_PUBLISH_EPISODE_COUNT_MISMATCH';
  end if;
  -- Series: private, general rating, reviewed Aozora rights metadata for the
  -- expected manifest, the owner-approved content warnings, one account.
  if exists (
    select 1
    from libread_internal.issue139_publish_series_20261115 t
    join public.series s on s.id = t.series_id
    where s.publication_status <> 'private'
       or s.is_public is distinct from false
       or s.content_rating <> 'general'
       or not (s.content_warnings @> t.expected_warnings and s.content_warnings <@ t.expected_warnings)
       or s.effect_settings->'publicDomain'->>'rightsChecked' is distinct from 'true'
       or s.effect_settings->'publicDomain'->>'manifestId' is distinct from t.manifest_id
       or s.effect_settings->'publicDomain'->>'sourceProvider' is distinct from 'Aozora Bunko'
  ) then raise exception 'ISSUE139_PUBLISH_SERIES_STATE_DRIFT'; end if;
  if (select count(distinct s.author_id)
      from libread_internal.issue139_publish_series_20261115 t
      join public.series s on s.id = t.series_id) <> 1 then
    raise exception 'ISSUE139_PUBLISH_AUTHOR_DRIFT';
  end if;
  -- Episodes: all Draft, never posted, numbered 1..n with the expected n.
  if exists (
    select 1 from libread_internal.issue139_publish_episodes_20261115
    where posting_status_before <> 'draft' or is_published_before
       or scheduled_for_before is not null or posted_at_before is not null
  ) then raise exception 'ISSUE139_PUBLISH_EPISODE_STATE_DRIFT'; end if;
  if exists (
    select 1
    from libread_internal.issue139_publish_series_20261115 t
    left join libread_internal.issue139_publish_episodes_20261115 e on e.series_id = t.series_id
    group by t.series_id, t.expected_episodes
    having count(e.episode_id) <> t.expected_episodes
        or min(e.episode_number) <> 1
        or max(e.episode_number) <> t.expected_episodes
  ) then raise exception 'ISSUE139_PUBLISH_EPISODE_NUMBERING_DRIFT'; end if;
end $$;

do $$
declare
  v_series integer;
  v_episodes integer;
begin
  update public.series s
    set publication_status = 'public', is_public = true
  from libread_internal.issue139_publish_series_20261115 t
  where s.id = t.series_id
    and s.publication_status = 'private' and s.is_public = false;
  get diagnostics v_series = row_count;
  if v_series <> 4 then
    raise exception 'ISSUE139_PUBLISH_SERIES_ROWCOUNT_MISMATCH %', v_series;
  end if;

  update public.episodes e
    set posting_status = 'posted', is_published = true, posted_at = now()
  from libread_internal.issue139_publish_episodes_20261115 t
  where e.id = t.episode_id
    and e.posting_status = 'draft' and e.is_published = false and e.posted_at is null;
  get diagnostics v_episodes = row_count;
  if v_episodes <> 12 then
    raise exception 'ISSUE139_PUBLISH_EPISODE_ROWCOUNT_MISMATCH %', v_episodes;
  end if;

  update libread_internal.issue139_publish_episodes_20261115 t
    set posted_at_after = e.posted_at
  from public.episodes e
  where e.id = t.episode_id;

  -- The public read boundary (RLS policy + public_episode_work_summaries)
  -- must now expose exactly these 4 works with 12 chapters.
  if (select count(*) from public.public_episode_work_summaries v
      join libread_internal.issue139_publish_series_20261115 t on t.series_id = v.series_id
      where v.episode_count = t.expected_episodes) <> 4 then
    raise exception 'ISSUE139_PUBLISH_PUBLIC_VIEW_MISMATCH';
  end if;
end $$;
commit;

-- After commit (no SQL needed): the public catalog cache
-- (unstable_cache tag public-base-work-cards) and sitemap revalidate every
-- 60 s; the Work page, Reader and RLS read the DB directly. Wait at least
-- 60 s, then check /search, the 4 /works/<id> pages, one Reader page per
-- work and /sitemap.xml on Production.
