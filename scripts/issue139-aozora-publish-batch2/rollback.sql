-- Issue #139 (batch 2): exact revert of apply.sql (back to private Drafts).
-- Restores every stored previous value (publication_status, is_public,
-- posting_status, is_published, scheduled_for, posted_at, last_edited_at)
-- for the 44 series / 410 episodes recorded by apply.sql, then drops the
-- snapshot tables. Nothing is deleted from public tables: bookmarks, views,
-- reviews, translations or recordings created while public stay in place and
-- become non-public through the existing private/draft read boundary.
--
-- Aborts (no change) if any row was edited after apply.sql: a different
-- posted_at, a set last_edited_at, a scheduled episode or another
-- publication state. Resolve that case by hand; do not force it.
begin;

select s.id from public.series s
join libread_internal.issue139_publish2_series_20261115 t on t.series_id = s.id
for update of s;

do $$ begin
  if (select count(*) from libread_internal.issue139_publish2_series_20261115) <> 44
     or (select count(*) from libread_internal.issue139_publish2_episodes_20261115) <> 410
     or exists (
       select 1 from libread_internal.issue139_publish2_series_20261115
       where series_id not in ('7018b00b-d3ba-49a3-8334-cdada3d87be1',
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
                               '9c0cba87-ca51-4138-935b-8240d9275ad2'))
     or exists (
       select 1 from libread_internal.issue139_publish2_episodes_20261115 e
       where e.series_id not in (select series_id from libread_internal.issue139_publish2_series_20261115))
  then raise exception 'ISSUE139_BATCH2_ROLLBACK_SNAPSHOT_SCOPE_MISMATCH'; end if;

  -- Current state must still be exactly what apply.sql left.
  if exists (
    select 1
    from libread_internal.issue139_publish2_series_20261115 t
    left join public.series s on s.id = t.series_id
    where s.id is null or s.publication_status <> 'public' or s.is_public is distinct from true
  ) then raise exception 'ISSUE139_BATCH2_ROLLBACK_SERIES_STATE_DRIFT'; end if;
  if exists (
    select 1
    from libread_internal.issue139_publish2_episodes_20261115 t
    left join public.episodes e on e.id = t.episode_id
    where e.id is null
       or e.series_id <> t.series_id
       or e.posting_status <> 'posted' or e.is_published is distinct from true
       or e.scheduled_for is not null
       or t.posted_at_after is null or e.posted_at is distinct from t.posted_at_after
       or e.last_edited_at is distinct from t.last_edited_at_before
  ) then raise exception 'ISSUE139_BATCH2_ROLLBACK_EPISODE_STATE_DRIFT'; end if;
  if (select count(*) from public.episodes e
      join libread_internal.issue139_publish2_series_20261115 t on t.series_id = e.series_id) <> 410 then
    raise exception 'ISSUE139_BATCH2_ROLLBACK_EPISODE_SET_CHANGED';
  end if;
end $$;

do $$
declare
  v_series integer;
  v_episodes integer;
begin
  update public.episodes e
    set posting_status = t.posting_status_before,
        is_published = t.is_published_before,
        scheduled_for = t.scheduled_for_before,
        posted_at = t.posted_at_before,
        last_edited_at = t.last_edited_at_before
  from libread_internal.issue139_publish2_episodes_20261115 t
  where e.id = t.episode_id and e.posted_at = t.posted_at_after;
  get diagnostics v_episodes = row_count;
  if v_episodes <> 410 then
    raise exception 'ISSUE139_BATCH2_ROLLBACK_EPISODE_ROWCOUNT_MISMATCH %', v_episodes;
  end if;

  update public.series s
    set publication_status = t.publication_status_before,
        is_public = t.is_public_before
  from libread_internal.issue139_publish2_series_20261115 t
  where s.id = t.series_id and s.publication_status = 'public';
  get diagnostics v_series = row_count;
  if v_series <> 44 then
    raise exception 'ISSUE139_BATCH2_ROLLBACK_SERIES_ROWCOUNT_MISMATCH %', v_series;
  end if;

  if exists (select 1 from public.public_episode_work_summaries v
             join libread_internal.issue139_publish2_series_20261115 t on t.series_id = v.series_id) then
    raise exception 'ISSUE139_BATCH2_ROLLBACK_STILL_PUBLIC';
  end if;
end $$;

drop table libread_internal.issue139_publish2_episodes_20261115;
drop table libread_internal.issue139_publish2_series_20261115;
commit;

-- After commit: RLS hides the works and chapters immediately; the cached
-- catalog/search cards and sitemap drop them within 60 s (revalidate: 60).
