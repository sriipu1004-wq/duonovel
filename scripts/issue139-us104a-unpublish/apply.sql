-- Issue #139 (rights): make 8 public official works private because their
-- copyright was restored in the United States by 17 U.S.C. §104A (URAA) and
-- is expected to still run there. Rights finding 2026-11-15.
-- Owner approval: button answer 2026-11-15「非公開にする (推奨)」
-- (private, keep bodies / narration / translations, reversible).
--
-- Changes exactly what the author's "make private" flow changes
-- (saveOwnedSeriesWorkspace: series.publication_status 'public' -> 'private'),
-- plus the legacy series.is_public true -> false as instructed:
--   series   : publication_status 'public' -> 'private', is_public true -> false
--   episodes : NOT written. The app's private flow leaves chapters 'posted';
--              every public read path (RLS on episodes, recordings, comments,
--              human translations, the public_episode_work_summaries view and
--              the Work / Reader / media server checks) requires
--              series.publication_status = 'public', so the chapters leave
--              the public boundary with the series.
-- Bodies, recordings, translations, bookmarks, reviews, rights metadata,
-- content rating, tags and every other column are untouched.
--
-- Every previous value is stored first in libread_internal so rollback.sql
-- can restore it exactly. Run once, in one transaction. Run dryrun.sql first.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $$ begin
  if to_regclass('libread_internal.issue139_unpublish_series_20261115') is not null
     or to_regclass('libread_internal.issue139_unpublish_episodes_20261115') is not null then
    raise exception 'ISSUE139_UNPUBLISH_ALREADY_APPLIED';
  end if;
end $$;

-- Serialize against concurrent edits of these 8 series and their chapters.
select id from public.series
where id in ('8514e9da-7864-4dad-a397-de06abee8fdc',
             'd5cc7bf2-c76e-49e8-a078-150636fc0344',
             '4d328931-ca04-4843-bcb5-9ac080cfbbf1',
             'ac25272b-fc09-4f20-a94a-816791e750d0',
             '82309887-add7-4406-aa18-d8a435c3b967',
             'f7ba9cd3-0ede-48df-92d7-2ea297f33475',
             '833b0303-d034-4ebb-ae6f-e023dd765a64',
             '4f48c202-3ba1-47cb-b887-90880534c96e')
for update;
select id from public.episodes
where series_id in ('8514e9da-7864-4dad-a397-de06abee8fdc',
                    'd5cc7bf2-c76e-49e8-a078-150636fc0344',
                    '4d328931-ca04-4843-bcb5-9ac080cfbbf1',
                    'ac25272b-fc09-4f20-a94a-816791e750d0',
                    '82309887-add7-4406-aa18-d8a435c3b967',
                    'f7ba9cd3-0ede-48df-92d7-2ea297f33475',
                    '833b0303-d034-4ebb-ae6f-e023dd765a64',
                    '4f48c202-3ba1-47cb-b887-90880534c96e')
for update;

create schema if not exists libread_internal;
create table libread_internal.issue139_unpublish_series_20261115 (
  series_id uuid primary key,
  expected_episodes integer not null,
  author_id_before uuid not null,
  is_public_before boolean,
  publication_status_before text not null
);
-- Chapter state is recorded (not changed) so rollback can prove the
-- chapters are still exactly as they were when the works went private.
create table libread_internal.issue139_unpublish_episodes_20261115 (
  episode_id uuid primary key,
  series_id uuid not null,
  episode_number integer not null,
  is_published_before boolean not null,
  posting_status_before text not null,
  scheduled_for_before timestamptz,
  posted_at_before timestamptz,
  last_edited_at_before timestamptz
);
alter table libread_internal.issue139_unpublish_series_20261115 enable row level security;
alter table libread_internal.issue139_unpublish_episodes_20261115 enable row level security;
revoke all on libread_internal.issue139_unpublish_series_20261115 from public, anon, authenticated;
revoke all on libread_internal.issue139_unpublish_episodes_20261115 from public, anon, authenticated;

insert into libread_internal.issue139_unpublish_series_20261115
  (series_id, expected_episodes, author_id_before, is_public_before, publication_status_before)
select t.series_id, t.expected_episodes, s.author_id, s.is_public, s.publication_status
from (values
  ('8514e9da-7864-4dad-a397-de06abee8fdc'::uuid, 6),
  ('d5cc7bf2-c76e-49e8-a078-150636fc0344'::uuid, 4),
  ('4d328931-ca04-4843-bcb5-9ac080cfbbf1'::uuid, 5),
  ('ac25272b-fc09-4f20-a94a-816791e750d0'::uuid, 8),
  ('82309887-add7-4406-aa18-d8a435c3b967'::uuid, 6),
  ('f7ba9cd3-0ede-48df-92d7-2ea297f33475'::uuid, 13),
  ('833b0303-d034-4ebb-ae6f-e023dd765a64'::uuid, 15),
  ('4f48c202-3ba1-47cb-b887-90880534c96e'::uuid, 6)
) t(series_id, expected_episodes)
join public.series s on s.id = t.series_id;

insert into libread_internal.issue139_unpublish_episodes_20261115
  (episode_id, series_id, episode_number, is_published_before, posting_status_before,
   scheduled_for_before, posted_at_before, last_edited_at_before)
select e.id, e.series_id, e.episode_number, e.is_published, e.posting_status,
       e.scheduled_for, e.posted_at, e.last_edited_at
from public.episodes e
join libread_internal.issue139_unpublish_series_20261115 t on t.series_id = e.series_id;

-- Guards: exact scope, currently public, one official author; abort on drift.
do $$ begin
  if (select count(*) from libread_internal.issue139_unpublish_series_20261115) <> 8 then
    raise exception 'ISSUE139_UNPUBLISH_SERIES_COUNT_MISMATCH';
  end if;
  if (select count(*) from libread_internal.issue139_unpublish_episodes_20261115) <> 63 then
    raise exception 'ISSUE139_UNPUBLISH_EPISODE_COUNT_MISMATCH';
  end if;
  if exists (
    select 1 from libread_internal.issue139_unpublish_series_20261115
    where publication_status_before <> 'public' or is_public_before is distinct from true
  ) then raise exception 'ISSUE139_UNPUBLISH_SERIES_STATE_DRIFT'; end if;
  if exists (
    select 1 from libread_internal.issue139_unpublish_episodes_20261115
    where posting_status_before <> 'posted' or is_published_before is distinct from true
       or scheduled_for_before is not null or posted_at_before is null
  ) then raise exception 'ISSUE139_UNPUBLISH_EPISODE_STATE_DRIFT'; end if;
  if exists (
    select 1
    from libread_internal.issue139_unpublish_series_20261115 t
    left join libread_internal.issue139_unpublish_episodes_20261115 e on e.series_id = t.series_id
    group by t.series_id, t.expected_episodes
    having count(e.episode_id) <> t.expected_episodes
        or min(e.episode_number) <> 1
        or max(e.episode_number) <> t.expected_episodes
  ) then raise exception 'ISSUE139_UNPUBLISH_EPISODE_NUMBERING_DRIFT'; end if;
  -- One author for all 8, and it is the single official account
  -- (OFFICIAL_ACCOUNT_EMAIL in src/lib/auth/officialAccount.ts).
  if (select count(distinct author_id_before)
      from libread_internal.issue139_unpublish_series_20261115) <> 1
     or (select count(*) from auth.users where email = 'libread08@gmail.com') <> 1
     or exists (
       select 1 from libread_internal.issue139_unpublish_series_20261115 t
       where t.author_id_before is distinct from
             (select u.id from auth.users u where u.email = 'libread08@gmail.com'))
  then raise exception 'ISSUE139_UNPUBLISH_AUTHOR_DRIFT'; end if;
end $$;

do $$
declare
  v_series integer;
begin
  update public.series s
    set publication_status = 'private', is_public = false
  from libread_internal.issue139_unpublish_series_20261115 t
  where s.id = t.series_id
    and s.publication_status = 'public' and s.is_public = true;
  get diagnostics v_series = row_count;
  if v_series <> 8 then
    raise exception 'ISSUE139_UNPUBLISH_SERIES_ROWCOUNT_MISMATCH %', v_series;
  end if;

  -- Chapters are unchanged (no write above touched them).
  if (select count(*)
      from libread_internal.issue139_unpublish_episodes_20261115 t
      join public.episodes e on e.id = t.episode_id
      where e.series_id = t.series_id
        and e.posting_status = t.posting_status_before
        and e.is_published = t.is_published_before
        and e.scheduled_for is not distinct from t.scheduled_for_before
        and e.posted_at is not distinct from t.posted_at_before
        and e.last_edited_at is not distinct from t.last_edited_at_before) <> 63 then
    raise exception 'ISSUE139_UNPUBLISH_EPISODES_CHANGED';
  end if;

  -- The public read boundary must no longer expose any of the 8 works.
  if exists (select 1 from public.public_episode_work_summaries v
             join libread_internal.issue139_unpublish_series_20261115 t on t.series_id = v.series_id) then
    raise exception 'ISSUE139_UNPUBLISH_STILL_PUBLIC';
  end if;
end $$;
commit;

-- After commit (no SQL needed): the Work page, Reader, media routes and RLS
-- read the DB per request, so they stop serving the 8 works at once
-- (anonymous Work / Reader URLs return 404). The cached catalog / search
-- cards (unstable_cache tag public-base-work-cards, revalidate 60) and the
-- sitemap (revalidate 60) drop them within about 60 s plus one request.
