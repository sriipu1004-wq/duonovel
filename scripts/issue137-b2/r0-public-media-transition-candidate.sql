-- Issue #137: isolated candidate. NOT A DEPLOYABLE MIGRATION.
-- Do not apply to hosted Supabase without frozen-head independent security/rights
-- review, complete legacy-media containment plan and separate owner approval.
-- Existing PUBLIC URLs and cached copies are NOT revoked by this SQL.
-- Model: fail-closed source transitions, new PUBLIC object and DB references.
begin;
create schema if not exists libread_internal;
revoke all on schema libread_internal from public, anon, authenticated;

create or replace function libread_internal.issue137_r0_has_public_audio(
  p_series uuid, p_episode uuid default null
) returns boolean language sql stable security definer set search_path = ''
as $fn$
 select exists (
   select 1 from storage.objects o
   where o.bucket_id = 'recording-audio'
   and (
     (p_episode is null and (
       o.name like 'nemo/' || p_series::text || '/%' or
       o.name like 'aivis/' || p_series::text || '/%' or
       o.name like 'human/' || p_series::text || '/%'))
     or
     (p_episode is not null and (
       o.name like 'nemo/' || p_series::text || '/' || p_episode::text || '/%' or
       o.name like 'aivis/' || p_series::text || '/' || p_episode::text || '/%' or
       o.name like 'human/' || p_series::text || '/' || p_episode::text || '/%'))
   )
 ) or exists (
   select 1 from public.recordings r
   where r.series_id = p_series
     and (p_episode is null or r.episode_id = p_episode)
     and r.audio_storage_path like '%/storage/v1/object/public/recording-audio/%'
 );
$fn$;
revoke all on function libread_internal.issue137_r0_has_public_audio(uuid,uuid)
 from public,anon,authenticated;

create or replace function libread_internal.issue137_r0_guard_series_transition()
returns trigger language plpgsql security definer set search_path = ''
as $fn$
begin
 if (
   new.publication_status is distinct from old.publication_status or
   new.content_rating is distinct from old.content_rating or
   new.content_warnings is distinct from old.content_warnings
 ) and (
   new.publication_status is distinct from 'public' or
   new.content_rating is distinct from 'general' or
   'sexual_r18' = any(coalesce(new.content_warnings,'{}'::text[]))
 ) and libread_internal.issue137_r0_has_public_audio(new.id, null)
 then
   raise exception using errcode='23514',
     message='ISSUE137_PUBLIC_MEDIA_CONTAINMENT_REQUIRED';
 end if;
 return new;
end;
$fn$;
revoke all on function libread_internal.issue137_r0_guard_series_transition()
 from public,anon,authenticated;
create trigger issue137_r0_series_public_media_hold
before update of publication_status,content_rating,content_warnings
on public.series for each row
execute function libread_internal.issue137_r0_guard_series_transition();

create or replace function libread_internal.issue137_r0_guard_episode_transition()
returns trigger language plpgsql security definer set search_path = ''
as $fn$
begin
 if (
   new.posting_status is distinct from old.posting_status or
   new.is_published is distinct from old.is_published or
   new.series_id is distinct from old.series_id
 ) and (
   new.posting_status is distinct from 'posted' or
   new.is_published is distinct from true or
   new.series_id is distinct from old.series_id
 ) and libread_internal.issue137_r0_has_public_audio(old.series_id, old.id)
 then
   raise exception using errcode='23514',
     message='ISSUE137_PUBLIC_MEDIA_CONTAINMENT_REQUIRED';
 end if;
 return new;
end;
$fn$;
revoke all on function libread_internal.issue137_r0_guard_episode_transition()
 from public,anon,authenticated;
create trigger issue137_r0_episode_public_media_hold
before update of series_id,posting_status,is_published
on public.episodes for each row
execute function libread_internal.issue137_r0_guard_episode_transition();

-- A new PUBLIC object must lock both authority rows before it is committed,
-- so racing rating/unpublish changes serialize with this Storage metadata write.
-- A direct PUBLIC URL bypasses app/RLS authorization; no path is automatically safe.
create or replace function libread_internal.issue137_r0_guard_public_object()
returns trigger language plpgsql security definer set search_path = ''
as $fn$
declare
  parts text[];
  sid uuid;
  eid uuid;
  s record;
  e record;
begin
 if new.bucket_id is distinct from 'recording-audio' then return new; end if;
 parts := string_to_array(new.name,'/');
 if array_length(parts,1) < 4 or
    parts[1] not in ('nemo','aivis','human') or
    parts[2] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or
    parts[3] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 then
   raise exception using errcode='23514',
     message='ISSUE137_UNCLASSIFIED_PUBLIC_MEDIA_PATH';
 end if;
 sid := parts[2]::uuid;
 eid := parts[3]::uuid;
 select id,publication_status,content_rating,content_warnings
 into s from public.series where id=sid for share;
 if not found then
   raise exception using errcode='23514',
     message='ISSUE137_PUBLIC_MEDIA_SOURCE_NOT_VISIBLE';
 end if;
 select id,series_id,posting_status,is_published
 into e from public.episodes where id=eid for share;
 if not found or e.series_id is distinct from sid or
    s.publication_status is distinct from 'public' or
    s.content_rating is distinct from 'general' or
    'sexual_r18'=any(coalesce(s.content_warnings,'{}'::text[])) or
    e.posting_status is distinct from 'posted' or
    e.is_published is distinct from true
 then
   raise exception using errcode='23514',
     message='ISSUE137_PUBLIC_MEDIA_SOURCE_NOT_VISIBLE';
 end if;
 return new;
end;
$fn$;
revoke all on function libread_internal.issue137_r0_guard_public_object()
 from public,anon,authenticated;
create trigger issue137_r0_public_audio_object_hold
before insert or update of bucket_id,name,metadata on storage.objects
for each row execute function libread_internal.issue137_r0_guard_public_object();

-- A RECORDING reference must not newly point at an exposed PUBLIC URL when
-- its parent has become restricted (even if a legacy public object exists).
create or replace function libread_internal.issue137_r0_guard_recording_reference()
returns trigger language plpgsql security definer set search_path = ''
as $fn$
declare s record; e record;
begin
 if new.audio_storage_path is null or
    new.audio_storage_path not like '%/storage/v1/object/public/recording-audio/%'
 then return new; end if;
 select id,publication_status,content_rating,content_warnings
 into s from public.series where id=new.series_id for share;
 if not found then
   raise exception using errcode='23514',message='ISSUE137_PUBLIC_MEDIA_SOURCE_NOT_VISIBLE';
 end if;
 select id,series_id,posting_status,is_published
 into e from public.episodes where id=new.episode_id for share;
 if not found or
    new.is_public is distinct from true or
    e.series_id is distinct from new.series_id or
    s.publication_status is distinct from 'public' or
    s.content_rating is distinct from 'general' or
    'sexual_r18'=any(coalesce(s.content_warnings,'{}'::text[])) or
    e.posting_status is distinct from 'posted' or
    e.is_published is distinct from true
 then
   raise exception using errcode='23514',message='ISSUE137_PUBLIC_MEDIA_SOURCE_NOT_VISIBLE';
 end if;
 return new;
end;
$fn$;
revoke all on function libread_internal.issue137_r0_guard_recording_reference()
 from public,anon,authenticated;
create trigger issue137_r0_recording_reference_hold
before insert or update of series_id,episode_id,is_public,audio_storage_path
on public.recordings for each row
execute function libread_internal.issue137_r0_guard_recording_reference();
commit;
