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
join libread_internal.issue139_audio_private_20261115 t on t.recording_id = r.id
for update of r;

do $$
declare
  v_rows integer;
begin
  if (select count(*) from libread_internal.issue139_audio_private_20261115) <> 330
     or exists (
       select 1 from libread_internal.issue139_audio_private_20261115
       where series_id not in ('8514e9da-7864-4dad-a397-de06abee8fdc',
                               'd5cc7bf2-c76e-49e8-a078-150636fc0344',
                               '4d328931-ca04-4843-bcb5-9ac080cfbbf1',
                               'ac25272b-fc09-4f20-a94a-816791e750d0',
                               '82309887-add7-4406-aa18-d8a435c3b967',
                               'f7ba9cd3-0ede-48df-92d7-2ea297f33475',
                               '833b0303-d034-4ebb-ae6f-e023dd765a64',
                               '4f48c202-3ba1-47cb-b887-90880534c96e'))
  then raise exception 'ISSUE139_AUDIO_ROLLBACK_SNAPSHOT_SCOPE_MISMATCH'; end if;

  if exists (
    select 1
    from libread_internal.issue139_audio_private_20261115 t
    left join public.recordings r on r.id = t.recording_id
    where r.id is null
       or r.audio_storage_path is distinct from t.path_after
       or r.series_id is distinct from t.series_id
       or r.episode_id is distinct from t.episode_id
  ) then raise exception 'ISSUE139_AUDIO_ROLLBACK_STATE_DRIFT'; end if;

  -- All 660 public originals are present (same size as the private copy
  -- while that copy exists).
  if (select count(*)
      from libread_internal.issue139_audio_private_20261115 t
      cross join lateral (values (t.object_path),
                                 (regexp_replace(t.object_path, '\.wav$', '.timing.json'))) o(name)
      join storage.objects s on s.bucket_id = 'recording-audio' and s.name = o.name
      left join storage.objects d on d.bucket_id = 'ai-narration-private' and d.name = o.name
      where d.id is null
         or (s.metadata->>'size')::bigint = (d.metadata->>'size')::bigint) <> 660 then
    raise exception 'ISSUE139_AUDIO_ROLLBACK_PUBLIC_OBJECTS_MISSING';
  end if;

  update public.recordings r
    set audio_storage_path = t.path_before
  from libread_internal.issue139_audio_private_20261115 t
  where r.id = t.recording_id
    and r.audio_storage_path = t.path_after;
  get diagnostics v_rows = row_count;
  if v_rows <> 330 then
    raise exception 'ISSUE139_AUDIO_ROLLBACK_ROWCOUNT_MISMATCH %', v_rows;
  end if;
end $$;

drop table libread_internal.issue139_audio_private_20261115;
commit;
