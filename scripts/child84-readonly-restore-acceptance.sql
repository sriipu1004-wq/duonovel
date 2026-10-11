-- Child84 Production baseline / isolated restoration acceptance inventory.
-- Requires a privileged, trusted read-only inspection session. Never post raw
-- database contents, keys, credentials, owner IDs or media paths to CI or PRs.
-- Run this exact SQL on BOTH the live source (baseline) and isolated restore,
-- then compare aggregate results captured at the SAME export/restore point.
-- Passing this query alone does NOT prove a database backup exists, byte-level
-- Storage recovery, media hashes, R18/Human permissions, real login E2E or
-- a consistent point-in-time export. Do not execute on an untrusted database.
BEGIN READ ONLY;

DO $child84$
DECLARE
  missing_relations text[];
BEGIN
  SELECT array_agg(needed.name ORDER BY needed.name)
    INTO missing_relations
  FROM (VALUES
    ('public.users'),
    ('public.series'),
    ('public.episodes'),
    ('public.recordings'),
    ('public.episode_human_translations'),
    ('public.private_library_works'),
    ('public.private_library_reading_progress'),
    ('public.user_series_bookmarks'),
    ('public.public_episode_work_summaries'),
    ('storage.buckets'),
    ('storage.objects')
  ) AS needed(name)
  WHERE to_regclass(needed.name) IS NULL;

  IF missing_relations IS NOT NULL THEN
    RAISE EXCEPTION 'Missing critical database relations: %',
      array_to_string(missing_relations, ', ');
  END IF;

  IF EXISTS (
    SELECT 1
      FROM (VALUES
        ('public.series'),
        ('public.episodes'),
        ('public.recordings'),
        ('public.episode_human_translations'),
        ('public.private_library_works'),
        ('public.private_library_reading_progress'),
        ('public.user_series_bookmarks')
      ) AS needed(name)
      JOIN pg_class c ON c.oid = to_regclass(needed.name)
     WHERE c.relrowsecurity IS NOT TRUE
  ) THEN
    RAISE EXCEPTION 'At least one restored security-sensitive table has RLS disabled';
  END IF;

  IF has_table_privilege('anon', 'public.episode_human_translations', 'SELECT')
    OR has_table_privilege('authenticated', 'public.episode_human_translations', 'SELECT')
    OR has_table_privilege('anon', 'public.private_library_works', 'SELECT')
    OR has_table_privilege('anon', 'public.private_library_reading_progress', 'SELECT')
    OR has_table_privilege('authenticated', 'public.private_library_reading_progress', 'SELECT')
  THEN
    RAISE EXCEPTION 'Restored grants expose server-only or private data';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE contype = 'f' AND conrelid = 'public.episodes'::regclass
      AND confrelid = 'public.series'::regclass
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE contype = 'f' AND conrelid = 'public.recordings'::regclass
      AND confrelid = 'public.episodes'::regclass
  ) THEN
    RAISE EXCEPTION 'Critical episode/recording foreign keys are missing';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.episodes e
    LEFT JOIN public.series s ON s.id = e.series_id
    WHERE s.id IS NULL
  ) OR EXISTS (
    SELECT 1 FROM public.recordings r
    LEFT JOIN public.episodes e ON e.id = r.episode_id
    WHERE r.episode_id IS NOT NULL AND e.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Orphan episode/recording references detected';
  END IF;
END $child84$;

-- Aggregates only. Compare these against a trusted export-time baseline.
SELECT
  (SELECT count(*) FROM public.series)::bigint AS total_series,
  (SELECT count(*) FROM public.series
    WHERE publication_status = 'public')::bigint AS public_series,
  (SELECT count(*) FROM public.episodes)::bigint AS total_episodes,
  (SELECT count(*) FROM public.episodes
    WHERE posting_status = 'posted'
      AND is_published IS TRUE)::bigint AS published_episodes,
  (SELECT count(*) FROM public.recordings)::bigint AS total_recordings,
  (SELECT count(*) FROM public.episode_human_translations)::bigint
    AS total_human_translation_rows,
  (SELECT count(*) FROM public.private_library_works)::bigint
    AS total_private_library_works,
  (SELECT count(*) FROM public.user_series_bookmarks)::bigint
    AS total_bookmarks,
  (SELECT count(*) FROM storage.objects)::bigint AS storage_metadata_objects,
  (SELECT coalesce(sum((metadata ->> 'size')::bigint), 0)
    FROM storage.objects)::bigint AS storage_metadata_bytes;

-- Only compare DB metadata with DB-held media references. Existence of a
-- storage.objects row is NOT proof that the underlying audio bytes exist.
WITH referenced_audio AS (
  SELECT DISTINCT split_part(audio_storage_path, 'recording-audio/', 2)
    AS object_name
  FROM public.recordings
  WHERE audio_storage_path LIKE '%recording-audio/%'
), stored_audio AS (
  SELECT name FROM storage.objects WHERE bucket_id = 'recording-audio'
)
SELECT
  (SELECT count(*) FROM referenced_audio)::bigint
    AS recording_audio_paths,
  (SELECT count(*) FROM stored_audio)::bigint
    AS storage_audio_metadata_rows,
  (SELECT count(*) FROM referenced_audio r
   LEFT JOIN stored_audio o ON o.name = r.object_name
   WHERE o.name IS NULL)::bigint AS recording_paths_missing_metadata,
  (SELECT count(*) FROM stored_audio o
   LEFT JOIN referenced_audio r ON r.object_name = o.name
   WHERE r.object_name IS NULL)::bigint
    AS audio_objects_without_direct_recording_reference;

COMMIT;
