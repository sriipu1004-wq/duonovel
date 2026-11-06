-- Issue137 legacy Human audio: LIVE catalog/metadata READ-ONLY evidence.
-- No audio bytes, emails, raw storage object paths, user IDs, names or tokens
-- are selected. An MD5-derived prefix is ONLY a stable non-secret group label,
-- NOT a file hash, consent proof, or source authentication.
-- No permission or rights state is changed; 6 known assets are RELEASE_HOLD.
begin read only;
with o as (
 select split_part(obj.name,'/',2)::uuid as path_series,
   split_part(obj.name,'/',3)::uuid as path_episode,
   split_part(obj.name,'/',4)::uuid as path_actor,
   split_part(obj.name,'/',5) as path_upload,
   obj.name,obj.created_at,obj.updated_at,
   obj.owner,obj.owner_id,obj.metadata,obj.user_metadata
 from storage.objects obj
 where obj.bucket_id='recording-audio'
  and obj.name like 'human/%'
), groups as (
 select path_series,path_episode,path_actor,path_upload,
 count(*)::integer as object_count,
 count(*) filter(where lower(name) like '%.webm')::integer as webm_count,
 count(*) filter(where lower(name) like '%.m4a')::integer as m4a_count,
 count(*) filter(where lower(name) like '%.json')::integer as json_count,
 count(*) filter(where owner is not null or owner_id is not null)::integer as owner_metadata_count,
 count(*) filter(where user_metadata is not null
       and user_metadata<>'{}'::jsonb)::integer as rights_metadata_candidates,
 min(created_at) as first_asset,
 max(updated_at) as last_asset,
 sum(coalesce((metadata->>'size')::bigint,0)) as metadata_reported_bytes,
 count(*) filter(where name !~* '^human/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/[^/]+/[^/]+$')::integer as anomalous_paths
 from o group by path_series,path_episode,path_actor,path_upload
), results as (
 select left(md5(g.path_series::text||':'||g.path_episode::text||':'||
            g.path_actor::text||':'||g.path_upload),12) as cohort_alias,
 g.object_count,g.webm_count,g.m4a_count,g.json_count,
 g.metadata_reported_bytes,
 g.first_asset::date as first_asset_date,
 g.last_asset::date as last_asset_date,
 g.owner_metadata_count,g.rights_metadata_candidates,g.anomalous_paths,
 s.id is not null as live_series_found,
 ep.id is not null as live_episode_found,
 au.id is not null as authenticated_actor_found,
 usr.id is not null as public_actor_profile_found,
 (select count(*) from public.recordings rec
  where rec.audio_storage_path in
   (select obj.name from o obj where obj.path_series=g.path_series
    and obj.path_episode=g.path_episode and obj.path_actor=g.path_actor
    and obj.path_upload=g.path_upload)
   or rec.audio_storage_path like '%/recording-audio/'||g.path_upload||'/%'
 )::integer as current_exact_or_path_recording_refs,
 (select count(*) from public.series_recording_requests req
  where req.series_id=g.path_series and req.requester_user_id=g.path_actor)::integer as matching_recording_requests,
 (select count(*) from public.user_recording_consents cs
  where cs.user_id=g.path_actor)::integer as current_actor_consent_rows,
 (select coalesce(bool_and(cs.consented_at>g.first_asset),false)
  from public.user_recording_consents cs where cs.user_id=g.path_actor) as current_consent_all_postdate_assets,
 (select min(cs.consented_at)::date from public.user_recording_consents cs
  where cs.user_id=g.path_actor) as earliest_current_consent_date
 from groups g
 left join public.series s on s.id=g.path_series
 left join public.episodes ep on ep.id=g.path_episode
 left join auth.users au on au.id=g.path_actor
 left join public.users usr on usr.id=g.path_actor
)
select r.*,
 count(*) over() as cohort_count,
 sum(object_count) over() as total_objects_checked,
 count(*) filter(where live_series_found or live_episode_found
  or owner_metadata_count>0 or rights_metadata_candidates>0)
  over() as cohorts_with_new_possible_evidence,
 'RIGHTS_AND_CONSENT_UNPROVEN_NO_PUBLICATION_NO_DELETION'::text as decision
from results r order by cohort_alias;
rollback;
