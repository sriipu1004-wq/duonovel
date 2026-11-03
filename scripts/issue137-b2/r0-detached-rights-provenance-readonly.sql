-- Issue #137: 51 detached PUBLIC origin assets, bounded aggregate provenance.
-- Read-only hosted metadata and coarse account/consent chronology only.
-- No raw UUID, audio path, profile, email, IP, message, audio bytes or JSON payload.
-- Output alias = deterministic path grouping label, NOT identity/rights proof.
-- In particular, play_logs is a MUTABLE resume-progress table (upsert),
-- and its historical rows do NOT authenticate audio delivery or consent.
BEGIN READ ONLY;
WITH a AS (
 SELECT o.name,
  CASE WHEN o.name LIKE 'human/%' THEN 'human' ELSE 'nemo' END AS family,
  split_part(o.name,'/',2) AS sid,split_part(o.name,'/',3) AS eid,
  CASE WHEN o.name LIKE 'human/%' THEN split_part(o.name,'/',4)
   ELSE NULL END AS actor,
  CASE WHEN o.name LIKE 'human/%' THEN split_part(o.name,'/',5)
   ELSE NULL END AS upload_segment,
  CASE WHEN o.name LIKE 'human/%' THEN
   left(md5(split_part(o.name,'/',2)||':'||split_part(o.name,'/',3)||':'||
    split_part(o.name,'/',4)||':'||split_part(o.name,'/',5)),12)
   ELSE left(md5(split_part(o.name,'/',2)),12) END AS alias,
  o.created_at,o.metadata,o.owner,o.owner_id,o.user_metadata
 FROM storage.objects o
 WHERE o.bucket_id='recording-audio'
  AND (o.name LIKE 'nemo/%' OR o.name LIKE 'human/%')
  AND NOT EXISTS(SELECT 1 FROM public.series s
    WHERE s.id::text=split_part(o.name,'/',2))
), cohorts AS (
 SELECT family,sid,actor,upload_segment,alias,
  count(*)::integer AS object_count,
  count(DISTINCT eid)::integer AS episode_segments,
  count(*) FILTER(WHERE name ~* '[.]json$')::integer AS json_named,
  count(*) FILTER(WHERE name ~* '[.](wav|webm|m4a|mp3|ogg|flac|aac)$')::integer
   AS audio_named,
  sum(coalesce((metadata->>'size')::bigint,0)) AS metadata_reported_bytes,
  min(created_at) AS first_asset,max(created_at) AS last_asset,
  count(*) FILTER(WHERE owner IS NOT NULL OR owner_id IS NOT NULL)::integer
   AS storage_owner_metadata_rows,
  count(*) FILTER(WHERE user_metadata IS NOT NULL
   AND user_metadata<>'{}'::jsonb)::integer AS nonempty_user_metadata_rows
 FROM a GROUP BY family,sid,actor,upload_segment,alias
), structural_scopes AS (
 SELECT sid,eid,bool_or(family='human') AS human_scope,
  bool_or(family='nemo') AS nemo_scope
 FROM a GROUP BY sid,eid
), related_logs AS (
 SELECT pl.id,bool_or(a.family='human') AS human_scope,
  bool_or(a.family='nemo') AS nemo_scope
 FROM public.play_logs pl
 JOIN (SELECT DISTINCT family,sid,eid FROM a) a
  ON pl.series_id=a.sid OR pl.episode_id=a.eid
 GROUP BY pl.id
)
SELECT c.family,c.alias AS cohort_alias,c.object_count,c.episode_segments,
 c.json_named,c.audio_named,c.metadata_reported_bytes,
 c.first_asset::date AS first_asset_date,c.last_asset::date AS last_asset_date,
 c.storage_owner_metadata_rows,c.nonempty_user_metadata_rows,
 (SELECT count(*) FROM public.recordings r WHERE r.series_id::text=c.sid)
  AS current_recording_rows,
 (SELECT count(*) FROM public.recording_generation_queue q WHERE EXISTS(
  SELECT 1 FROM a WHERE a.alias=c.alias AND a.family=c.family
   AND q.episode_id::text=a.eid)) AS current_generation_queue_rows,
 (SELECT count(*) FROM public.series_recording_requests q WHERE
  q.series_id::text=c.sid) AS current_series_recording_requests,
 (SELECT count(*) FROM public.recording_play_events e WHERE
  e.series_id::text=c.sid) AS recording_play_event_rows,
 (SELECT count(*) FROM public.series_view_events e WHERE e.series_id::text=c.sid)
  AS series_view_event_rows,
 (SELECT count(*) FROM public.play_logs pl WHERE pl.series_id=c.sid)
  AS series_scope_mutable_play_logs,
 (SELECT count(DISTINCT pl.id) FROM public.play_logs pl WHERE EXISTS(
  SELECT 1 FROM a WHERE a.alias=c.alias AND a.family=c.family
   AND a.eid=pl.episode_id)) AS exact_episode_mutable_play_logs,
 (SELECT count(*) FROM public.play_logs pl
  WHERE pl.series_id=c.sid AND pl.created_at<c.first_asset)
  AS series_scope_logs_created_before_first_asset,
 CASE WHEN c.family='human' THEN EXISTS(
  SELECT 1 FROM auth.users u WHERE u.id::text=c.actor) ELSE NULL END
  AS human_actor_auth_row_exists,
 CASE WHEN c.family='human' THEN EXISTS(
  SELECT 1 FROM public.users u WHERE u.id::text=c.actor) ELSE NULL END
  AS human_actor_profile_row_exists,
 CASE WHEN c.family='human' THEN (
  SELECT bool_and(u.created_at<=c.first_asset) FROM auth.users u
  WHERE u.id::text=c.actor) ELSE NULL END
  AS human_account_existed_by_first_asset,
 CASE WHEN c.family='human' THEN (
  SELECT count(*) FROM public.user_recording_consents v
  WHERE v.user_id::text=c.actor
   AND v.consent_key='recording_studio_global') ELSE NULL END
  AS human_current_global_consent_rows,
 CASE WHEN c.family='human' THEN (
  SELECT bool_and(v.consented_at>c.last_asset)
  FROM public.user_recording_consents v
  WHERE v.user_id::text=c.actor
   AND v.consent_key='recording_studio_global') ELSE NULL END
  AS human_current_global_consent_postdates_last_asset,
 (SELECT count(*) FROM related_logs) AS all_scopes_unique_progress_log_rows,
 (SELECT count(*) FROM related_logs WHERE human_scope AND nemo_scope)
  AS overlapping_human_nemo_progress_log_rows,
 (SELECT count(DISTINCT sid) FROM a) AS distinct_series_across_families,
 (SELECT count(*) FROM structural_scopes) AS distinct_episode_scopes_across_families,
 (SELECT count(*) FROM structural_scopes
  WHERE human_scope AND nemo_scope) AS episodes_with_both_families,
 (SELECT count(*) FROM a JOIN structural_scopes s USING(sid,eid)
  WHERE s.human_scope AND s.nemo_scope AND a.family='nemo')
  AS nemo_objects_in_shared_episodes,
 (SELECT count(*) FROM a JOIN structural_scopes s USING(sid,eid)
  WHERE s.human_scope AND s.nemo_scope AND a.family='human')
  AS human_objects_in_shared_episodes,
 'RIGHTS_UNKNOWN_NO_PUBLICATION_NO_MOVE_NO_DELETE'::text AS decision
FROM cohorts c ORDER BY c.family,c.alias;
ROLLBACK;
