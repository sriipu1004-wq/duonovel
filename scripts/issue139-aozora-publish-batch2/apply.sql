-- Issue #139 (batch 2): publish the 44 Aozora works (410 chapters) imported to
-- Production as private Drafts on 2026-11-15 (PR #217, docs/rights/pd-batch-2026-11-aozora.md).
-- Owner approval: button answer 2026-11-15「公開まで進める (推奨)」.
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
where id in ('7018b00b-d3ba-49a3-8334-cdada3d87be1',
             '34655f6b-5d9c-4b49-a8bc-99da6a78e0f3',
             '317e36bb-ac99-40ee-9a31-4b210a2be9a9',
             '65eb09bf-4c48-4e5e-abbb-544e7e5ab0d8',
             '33fab088-be3a-4989-bb52-ecd9e8d2ece1',
             'b5383047-0a36-44e0-905a-dd6917b6cda1',
             '9f98bb4c-a9e9-4997-a00f-00cd731a952c',
             '3f7f2ed0-f7a7-4ee3-8b8a-1180d087186e',
             '588efa06-1896-4355-9355-2aa21397c584',
             '84bad29b-ce4e-4df7-88c5-518ec60ad091',
             '23ba76aa-b738-49e4-97e7-5e43de8f7d89',
             '0295b2d1-7706-40bd-bc05-a10c29623ce4',
             'cb7de5cb-0004-4121-8428-c5e6093fa51a',
             '4f90058e-4452-4a2e-863b-2bed947118ab',
             '35d9ba1c-17e7-4699-b31f-a8c7592743cd',
             'b8dc641d-9131-47dd-83e6-44b04c24de67',
             '51c61aee-90ef-436c-a769-7b42d6be6e6a',
             '915574ba-b5b2-4cfa-be6a-a8718ed2e97d',
             '5fab91c0-d438-4566-8e21-b1fabda3654a',
             '774f711d-ca09-47c2-b353-26664449e429',
             'fefa4494-a622-42e2-992f-0d28a63ea1bf',
             '68628621-6afb-4cfd-866b-9dc4944ea200',
             'af0cd5ee-a75c-4861-ae24-22dd841ea964',
             '96160646-5a2f-47fc-a1dd-39fc46e6f63a',
             'ff7799a0-ceb1-42fc-bc69-39b682cd9c4e',
             'd7fb43fd-8089-440d-971e-2ad9e8c78019',
             '3f6018e3-14c5-4f11-ba82-7e0a7e9b3311',
             '40e47f40-794b-4273-b692-c2bf1dc2ef1e',
             '5b6485c1-8807-4ef3-b53d-c759f5abf976',
             'cea05ddd-1ce5-4944-ba93-036b4e4686ac',
             '91d7f11b-da31-4595-b1e9-5b1c31f3e47c',
             'dd2e4b7d-0c0e-4502-8456-7c7ac02c21da',
             '19d0b40a-204f-4187-8364-ce02bbbbd629',
             '682af3f1-326b-4b7a-a3e1-c84c2598ce87',
             '1bc2e472-f631-4475-81f5-ade481759bfc',
             'b1a79cde-0af9-40fc-8330-c04f31a9be68',
             '95f5601c-dc41-4ba2-b86e-9192ef99f2ea',
             '7e12cac1-bf9e-4303-b240-642a24077ed4',
             '3b1f4c20-707f-4357-86dd-f8e65940c13f',
             '3d7bfa51-66f7-4d43-9687-3c255c33fe0b',
             'd455ecc5-5888-41f5-9a5a-ee315afcbd02',
             '648bb37f-0eff-4a19-84ad-2668381d87dd',
             '36cba5cb-5e8d-4482-bcae-87f246c53688',
             '9c0cba87-ca51-4138-935b-8240d9275ad2')
for update;

create schema if not exists libread_internal;
create table libread_internal.issue139_publish2_series_20261115 (
  series_id uuid primary key,
  manifest_id text not null,
  expected_episodes integer not null,
  expected_warnings text[] not null,
  is_public_before boolean,
  publication_status_before text not null
);
create table libread_internal.issue139_publish2_episodes_20261115 (
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
alter table libread_internal.issue139_publish2_series_20261115 enable row level security;
alter table libread_internal.issue139_publish2_episodes_20261115 enable row level security;
revoke all on libread_internal.issue139_publish2_series_20261115 from public, anon, authenticated;
revoke all on libread_internal.issue139_publish2_episodes_20261115 from public, anon, authenticated;

insert into libread_internal.issue139_publish2_series_20261115
  (series_id, manifest_id, expected_episodes, expected_warnings,
   is_public_before, publication_status_before)
select t.series_id, t.manifest_id, t.expected_episodes, t.expected_warnings,
       s.is_public, s.publication_status
from (values
('7018b00b-d3ba-49a3-8334-cdada3d87be1'::uuid, 'aozora-000024', 1, array[]::text[]),
  ('34655f6b-5d9c-4b49-a8bc-99da6a78e0f3'::uuid, 'aozora-000201', 39, array[]::text[]),
  ('317e36bb-ac99-40ee-9a31-4b210a2be9a9'::uuid, 'aozora-000206', 3, array[]::text[]),
  ('65eb09bf-4c48-4e5e-abbb-544e7e5ab0d8'::uuid, 'aozora-000322', 3, array['violence']::text[]),
  ('33fab088-be3a-4989-bb52-ecd9e8d2ece1'::uuid, 'aozora-000360', 1, array['violence']::text[]),
  ('b5383047-0a36-44e0-905a-dd6917b6cda1'::uuid, 'aozora-000363', 9, array['violence']::text[]),
  ('9f98bb4c-a9e9-4997-a00f-00cd731a952c'::uuid, 'aozora-000371', 3, array[]::text[]),
  ('3f7f2ed0-f7a7-4ee3-8b8a-1180d087186e'::uuid, 'aozora-000373', 1, array[]::text[]),
  ('588efa06-1896-4355-9355-2aa21397c584'::uuid, 'aozora-000411', 1, array[]::text[]),
  ('84bad29b-ce4e-4df7-88c5-518ec60ad091'::uuid, 'aozora-000412', 2, array[]::text[]),
  ('23ba76aa-b738-49e4-97e7-5e43de8f7d89'::uuid, 'aozora-000413', 1, array[]::text[]),
  ('0295b2d1-7706-40bd-bc05-a10c29623ce4'::uuid, 'aozora-000521', 8, array['violence']::text[]),
  ('cb7de5cb-0004-4121-8428-c5e6093fa51a'::uuid, 'aozora-000522', 71, array['violence']::text[]),
  ('4f90058e-4452-4a2e-863b-2bed947118ab'::uuid, 'aozora-000531', 7, array['violence']::text[]),
  ('35d9ba1c-17e7-4699-b31f-a8c7592743cd'::uuid, 'aozora-000544', 1, array[]::text[]),
  ('b8dc641d-9131-47dd-83e6-44b04c24de67'::uuid, 'aozora-000600', 1, array[]::text[]),
  ('51c61aee-90ef-436c-a769-7b42d6be6e6a'::uuid, 'aozora-000673', 5, array['violence']::text[]),
  ('915574ba-b5b2-4cfa-be6a-a8718ed2e97d'::uuid, 'aozora-000674', 1, array[]::text[]),
  ('5fab91c0-d438-4566-8e21-b1fabda3654a'::uuid, 'aozora-000751', 6, array[]::text[]),
  ('774f711d-ca09-47c2-b353-26664449e429'::uuid, 'aozora-000815', 1, array[]::text[]),
  ('fefa4494-a622-42e2-992f-0d28a63ea1bf'::uuid, 'aozora-000816', 3, array[]::text[]),
  ('68628621-6afb-4cfd-866b-9dc4944ea200'::uuid, 'aozora-000838', 9, array[]::text[]),
  ('af0cd5ee-a75c-4861-ae24-22dd841ea964'::uuid, 'aozora-000843', 53, array[]::text[]),
  ('96160646-5a2f-47fc-a1dd-39fc46e6f63a'::uuid, 'aozora-000883', 4, array[]::text[]),
  ('ff7799a0-ceb1-42fc-bc69-39b682cd9c4e'::uuid, 'aozora-000913', 1, array[]::text[]),
  ('d7fb43fd-8089-440d-971e-2ad9e8c78019'::uuid, 'aozora-000917', 1, array[]::text[]),
  ('3f6018e3-14c5-4f11-ba82-7e0a7e9b3311'::uuid, 'aozora-001097', 1, array[]::text[]),
  ('40e47f40-794b-4273-b692-c2bf1dc2ef1e'::uuid, 'aozora-001312', 4, array['violence']::text[]),
  ('5b6485c1-8807-4ef3-b53d-c759f5abf976'::uuid, 'aozora-001404', 2, array[]::text[]),
  ('cea05ddd-1ce5-4944-ba93-036b4e4686ac'::uuid, 'aozora-001412', 31, array[]::text[]),
  ('91d7f11b-da31-4595-b1e9-5b1c31f3e47c'::uuid, 'aozora-001415', 7, array['violence']::text[]),
  ('dd2e4b7d-0c0e-4502-8456-7c7ac02c21da'::uuid, 'aozora-001429', 4, array['violence']::text[]),
  ('19d0b40a-204f-4187-8364-ce02bbbbd629'::uuid, 'aozora-001430', 29, array['violence']::text[]),
  ('682af3f1-326b-4b7a-a3e1-c84c2598ce87'::uuid, 'aozora-001454', 3, array['violence']::text[]),
  ('1bc2e472-f631-4475-81f5-ade481759bfc'::uuid, 'aozora-001465', 11, array['violence']::text[]),
  ('b1a79cde-0af9-40fc-8330-c04f31a9be68'::uuid, 'aozora-001483', 3, array[]::text[]),
  ('95f5601c-dc41-4ba2-b86e-9192ef99f2ea'::uuid, 'aozora-001528', 1, array[]::text[]),
  ('7e12cac1-bf9e-4303-b240-642a24077ed4'::uuid, 'aozora-001529', 2, array[]::text[]),
  ('3b1f4c20-707f-4357-86dd-f8e65940c13f'::uuid, 'aozora-001556', 10, array['violence']::text[]),
  ('3d7bfa51-66f7-4d43-9687-3c255c33fe0b'::uuid, 'aozora-001668', 29, array[]::text[]),
  ('d455ecc5-5888-41f5-9a5a-ee315afcbd02'::uuid, 'aozora-001669', 9, array[]::text[]),
  ('648bb37f-0eff-4a19-84ad-2668381d87dd'::uuid, 'aozora-001702', 17, array[]::text[]),
  ('36cba5cb-5e8d-4482-bcae-87f246c53688'::uuid, 'aozora-001768', 8, array[]::text[]),
  ('9c0cba87-ca51-4138-935b-8240d9275ad2'::uuid, 'aozora-001795', 3, array['violence']::text[])
) t(series_id, manifest_id, expected_episodes, expected_warnings)
join public.series s on s.id = t.series_id;

insert into libread_internal.issue139_publish2_episodes_20261115
  (episode_id, series_id, episode_number, is_published_before, posting_status_before,
   scheduled_for_before, posted_at_before, last_edited_at_before)
select e.id, e.series_id, e.episode_number, e.is_published, e.posting_status,
       e.scheduled_for, e.posted_at, e.last_edited_at
from public.episodes e
join libread_internal.issue139_publish2_series_20261115 t on t.series_id = e.series_id;

-- Guards: exact scope and the current private Draft state; abort on drift.
do $$ begin
  if (select count(*) from libread_internal.issue139_publish2_series_20261115) <> 44 then
    raise exception 'ISSUE139_BATCH2_PUBLISH_SERIES_COUNT_MISMATCH';
  end if;
  if (select count(*) from libread_internal.issue139_publish2_episodes_20261115) <> 410 then
    raise exception 'ISSUE139_BATCH2_PUBLISH_EPISODE_COUNT_MISMATCH';
  end if;
  -- Series: private, general rating, reviewed Aozora rights metadata for the
  -- expected manifest, the owner-approved content warnings, one account.
  if exists (
    select 1
    from libread_internal.issue139_publish2_series_20261115 t
    join public.series s on s.id = t.series_id
    where s.publication_status <> 'private'
       or s.is_public is distinct from false
       or s.content_rating <> 'general'
       or not (s.content_warnings @> t.expected_warnings and s.content_warnings <@ t.expected_warnings)
       or s.effect_settings->'publicDomain'->>'rightsChecked' is distinct from 'true'
       or s.effect_settings->'publicDomain'->>'manifestId' is distinct from t.manifest_id
       or s.effect_settings->'publicDomain'->>'sourceProvider' is distinct from 'Aozora Bunko'
  ) then raise exception 'ISSUE139_BATCH2_PUBLISH_SERIES_STATE_DRIFT'; end if;
  if (select count(distinct s.author_id)
      from libread_internal.issue139_publish2_series_20261115 t
      join public.series s on s.id = t.series_id) <> 1 then
    raise exception 'ISSUE139_BATCH2_PUBLISH_AUTHOR_DRIFT';
  end if;
  -- Episodes: all Draft, never posted, numbered 1..n with the expected n.
  if exists (
    select 1 from libread_internal.issue139_publish2_episodes_20261115
    where posting_status_before <> 'draft' or is_published_before
       or scheduled_for_before is not null or posted_at_before is not null
  ) then raise exception 'ISSUE139_BATCH2_PUBLISH_EPISODE_STATE_DRIFT'; end if;
  if exists (
    select 1
    from libread_internal.issue139_publish2_series_20261115 t
    left join libread_internal.issue139_publish2_episodes_20261115 e on e.series_id = t.series_id
    group by t.series_id, t.expected_episodes
    having count(e.episode_id) <> t.expected_episodes
        or min(e.episode_number) <> 1
        or max(e.episode_number) <> t.expected_episodes
  ) then raise exception 'ISSUE139_BATCH2_PUBLISH_EPISODE_NUMBERING_DRIFT'; end if;
end $$;

do $$
declare
  v_series integer;
  v_episodes integer;
begin
  update public.series s
    set publication_status = 'public', is_public = true
  from libread_internal.issue139_publish2_series_20261115 t
  where s.id = t.series_id
    and s.publication_status = 'private' and s.is_public = false;
  get diagnostics v_series = row_count;
  if v_series <> 44 then
    raise exception 'ISSUE139_BATCH2_PUBLISH_SERIES_ROWCOUNT_MISMATCH %', v_series;
  end if;

  update public.episodes e
    set posting_status = 'posted', is_published = true, posted_at = now()
  from libread_internal.issue139_publish2_episodes_20261115 t
  where e.id = t.episode_id
    and e.posting_status = 'draft' and e.is_published = false and e.posted_at is null;
  get diagnostics v_episodes = row_count;
  if v_episodes <> 410 then
    raise exception 'ISSUE139_BATCH2_PUBLISH_EPISODE_ROWCOUNT_MISMATCH %', v_episodes;
  end if;

  update libread_internal.issue139_publish2_episodes_20261115 t
    set posted_at_after = e.posted_at
  from public.episodes e
  where e.id = t.episode_id;

  -- The public read boundary (RLS policy + public_episode_work_summaries)
  -- must now expose exactly these 44 works with 410 chapters.
  if (select count(*) from public.public_episode_work_summaries v
      join libread_internal.issue139_publish2_series_20261115 t on t.series_id = v.series_id
      where v.episode_count = t.expected_episodes) <> 44 then
    raise exception 'ISSUE139_BATCH2_PUBLISH_PUBLIC_VIEW_MISMATCH';
  end if;
end $$;
commit;

-- After commit (no SQL needed): the public catalog cache
-- (unstable_cache tag public-base-work-cards) and sitemap revalidate every
-- 60 s; the Work page, Reader and RLS read the DB directly. Wait at least
-- 60 s, then check /search, the 44 /works/<id> pages, one Reader page per
-- work and /sitemap.xml on Production.
