-- Child84: aggregated backup and Storage consistency inventory. READ-ONLY.
-- Run with a privileged database inspector; do not expose raw object keys/URLs.
BEGIN READ ONLY;

SELECT b.name AS bucket, b.public AS is_public,
       count(o.id)::bigint AS object_count,
       coalesce(sum((o.metadata->>'size')::bigint),0)::bigint AS reported_object_bytes
FROM storage.buckets b
LEFT JOIN storage.objects o ON o.bucket_id=b.id
GROUP BY b.name,b.public
ORDER BY b.name;

WITH stored_paths AS MATERIALIZED (
  SELECT DISTINCT split_part(audio_storage_path,'recording-audio/',2) AS object_name
  FROM public.recordings
  WHERE audio_storage_path LIKE '%recording-audio/%'
), bucket_objects AS (
  SELECT o.name, coalesce((o.metadata->>'size')::bigint,0) AS size_bytes
  FROM storage.objects o
  WHERE o.bucket_id='recording-audio'
)
SELECT count(*)::bigint AS recording_audio_objects,
       count(*) FILTER (WHERE p.object_name IS NOT NULL)::bigint AS matched_to_recordings,
       count(*) FILTER (WHERE p.object_name IS NULL)::bigint AS no_recordings_direct_reference,
       coalesce(sum(size_bytes) FILTER (WHERE p.object_name IS NOT NULL),0)::bigint AS matched_bytes,
       coalesce(sum(size_bytes) FILTER (WHERE p.object_name IS NULL),0)::bigint AS unmatched_bytes
FROM bucket_objects o
LEFT JOIN stored_paths p ON p.object_name=o.name;

SELECT count(*)::bigint AS recording_rows,
       count(*) FILTER (WHERE nullif(trim(audio_storage_path),'') IS NOT NULL)::bigint AS nonempty_audio_paths,
       count(DISTINCT audio_storage_path)::bigint AS distinct_audio_paths,
       count(*) FILTER (WHERE audio_storage_path LIKE '%recording-audio/%')::bigint AS recording_bucket_paths
FROM public.recordings;

COMMIT;
