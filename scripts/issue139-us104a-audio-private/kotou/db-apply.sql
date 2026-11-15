-- 孤島の鬼 (set "kotou", ISSUE139_AUDIO_SET=kotou): same steps as ../db-apply.sql for
-- 1 series, 120 recordings, 240 objects. Generated from ../db-apply.sql; the counts
-- and series below replace the 8-series values. The text after this header
-- still describes the 8-series run; read 330/660 as 120/240.
-- Issue #139 (rights): point the 330 AI narration rows of the 8 §104A works
-- (made private by PR #210) at their copies in the PRIVATE bucket.
--   recordings.audio_storage_path:
--     https://nyxbnccuvmlzffgtdadi.supabase.co/storage/v1/object/public/recording-audio/<p>
--       -> ai-narration-private:<p>        (<p> = (aivis|nemo)/<series>/<episode>/<file>.wav)
-- The access-checked proxy /api/recordings/ai-audio/<id> then serves them
-- (series public + chapter public, or the owner; R18 rule; row is_public).
-- Nothing else changes: is_public, reader, voice model and every other column
-- stay as they are. Previous values are stored in libread_internal so
-- db-rollback.sql restores them exactly.
--
-- Run ONLY after `cli.ts copy --execute` and `cli.ts verify` passed. The
-- guards below re-check in SQL that all 660 copies exist with the original
-- sizes, and abort otherwise. One transaction.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $$ begin
  if to_regclass('libread_internal.issue139_audio_private_kotou_20261115') is not null then
    raise exception 'ISSUE139_AUDIO_ALREADY_APPLIED';
  end if;
end $$;

select r.id from public.recordings r
where r.series_id in ('d5e231b1-4f59-4d44-80a8-067cd49f8504')
for update;

create schema if not exists libread_internal;
create table libread_internal.issue139_audio_private_kotou_20261115 (
  recording_id uuid primary key,
  series_id uuid not null,
  episode_id uuid not null,
  is_public_before boolean,
  path_before text not null,
  object_path text not null unique,
  path_after text not null
);
alter table libread_internal.issue139_audio_private_kotou_20261115 enable row level security;
revoke all on libread_internal.issue139_audio_private_kotou_20261115 from public, anon, authenticated;

insert into libread_internal.issue139_audio_private_kotou_20261115
  (recording_id, series_id, episode_id, is_public_before, path_before, object_path, path_after)
select r.id, r.series_id, r.episode_id, r.is_public, r.audio_storage_path,
       substr(r.audio_storage_path, length('https://nyxbnccuvmlzffgtdadi.supabase.co/storage/v1/object/public/recording-audio/') + 1),
       'ai-narration-private:' ||
       substr(r.audio_storage_path, length('https://nyxbnccuvmlzffgtdadi.supabase.co/storage/v1/object/public/recording-audio/') + 1)
from public.recordings r
where r.series_id in ('d5e231b1-4f59-4d44-80a8-067cd49f8504');

do $$
declare
  v_rows integer;
begin
  if (select count(*) from libread_internal.issue139_audio_private_kotou_20261115) <> 120 then
    raise exception 'ISSUE139_AUDIO_RECORDING_COUNT_MISMATCH';
  end if;
  -- Every row holds exactly the public URL of an object under its own
  -- series/episode, in the shape the app's private reference parser accepts.
  if exists (
    select 1 from libread_internal.issue139_audio_private_kotou_20261115 t
    where t.path_before !~ ('^https://nyxbnccuvmlzffgtdadi[.]supabase[.]co/storage/v1/object/public/recording-audio/(aivis|nemo)/'
                            || t.series_id::text || '/' || t.episode_id::text || '/[A-Za-z0-9._-]+[.]wav$')
       or t.object_path like '%..%'
  ) then raise exception 'ISSUE139_AUDIO_PATH_SHAPE_DRIFT'; end if;

  -- All 660 copies exist in the private bucket, with the original size while
  -- the original is still there.
  if (select count(*)
      from libread_internal.issue139_audio_private_kotou_20261115 t
      cross join lateral (values (t.object_path),
                                 (regexp_replace(t.object_path, '\.wav$', '.timing.json'))) o(name)
      join storage.objects d on d.bucket_id = 'ai-narration-private' and d.name = o.name
      left join storage.objects s on s.bucket_id = 'recording-audio' and s.name = o.name
      where s.id is null
         or (s.metadata->>'size')::bigint = (d.metadata->>'size')::bigint) <> 240 then
    raise exception 'ISSUE139_AUDIO_PRIVATE_COPIES_MISSING';
  end if;

  update public.recordings r
    set audio_storage_path = t.path_after
  from libread_internal.issue139_audio_private_kotou_20261115 t
  where r.id = t.recording_id
    and r.audio_storage_path = t.path_before;
  get diagnostics v_rows = row_count;
  if v_rows <> 120 then
    raise exception 'ISSUE139_AUDIO_ROWCOUNT_MISMATCH %', v_rows;
  end if;

  if exists (
    select 1 from public.recordings r
    where r.series_id in (select series_id from libread_internal.issue139_audio_private_kotou_20261115)
      and r.audio_storage_path not like 'ai-narration-private:%'
  ) then raise exception 'ISSUE139_AUDIO_PUBLIC_URL_LEFT'; end if;
end $$;
commit;
