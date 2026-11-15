-- 孤島の鬼 (set "kotou", ISSUE139_AUDIO_SET=kotou): same steps as ../db-rollback.sql for
-- 1 series, 120 recordings, 240 objects. Generated from ../db-rollback.sql; the counts
-- and series below replace the 8-series values. The text after this header
-- still describes the 8-series run; read 330/660 as 120/240.
-- Issue #139 (rights): exact revert of db-apply.sql. Points the 330 rows back
-- at their public recording-audio URLs and drops the snapshot table.
--
-- The public originals must exist, or playback would break: if
-- `cli.ts delete-public --execute` already ran, first run
-- `cli.ts restore-public --execute` and `cli.ts verify-restore`.
-- Aborts with no change if an original is missing or anything drifted.
-- Not needed to make the works public again: PR #210 rollback.sql alone
-- keeps the narration playable through the private proxy (README.md).
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

select r.id from public.recordings r
join libread_internal.issue139_audio_private_kotou_20261115 t on t.recording_id = r.id
for update of r;

do $$
declare
  v_rows integer;
begin
  if (select count(*) from libread_internal.issue139_audio_private_kotou_20261115) <> 120
     or exists (
       select 1 from libread_internal.issue139_audio_private_kotou_20261115
       where series_id not in ('d5e231b1-4f59-4d44-80a8-067cd49f8504'))
  then raise exception 'ISSUE139_AUDIO_ROLLBACK_SNAPSHOT_SCOPE_MISMATCH'; end if;

  if exists (
    select 1
    from libread_internal.issue139_audio_private_kotou_20261115 t
    left join public.recordings r on r.id = t.recording_id
    where r.id is null
       or r.audio_storage_path is distinct from t.path_after
       or r.series_id is distinct from t.series_id
       or r.episode_id is distinct from t.episode_id
  ) then raise exception 'ISSUE139_AUDIO_ROLLBACK_STATE_DRIFT'; end if;

  -- All 660 public originals are present (same size as the private copy
  -- while that copy exists).
  if (select count(*)
      from libread_internal.issue139_audio_private_kotou_20261115 t
      cross join lateral (values (t.object_path),
                                 (regexp_replace(t.object_path, '\.wav$', '.timing.json'))) o(name)
      join storage.objects s on s.bucket_id = 'recording-audio' and s.name = o.name
      left join storage.objects d on d.bucket_id = 'ai-narration-private' and d.name = o.name
      where d.id is null
         or (s.metadata->>'size')::bigint = (d.metadata->>'size')::bigint) <> 240 then
    raise exception 'ISSUE139_AUDIO_ROLLBACK_PUBLIC_OBJECTS_MISSING';
  end if;

  update public.recordings r
    set audio_storage_path = t.path_before
  from libread_internal.issue139_audio_private_kotou_20261115 t
  where r.id = t.recording_id
    and r.audio_storage_path = t.path_after;
  get diagnostics v_rows = row_count;
  if v_rows <> 120 then
    raise exception 'ISSUE139_AUDIO_ROLLBACK_ROWCOUNT_MISMATCH %', v_rows;
  end if;
end $$;

drop table libread_internal.issue139_audio_private_kotou_20261115;
commit;
