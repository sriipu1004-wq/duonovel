-- Issue #139 (rights) CI: every recordings row equals the fixture again and
-- the snapshot table is gone.
do $$ begin
  if exists ((select * from public.recordings except select * from ci.recordings_before)
             union all (select * from ci.recordings_before except select * from public.recordings))
  then raise exception 'CI_AUDIO_NOT_RESTORED'; end if;
  if to_regclass('libread_internal.issue139_audio_private_20261115') is not null
  then raise exception 'CI_AUDIO_SNAPSHOT_LEFT_BEHIND'; end if;
end $$;
select 'audio restored state OK' as result;
