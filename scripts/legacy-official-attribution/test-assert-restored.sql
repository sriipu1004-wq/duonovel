-- Legacy official attribution CI: every series row equals the pre-apply
-- fixture (all columns) and the snapshot table is gone.
do $$ begin
  if exists ((select * from public.series except select * from ci.series_before)
             union all (select * from ci.series_before except select * from public.series))
  then raise exception 'CI_SERIES_NOT_RESTORED'; end if;
  if to_regclass('libread_internal.legacy_attribution_series_20261115') is not null
  then raise exception 'CI_SNAPSHOT_LEFT_BEHIND'; end if;
end $$;
select 'restored state OK' as result;
