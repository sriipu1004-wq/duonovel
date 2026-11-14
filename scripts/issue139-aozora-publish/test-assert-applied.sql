-- Issue #139 CI: state after apply.sql on the disposable fixture.
do $$ begin
  -- Exactly the 4 targets changed, only in the two publication columns.
  if (select count(*) from public.series where publication_status = 'public' and is_public
      and id in ('e47476bc-07d3-4c65-86a1-78237e3c6948','6d832ac6-b457-43ff-97ef-50281b337ca3',
                 '7babc9f9-f015-4135-ba92-da0f54864158','a173c008-3e53-4126-927b-366e44a69b48')) <> 4
  then raise exception 'CI_TARGET_SERIES_NOT_PUBLIC'; end if;
  if exists (
    (select id, author_id, title, created_at, tags, genres, effect_settings, content_rating,
            content_warnings, source_language, translation_permission_mode from public.series
     except
     select id, author_id, title, created_at, tags, genres, effect_settings, content_rating,
            content_warnings, source_language, translation_permission_mode from ci.series_before)
  ) then raise exception 'CI_SERIES_OTHER_COLUMN_CHANGED'; end if;
  if exists (
    select 1 from public.series s join ci.series_before b using (id)
    where (s.publication_status, s.is_public) is distinct from (b.publication_status, b.is_public)
      and s.id not in ('e47476bc-07d3-4c65-86a1-78237e3c6948','6d832ac6-b457-43ff-97ef-50281b337ca3',
                       '7babc9f9-f015-4135-ba92-da0f54864158','a173c008-3e53-4126-927b-366e44a69b48')
  ) then raise exception 'CI_NON_TARGET_SERIES_CHANGED'; end if;

  -- Exactly the 12 target chapters posted, with one posted_at, nothing else.
  if (select count(*) from public.episodes e join ci.episodes_before b using (id)
      where (e.posting_status, e.is_published, e.posted_at)
            is distinct from (b.posting_status, b.is_published, b.posted_at)) <> 12
  then raise exception 'CI_EPISODE_CHANGE_COUNT'; end if;
  if exists (
    select 1 from public.episodes e join ci.episodes_before b using (id)
    where (e.posting_status, e.is_published, e.posted_at) is distinct from (b.posting_status, b.is_published, b.posted_at)
      and (e.series_id not in ('e47476bc-07d3-4c65-86a1-78237e3c6948','6d832ac6-b457-43ff-97ef-50281b337ca3',
                               '7babc9f9-f015-4135-ba92-da0f54864158','a173c008-3e53-4126-927b-366e44a69b48')
           or e.posting_status <> 'posted' or not e.is_published or e.posted_at is null)
  ) then raise exception 'CI_EPISODE_WRONG_CHANGE'; end if;
  if exists (
    (select id, series_id, episode_number, title, body, created_at, scheduled_for, last_edited_at from public.episodes
     except
     select id, series_id, episode_number, title, body, created_at, scheduled_for, last_edited_at from ci.episodes_before)
  ) then raise exception 'CI_EPISODE_OTHER_COLUMN_CHANGED'; end if;
  if (select count(distinct posted_at) from public.episodes e join ci.episodes_before b using (id)
      where b.posting_status = 'draft' and e.posting_status = 'posted') <> 1
  then raise exception 'CI_POSTED_AT_NOT_SINGLE'; end if;

  -- Snapshot kept for rollback, closed to API roles.
  if (select count(*) from libread_internal.issue139_publish_series_20261115) <> 4
     or (select count(*) from libread_internal.issue139_publish_episodes_20261115) <> 12
     or exists (select 1 from libread_internal.issue139_publish_episodes_20261115 where posted_at_after is null)
  then raise exception 'CI_SNAPSHOT_INCOMPLETE'; end if;
  if has_table_privilege('anon', 'libread_internal.issue139_publish_series_20261115', 'select')
     or has_table_privilege('authenticated', 'libread_internal.issue139_publish_episodes_20261115', 'select')
  then raise exception 'CI_SNAPSHOT_EXPOSED'; end if;
  if (select count(*) from public.public_episode_work_summaries) <> 5 then
    raise exception 'CI_PUBLIC_VIEW_COUNT';
  end if;
end $$;
select 'applied state OK' as result;
