-- Issue #139 (rights) CI: every series/episode row equals the pre-apply
-- fixture (all columns, including timestamps) and the snapshot tables are gone.
do $$ begin
  if exists ((select * from public.series except select * from ci.series_before)
             union all (select * from ci.series_before except select * from public.series))
  then raise exception 'CI_SERIES_NOT_RESTORED'; end if;
  if exists ((select * from public.episodes except select * from ci.episodes_before)
             union all (select * from ci.episodes_before except select * from public.episodes))
  then raise exception 'CI_EPISODES_NOT_RESTORED'; end if;
  if to_regclass('libread_internal.issue139_unpublish_series_20261115') is not null
     or to_regclass('libread_internal.issue139_unpublish_episodes_20261115') is not null
  then raise exception 'CI_SNAPSHOT_LEFT_BEHIND'; end if;
  if (select count(*) from public.public_episode_work_summaries) <> 10 then
    raise exception 'CI_PUBLIC_VIEW_NOT_RESTORED';
  end if;
end $$;
select 'restored state OK' as result;
