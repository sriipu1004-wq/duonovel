-- ISSUE #137: nonproduction CURRENT GUARD regression, NOT a deployable SQL migration.
-- Service-role direct SQL intentionally seeds a single historical PUBLIC Human
-- metadata row while PostgreSQL triggers are locally suspended, then verifies
-- that normal triggers protect ALL subsequent writes, including version-only.
-- No physical bytes, no live identities, no hosted DB, no persistent rows.
\set ON_ERROR_STOP on
DO $guard$
BEGIN
 IF current_database() <> 'postgres'
    OR NOT EXISTS(SELECT 1 FROM libread_r0_disposable.sentinel
      WHERE id AND purpose='SYNTHETIC-R0-ONLY')
    OR NOT EXISTS(SELECT 1 FROM pg_trigger t
      WHERE t.tgrelid='storage.objects'::regclass
        AND t.tgname='issue137_b2_public_audio_storage'
        AND NOT t.tgisinternal AND t.tgenabled='O')
 THEN RAISE EXCEPTION 'ISSUE137_NONLOCAL_LEGACY_WRITE_TEST_REFUSED'
      USING ERRCODE='42501';
 END IF;
END $guard$;
BEGIN;
SELECT gen_random_uuid()::text AS sid,
       gen_random_uuid()::text AS eid,
       (SELECT author_id::text FROM public.series ORDER BY id LIMIT 1) AS owner
\gset
INSERT INTO public.series(id,author_id,publication_status,content_rating,content_warnings)
VALUES (:'sid'::uuid,:'owner'::uuid,'public','general',ARRAY[]::text[]);
INSERT INTO public.episodes(id,series_id,episode_number,posting_status,is_published)
VALUES (:'eid'::uuid,:'sid'::uuid,1,'posted',true);
-- The single synthetic OLD object is pre-existing by definition; this
-- PostgreSQL-only fixture insertion is never a recommended provider API path.
SET LOCAL session_replication_role = replica;
INSERT INTO storage.objects(bucket_id,name,metadata,version)
VALUES('recording-audio',
       'human/'||:'sid'||'/'||:'eid'||'/'||:'owner'||'/legacy/original.webm',
       '{"mimetype":"audio/webm","size":64}'::jsonb,'synthetic-before-b2');
SET LOCAL session_replication_role = origin;
SET LOCAL ROLE service_role;
DO $negative$
DECLARE legacy_id uuid; old_public uuid; denied_update boolean;
BEGIN
 SELECT id INTO legacy_id FROM storage.objects
 WHERE bucket_id='recording-audio'
 AND name LIKE 'human/%/legacy/original.webm' AND version='synthetic-before-b2'
 ORDER BY id LIMIT 1;
 IF legacy_id IS NULL THEN RAISE EXCEPTION 'ISSUE137_SYNTHETIC_LEGACY_OBJECT_MISSING'; END IF;
 denied_update:=false;
 BEGIN
  UPDATE storage.objects SET metadata=coalesce(metadata,'{}'::jsonb)
    || '{"mimetype":"audio/webm","size":77}'::jsonb WHERE id=legacy_id;
 EXCEPTION WHEN OTHERS THEN
  IF sqlstate<>'42501' OR sqlerrm<>'B2_PUBLIC_HUMAN_LEGACY_UPDATE_HOLD'
   THEN RAISE; END IF;
  denied_update:=true;
 END;
 IF NOT denied_update THEN RAISE EXCEPTION 'ISSUE137_PUBLIC_HUMAN_SAME_KEY_UPDATE_ALLOWED'; END IF;
 denied_update:=false;
 BEGIN
  UPDATE storage.objects SET version='synthetic-new-byte-pointer' WHERE id=legacy_id;
 EXCEPTION WHEN OTHERS THEN
  IF sqlstate<>'42501' OR sqlerrm<>'B2_PUBLIC_HUMAN_LEGACY_UPDATE_HOLD'
   THEN RAISE; END IF;
  denied_update:=true;
 END;
 IF NOT denied_update THEN RAISE EXCEPTION 'ISSUE137_PUBLIC_HUMAN_VERSION_ONLY_UPDATE_ALLOWED'; END IF;
 SELECT o.id INTO old_public FROM storage.objects o
 JOIN public.series s ON o.bucket_id='recording-audio'
   AND o.name LIKE 'nemo/'||s.id::text||'/%'
 JOIN public.episodes e ON e.series_id=s.id
   AND o.name LIKE 'nemo/'||s.id::text||'/'||e.id::text||'/%'
 WHERE s.publication_status='private' AND s.content_rating='r18'
 ORDER BY o.id LIMIT 1;
 IF old_public IS NULL THEN RAISE EXCEPTION 'ISSUE137_WITHDRAWN_AUDIO_FIXTURE_MISSING'; END IF;
 denied_update:=false;
 BEGIN
  UPDATE storage.objects SET version='synthetic-invalid-redirect' WHERE id=old_public;
 EXCEPTION WHEN OTHERS THEN
  IF sqlstate<>'23514' OR sqlerrm<>'B2_PUBLIC_MEDIA_WRITE_BLOCKED'
   THEN RAISE; END IF;
  denied_update:=true;
 END;
 IF NOT denied_update THEN RAISE EXCEPTION 'ISSUE137_WITHDRAWN_VERSION_ONLY_UPDATE_ALLOWED'; END IF;
 RAISE NOTICE 'PASS: service_role direct SQL denied legacy PUBLIC Human same-key metadata+version rewrites and withdrawn Nemo version-only update';
END $negative$;
ROLLBACK;
-- Nonproduction transaction-only fixture must leave no metadata behind.
DO $rollback$
BEGIN
 IF EXISTS(SELECT 1 FROM storage.objects WHERE version IN
        ('synthetic-before-b2','synthetic-new-byte-pointer','synthetic-invalid-redirect'))
 THEN RAISE EXCEPTION 'ISSUE137_LEGACY_WRITE_TEST_DID_NOT_ROLL_BACK'; END IF;
 RAISE NOTICE 'ISSUE137_DIRECT_LEGACY_HUMAN_VERSION_ROLLBACK_PASS';
END $rollback$;
