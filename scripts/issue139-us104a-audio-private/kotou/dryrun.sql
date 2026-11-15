-- 孤島の鬼 (set "kotou", ISSUE139_AUDIO_SET=kotou): same steps as ../dryrun.sql for
-- 1 series, 120 recordings, 240 objects. Generated from ../dryrun.sql; the counts
-- and series below replace the 8-series values. The text after this header
-- still describes the 8-series run; read 330/660 as 120/240.
-- Issue #139 (rights): READ-ONLY preflight for moving the AI narration of
-- the 8 §104A works to the private bucket. Aggregates only.
-- Columns, in order:
--   rec_n            recordings of the 8 series                 (expect 120)
--   rec_public_url_n rows still holding the public URL           (120 before db-apply, 0 after)
--   rec_private_n    rows holding ai-narration-private:<path>    (0 before, 120 after)
--   rec_own_path_n   rows whose object path is under their own series/episode (330)
--   src_wav_n / src_timing_n   originals in recording-audio      (330 / 330 until delete-public)
--   dst_wav_n / dst_timing_n   copies in ai-narration-private    (0 / 0 before copy, 330 / 330 after)
--   dst_size_ok_n    copies whose size equals the original       (660 after copy, before delete)
--   src_bytes        total bytes of the originals
--   applied          db-apply.sql snapshot exists                (f before, t after)
--   series_private_n the 8 series currently private              (8 while PR #210 is applied)
begin read only;
with target(series_id) as (
  values ('d5e231b1-4f59-4d44-80a8-067cd49f8504'::uuid)
), r as (
  select r.id, r.series_id, r.episode_id, r.audio_storage_path,
         case
           when r.audio_storage_path like 'https://nyxbnccuvmlzffgtdadi.supabase.co/storage/v1/object/public/recording-audio/%'
             then substr(r.audio_storage_path, length('https://nyxbnccuvmlzffgtdadi.supabase.co/storage/v1/object/public/recording-audio/') + 1)
           when r.audio_storage_path like 'ai-narration-private:%'
             then substr(r.audio_storage_path, length('ai-narration-private:') + 1)
         end as path
  from public.recordings r join target t on t.series_id = r.series_id
), o as (
  select path as name, 'wav' as kind from r where path is not null
  union all
  select regexp_replace(path, '\.wav$', '.timing.json'), 'timing' from r where path is not null
), src as (
  select o.kind, s.name, (s.metadata->>'size')::bigint as size
  from o join storage.objects s on s.bucket_id = 'recording-audio' and s.name = o.name
), dst as (
  select o.kind, s.name, (s.metadata->>'size')::bigint as size
  from o join storage.objects s on s.bucket_id = 'ai-narration-private' and s.name = o.name
)
select
  (select count(*) from r) as rec_n,
  (select count(*) from r where audio_storage_path like 'https://%') as rec_public_url_n,
  (select count(*) from r where audio_storage_path like 'ai-narration-private:%') as rec_private_n,
  (select count(*) from r
    where path ~ ('^(aivis|nemo)/' || series_id::text || '/' || episode_id::text || '/[A-Za-z0-9._-]+[.]wav$')) as rec_own_path_n,
  (select count(*) from src where kind = 'wav') as src_wav_n,
  (select count(*) from src where kind = 'timing') as src_timing_n,
  (select count(*) from dst where kind = 'wav') as dst_wav_n,
  (select count(*) from dst where kind = 'timing') as dst_timing_n,
  (select count(*) from src join dst using (name) where src.size = dst.size) as dst_size_ok_n,
  (select coalesce(sum(size), 0) from src) as src_bytes,
  to_regclass('libread_internal.issue139_audio_private_kotou_20261115') is not null as applied,
  (select count(*) from public.series s join target t on t.series_id = s.id
    where s.publication_status = 'private') as series_private_n;
rollback;
