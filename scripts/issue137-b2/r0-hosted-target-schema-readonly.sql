-- Issue #137: LIVE READ-ONLY B2/R0/H1 target shape and safety baseline.
-- Does not prove all prior migrations executed or authorize migration, merge,
-- media retirement, Production writes, payment changes or rights changes.
-- Scope: pg_catalog/information_schema/storage metadata ONLY; no user rows.
-- Run only with an already-authorized READ-ONLY hosted connection.
BEGIN READ ONLY;
WITH expected_cols(schema_name,table_name,column_name,udt_name,nullable) AS (
 VALUES
 ('public','series','id','uuid','NO'),
 ('public','series','author_id','uuid','NO'),
 ('public','series','publication_status','text','NO'),
 ('public','series','recording_permission_mode','text','NO'),
 ('public','series','content_rating','text','NO'),
 ('public','series','content_warnings','_text','NO'),
 ('public','series','content_warning_locks','_text','NO'),
 ('public','episodes','id','uuid','NO'),
 ('public','episodes','series_id','uuid','NO'),
 ('public','episodes','posting_status','text','NO'),
 ('public','episodes','is_published','bool','NO'),
 ('public','recordings','id','uuid','NO'),
 ('public','recordings','series_id','uuid','YES'),
 ('public','recordings','episode_id','uuid','NO'),
 ('public','recordings','reader_id','uuid','NO'),
 ('public','recordings','reader_user_id','uuid','YES'),
 ('public','recordings','reader_name','text','YES'),
 ('public','recordings','voice_model_id','uuid','YES'),
 ('public','recordings','is_public','bool','YES'),
 ('public','recordings','audio_storage_path','text','NO'),
 ('public','users','id','uuid','NO'),
 ('public','users','show_r18_content','bool','NO'),
 ('public','users','r18_confirmed_at','timestamptz','YES'),
 ('public','user_recording_consents','user_id','uuid','NO'),
 ('public','user_recording_consents','consent_key','text','NO'),
 ('public','user_recording_consents','consent_version','text','NO'),
 ('storage','objects','bucket_id','text','YES'),
 ('storage','objects','name','text','YES'),
 ('storage','buckets','id','text','NO'),
 ('storage','buckets','public','bool','YES')
), checked_columns AS (
 select 'COLUMN'::text as area,
  e.schema_name||'.'||e.table_name||'.'||e.column_name as check_id,
  (c.udt_name=e.udt_name and c.is_nullable=e.nullable) as pass,
  e.udt_name||' / nullable='||e.nullable as expected,
  coalesce(c.udt_name||' / nullable='||c.is_nullable,'MISSING') as observed
 from expected_cols e left join information_schema.columns c
 on c.table_schema=e.schema_name and c.table_name=e.table_name
 and c.column_name=e.column_name
), checks(area,check_id,pass,expected,observed) AS (
 select area,check_id,coalesce(pass,false),expected,observed from checked_columns
 union all
 select 'BASELINE','postgres_17_plus',
  current_setting('server_version_num')::integer>=170000,
  '>=170000',current_setting('server_version_num')
 union all
 select 'BASELINE','stored_migration_sql_exists_21',
  (select count(*)=21 and count(*) filter(where cardinality(statements)=1)=21
   from supabase_migrations.schema_migrations),
  '21 recorded one-statement entries',
  (select count(*)::text||' recorded' from supabase_migrations.schema_migrations)
 union all
 select 'BUCKET','old_public_audio_currently_public',
  (select count(*)=1 and bool_and(public is true) from storage.buckets where id='recording-audio'),
  'PUBLIC (NOT TAKEN DOWN)',(select coalesce(bool_or(public)::text,'MISSING') from storage.buckets where id='recording-audio')
 union all
 select 'BUCKET','human_audio_must_stay_private',
  (select count(*)=1 and bool_and(public is false) from storage.buckets where id='human-recording-audio'),
  'PRIVATE',(select coalesce(bool_or(public)::text,'MISSING') from storage.buckets where id='human-recording-audio')
 union all
 select 'CANDIDATE_ABSENT','no_B2_R0_H1_trigger_collision',
  not exists(select 1 from pg_trigger where not tgisinternal
   and (tgname like 'issue137_b2_%' or tgname like 'issue137_r0_%' or tgname like 'issue137_h1_%')),
  'no candidate triggers yet',
  (select count(*)::text from pg_trigger where not tgisinternal
   and (tgname like 'issue137_b2_%' or tgname like 'issue137_r0_%' or tgname like 'issue137_h1_%'))
 union all
 select 'CANDIDATE_ABSENT','no_B2_restrictive_policy_yet',
  not exists(select 1 from pg_policies where policyname like 'issue137_b2_%'),
  'not yet installed',
  (select count(*)::text from pg_policies where policyname like 'issue137_b2_%')
 union all
 select 'RISK_OBSERVED','service_role_bypasses_RLS',
  (select rolbypassrls from pg_roles where rolname='service_role') is true,
  'true; separate S3/DB trigger fence needed',
  (select rolbypassrls::text from pg_roles where rolname='service_role')
)
select area,check_id,pass,expected,observed,
 'READ_ONLY_CATALOG_MATCH_IS_NOT_SQL_EXECUTION_OR_RELEASE_GO'::text as evidence,
 'MERGE_PRODUCTION_STORAGE_RIGHTS_HISTORY_HOLD'::text as release_gate
from checks order by area,check_id;
ROLLBACK;
