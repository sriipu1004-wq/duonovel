-- Issue #137: RELEASE PRECHECK, READ-ONLY metadata only.
-- NOT a deployable migration, NOT a claim of production release authorization.
-- Fail closed: evidence is descriptive and release status remains HOLD even
-- when current catalog is consistent with the recorded 2026-11-03 snapshot.
-- This query needs no app credentials, audio content or individual user data.
BEGIN READ ONLY;
WITH required_columns(schema_name,table_name,column_name,impact) AS (
 VALUES
 ('public','series','author_id','owner'),('public','series','publication_status','visibility'),
 ('public','series','content_rating','r18'),('public','series','content_warnings','r18'),
 ('public','series','content_warning_locks','r18'),
 ('public','series','source_language','translation'),
 ('public','series','human_translation_permission_mode','human'),
 ('public','episodes','posting_status','visibility'),
 ('public','episodes','is_published','visibility'),
 ('public','recordings','audio_storage_path','public_audio'),
 ('public','recordings','reader_user_id','narrator'),
 ('public','recordings','voice_model_id','ai_human'),
 ('public','users','show_r18_content','r18'),
 ('public','users','r18_confirmed_at','r18')
), missing_columns AS (
 SELECT r.schema_name||'.'||r.table_name||'.'||r.column_name AS name
 FROM required_columns r WHERE NOT EXISTS (
 SELECT 1 FROM information_schema.columns c
 WHERE c.table_schema=r.schema_name AND c.table_name=r.table_name
 AND c.column_name=r.column_name
 )
), expected_relations(name) AS (
 VALUES ('public.series'),('public.episodes'),('public.recordings'),
 ('public.users'),('public.public_episode_work_summaries'),
 ('public.user_recording_consents'),('public.episode_human_translations'),
 ('public.private_library_works'),('public.credit_ledger')
), missing_relations AS (
 SELECT name FROM expected_relations WHERE to_regclass(name) IS NULL
), relevant_triggers AS (
 SELECT t.tgname FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
 JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE NOT t.tgisinternal AND n.nspname IN ('public','storage')
 AND (t.tgname LIKE 'issue137_b2_%' OR t.tgname LIKE 'issue137_r0_%')
), relevant_policies AS (
 SELECT policyname FROM pg_policies WHERE schemaname IN ('public','storage')
 AND (policyname LIKE 'issue137_b2_%' OR policyname LIKE 'issue137_r0_%')
), baseline AS (
 SELECT
 (SELECT coalesce(jsonb_agg(name ORDER BY name),'[]'::jsonb) FROM missing_columns) AS missing_columns,
 (SELECT coalesce(jsonb_agg(name ORDER BY name),'[]'::jsonb) FROM missing_relations) AS missing_relations,
 (SELECT count(*) FROM relevant_triggers) AS issue137_trigger_count,
 (SELECT count(*) FROM relevant_policies) AS issue137_policy_count,
 (SELECT count(*) FROM supabase_migrations.schema_migrations) AS recorded_versions,
 (SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'public',public) ORDER BY id),'[]'::jsonb)
  FROM storage.buckets WHERE id IN ('recording-audio','human-recording-audio','r18-recording-audio')) AS bucket_metadata,
 (SELECT coalesce(bool_or(b.public),false) FROM storage.buckets b WHERE b.id='recording-audio') AS public_audio_bucket_is_public,
 (SELECT coalesce(bool_and(b.public IS FALSE),false) FROM storage.buckets b WHERE b.id='human-recording-audio') AS human_bucket_private,
 (SELECT coalesce(bool_and(b.public IS FALSE),true) FROM storage.buckets b WHERE b.id='r18-recording-audio') AS r18_bucket_not_public,
 (SELECT coalesce(bool_or(c.relrowsecurity),false) FROM pg_class c WHERE c.oid='public.series'::regclass) AS series_rls,
 (SELECT coalesce(bool_or(c.relrowsecurity),false) FROM pg_class c WHERE c.oid='public.episodes'::regclass) AS episode_rls,
 (SELECT coalesce(bool_or(c.relrowsecurity),false) FROM pg_class c WHERE c.oid='public.recordings'::regclass) AS recording_rls,
 (SELECT exists(SELECT 1 FROM pg_class c WHERE c.oid='public.public_episode_work_summaries'::regclass AND 'security_invoker=true'=any(c.reloptions))) AS public_summary_security_invoker
)
SELECT *,
 CASE WHEN jsonb_array_length(missing_columns)=0
   AND jsonb_array_length(missing_relations)=0
   AND issue137_trigger_count=0 AND issue137_policy_count=0
   AND series_rls AND episode_rls AND recording_rls
   AND public_summary_security_invoker
   AND public_audio_bucket_is_public AND human_bucket_private AND r18_bucket_not_public
 THEN 'BASELINE_METADATA_COMPATIBLE_RELEASE_STILL_HOLD'
 ELSE 'METADATA_DRIFT_RELEASE_HOLD' END AS preflight_result,
 'RELEASE_HOLD_UNTIL_HISTORY_RECONCILIATION_RIGHTS_BACKUP_INDEPENDENT_AUDIT_EXPLICIT_APPROVAL'::text
 AS release_gate
FROM baseline;
ROLLBACK;
