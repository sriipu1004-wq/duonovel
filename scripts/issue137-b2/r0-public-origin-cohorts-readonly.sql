-- Issue #137: PUBLIC Storage metadata cohorts only. No media bytes or IDs output.
-- NOT an object-specific authorization or deletion manifest.
begin read only;
with refs as (
 select distinct case when audio_storage_path ~ '^https?://[^/]+/storage/v1/object/public/recording-audio/'
 then regexp_replace(audio_storage_path,'^https?://[^/]+/storage/v1/object/public/recording-audio/','')
 else audio_storage_path end as name from public.recordings
), objects as (
 select o.name, o.owner, o.owner_id, o.user_metadata, o.metadata, o.created_at,
 split_part(o.name,'/',2) as series_segment,
 split_part(o.name,'/',3) as episode_segment,
 case when o.name like 'aivis/%' then 'aivis'
 when o.name like 'nemo/%' then 'nemo'
 when o.name like 'human/%' then 'human'
 else 'other' end as family
 from storage.objects o where o.bucket_id='recording-audio'
), classified as (
 select o.*, r.name is not null as exactly_referenced,
 o.name ~* '[.]json$' as json_named,
 exists(select 1 from public.series s where s.id::text=o.series_segment) as has_live_series,
 exists(select 1 from public.episodes e where e.id::text=o.episode_segment) as has_live_episode
 from objects o left join refs r on r.name=o.name
)
select family,count(*) as objects,
 count(*) filter(where exactly_referenced) as exact_recording_refs,
 count(*) filter(where not exactly_referenced) as no_exact_reference,
 count(*) filter(where json_named) as json_named,
 count(*) filter(where not has_live_series) as no_current_series,
 count(*) filter(where not has_live_episode) as no_current_episode,
 count(distinct series_segment) filter(where not has_live_series) as missing_series_segments,
 count(distinct (series_segment,episode_segment)) filter(where not has_live_series)
  as missing_series_episode_segments,
 count(*) filter(where not has_live_series and
  (owner is not null or owner_id is not null)) as detached_with_storage_owner_metadata,
 count(*) filter(where not has_live_series and user_metadata is not null
  and user_metadata <> '{}'::jsonb) as detached_with_custom_metadata,
 sum(coalesce((metadata->>'size')::bigint,0)) filter(where not has_live_series)
  as detached_storage_reported_bytes,
 min(created_at) filter(where not has_live_series) as first_detached_created_at,
 max(created_at) filter(where not has_live_series) as last_detached_created_at,
 'RIGHTS_UNKNOWN_METADATA_ONLY_HOLD'::text as decision
from classified group by family order by family;
rollback;
