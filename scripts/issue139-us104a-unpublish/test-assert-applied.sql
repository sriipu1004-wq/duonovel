-- Issue #139 (rights) CI: state after apply.sql on the disposable fixture.
do $$ begin
  -- Exactly the 8 targets are private with is_public false.
  if (select count(*) from public.series where publication_status = 'private' and is_public = false
      and id in ('8514e9da-7864-4dad-a397-de06abee8fdc','d5cc7bf2-c76e-49e8-a078-150636fc0344',
                 '4d328931-ca04-4843-bcb5-9ac080cfbbf1','ac25272b-fc09-4f20-a94a-816791e750d0',
                 '82309887-add7-4406-aa18-d8a435c3b967','f7ba9cd3-0ede-48df-92d7-2ea297f33475',
                 '833b0303-d034-4ebb-ae6f-e023dd765a64','4f48c202-3ba1-47cb-b887-90880534c96e')) <> 8
  then raise exception 'CI_TARGET_SERIES_NOT_PRIVATE'; end if;
  -- Only the two publication columns of the 8 targets changed.
  if (select count(*) from public.series s join ci.series_before b using (id)
      where (s.publication_status, s.is_public) is distinct from (b.publication_status, b.is_public)) <> 8
  then raise exception 'CI_SERIES_CHANGE_COUNT'; end if;
  if exists (
    select 1 from public.series s join ci.series_before b using (id)
    where (s.publication_status, s.is_public) is distinct from (b.publication_status, b.is_public)
      and s.id not in ('8514e9da-7864-4dad-a397-de06abee8fdc','d5cc7bf2-c76e-49e8-a078-150636fc0344',
                       '4d328931-ca04-4843-bcb5-9ac080cfbbf1','ac25272b-fc09-4f20-a94a-816791e750d0',
                       '82309887-add7-4406-aa18-d8a435c3b967','f7ba9cd3-0ede-48df-92d7-2ea297f33475',
                       '833b0303-d034-4ebb-ae6f-e023dd765a64','4f48c202-3ba1-47cb-b887-90880534c96e')
  ) then raise exception 'CI_NON_TARGET_SERIES_CHANGED'; end if;
  if exists (
    (select id, author_id, title, created_at, tags, genres, effect_settings, content_rating,
            content_warnings, source_language, translation_permission_mode from public.series
     except
     select id, author_id, title, created_at, tags, genres, effect_settings, content_rating,
            content_warnings, source_language, translation_permission_mode from ci.series_before)
    union all
    (select id, author_id, title, created_at, tags, genres, effect_settings, content_rating,
            content_warnings, source_language, translation_permission_mode from ci.series_before
     except
     select id, author_id, title, created_at, tags, genres, effect_settings, content_rating,
            content_warnings, source_language, translation_permission_mode from public.series)
  ) then raise exception 'CI_SERIES_OTHER_COLUMN_CHANGED'; end if;

  -- Chapters: no row changed at all (every column, every series).
  if exists ((select * from public.episodes except select * from ci.episodes_before)
             union all (select * from ci.episodes_before except select * from public.episodes))
  then raise exception 'CI_EPISODES_CHANGED'; end if;

  -- Snapshot kept for rollback, closed to API roles.
  if (select count(*) from libread_internal.issue139_unpublish_series_20261115) <> 8
     or (select count(*) from libread_internal.issue139_unpublish_episodes_20261115) <> 63
     or exists (select 1 from libread_internal.issue139_unpublish_series_20261115
                where publication_status_before <> 'public' or is_public_before is distinct from true)
  then raise exception 'CI_SNAPSHOT_INCOMPLETE'; end if;
  if has_table_privilege('anon', 'libread_internal.issue139_unpublish_series_20261115', 'select')
     or has_table_privilege('authenticated', 'libread_internal.issue139_unpublish_episodes_20261115', 'select')
  then raise exception 'CI_SNAPSHOT_EXPOSED'; end if;

  -- Public boundary: only the 2 non-target public works remain.
  if (select count(*) from public.public_episode_work_summaries) <> 2
     or exists (select 1 from public.public_episode_work_summaries
                where series_id not in ('00000000-0000-4000-8000-0000000000a1',
                                        '00000000-0000-4000-8000-0000000000a3'))
  then raise exception 'CI_PUBLIC_VIEW_MISMATCH'; end if;

  -- Kept data (recordings / translations) untouched.
  if (select count(*) from public.recordings) <> 63 or (select count(*) from public.episode_translations) <> 1
  then raise exception 'CI_KEPT_DATA_CHANGED'; end if;
end $$;
select 'applied state OK' as result;
