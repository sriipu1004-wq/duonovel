-- Issue #139 (rights) CI: state after db-apply.sql on the disposable fixture.
do $$ begin
  -- The 330 target rows now hold ai-narration-private:<the same object path>.
  if (select count(*) from public.recordings r join ci.recordings_before b using (id)
      where b.audio_storage_path like 'https://nyxbnccuvmlzffgtdadi.supabase.co/storage/v1/object/public/recording-audio/%'
        and r.series_id in (select series_id from libread_internal.issue139_unpublish_series_20261115)
        and r.audio_storage_path = 'ai-narration-private:' ||
            substr(b.audio_storage_path, length('https://nyxbnccuvmlzffgtdadi.supabase.co/storage/v1/object/public/recording-audio/') + 1)
     ) <> 330
  then raise exception 'CI_AUDIO_TARGETS_NOT_SWITCHED'; end if;
  -- Nothing else changed: every other column of every row, and every
  -- non-target row in full.
  if exists (
    (select id, series_id, episode_id, is_public, voice_model_id, reader_id, reader_user_id, reader_name from public.recordings
     except select id, series_id, episode_id, is_public, voice_model_id, reader_id, reader_user_id, reader_name from ci.recordings_before)
    union all
    (select id, series_id, episode_id, is_public, voice_model_id, reader_id, reader_user_id, reader_name from ci.recordings_before
     except select id, series_id, episode_id, is_public, voice_model_id, reader_id, reader_user_id, reader_name from public.recordings)
  ) then raise exception 'CI_AUDIO_OTHER_COLUMN_CHANGED'; end if;
  if exists (
    select 1 from public.recordings r join ci.recordings_before b using (id)
    where r.series_id not in (select series_id from libread_internal.issue139_unpublish_series_20261115)
      and r.audio_storage_path is distinct from b.audio_storage_path
  ) then raise exception 'CI_AUDIO_NON_TARGET_CHANGED'; end if;
  if (select count(*) from public.recordings) <> (select count(*) from ci.recordings_before)
  then raise exception 'CI_AUDIO_ROW_SET_CHANGED'; end if;
  -- Snapshot kept for rollback, closed to API roles.
  if (select count(*) from libread_internal.issue139_audio_private_20261115) <> 330
  then raise exception 'CI_AUDIO_SNAPSHOT_INCOMPLETE'; end if;
  if has_table_privilege('anon', 'libread_internal.issue139_audio_private_20261115', 'select')
     or has_table_privilege('authenticated', 'libread_internal.issue139_audio_private_20261115', 'select')
  then raise exception 'CI_AUDIO_SNAPSHOT_EXPOSED'; end if;
end $$;
select 'audio applied state OK' as result;
