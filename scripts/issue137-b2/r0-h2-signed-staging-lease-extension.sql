-- #137 H2 NONPRODUCTION DRAFT. NEVER apply to hosted DB before fixed-HEAD
-- independent Auth/RLS/Storage/rights review and exact separate approval.
-- Service-role-only lease RPCs, DB-trigger guard on HUMAN TEMP Storage writes.
-- No Cron, no automatic deletion, no public bucket/permission changes.
begin;
create schema if not exists libread_internal;
revoke all on schema libread_internal from public,anon,authenticated;
grant usage on schema libread_internal to service_role;
create table libread_internal.h2_human_stage_lease(
 session_id uuid primary key,
 series_id uuid not null,
 episode_id uuid not null,
 actor_id uuid not null,
 source_extension text not null check (source_extension ~ '^[a-z0-9]{2,8}$'),
 total_bytes bigint not null check(total_bytes >= 4194304 and total_bytes <= 1073741824),
 part_count integer not null check(part_count between 1 and 128),
 state text not null default 'active'
   check(state in ('active','sealed','aborted','retiring','retired')),
 created_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null default clock_timestamp()+interval '90 minutes',
 retire_after timestamptz not null default clock_timestamp()+interval '3 hours',
 closed_at timestamptz,
 check (retire_after > expires_at)
);
alter table libread_internal.h2_human_stage_lease enable row level security;
revoke all on libread_internal.h2_human_stage_lease from public,anon,authenticated;
grant select,insert,update on libread_internal.h2_human_stage_lease to service_role;

-- Source, episode and consent are read under row locks. A concurrent
-- unpublish/consent withdrawal therefore serializes with this Storage write.
create or replace function libread_internal.h2_source_is_staging_eligible(
 p_series uuid,p_episode uuid,p_actor uuid
) returns boolean language plpgsql volatile security definer set search_path=''
as $eligible$
declare s record; e record; c record;
begin
 select publication_status,content_rating,content_warnings,recording_permission_mode
 into s from public.series where id=p_series for share;
 select posting_status,is_published,series_id into e
 from public.episodes where id=p_episode for share;
 select consent_version into c from public.user_recording_consents
 where user_id=p_actor and consent_key='recording_studio_global' for share;
 return coalesce(s.publication_status='public'
   and s.content_rating='general'
   and not ('sexual_r18'=any(coalesce(s.content_warnings,'{}'::text[])))
   and s.recording_permission_mode='open'
   and e.series_id=p_series and e.posting_status='posted'
   and e.is_published is true
   and c.consent_version='2026-04-16',false);
end
$eligible$;
revoke all on function libread_internal.h2_source_is_staging_eligible(uuid,uuid,uuid)
 from public,anon,authenticated;
-- The open/close invoker RPCs run as service_role and require this narrowly
-- scoped helper; denying it would make every valid signed session unavailable.
grant execute on function libread_internal.h2_source_is_staging_eligible(uuid,uuid,uuid)
 to service_role;

create or replace function public.issue137_h2_stage_open(
 p_session uuid,p_series uuid,p_episode uuid,p_actor uuid,
 p_extension text,p_total_bytes bigint,p_part_count integer
) returns boolean language plpgsql volatile security invoker set search_path=''
as $open$
begin
 if p_session is null or p_actor is null or p_series is null or p_episode is null
    or p_extension !~ '^[a-z0-9]{2,8}$'
    or p_total_bytes < 4194304 or p_total_bytes > 1073741824
    or p_part_count is distinct from ceil(p_total_bytes::numeric/8388608)::integer
    or not libread_internal.h2_source_is_staging_eligible(p_series,p_episode,p_actor) then
  raise exception using errcode='42501',message='H2_STAGE_SOURCE_OR_CONSENT_DENIED';
 end if;
 insert into libread_internal.h2_human_stage_lease(
  session_id,series_id,episode_id,actor_id,source_extension,total_bytes,part_count
 ) values(p_session,p_series,p_episode,p_actor,p_extension,p_total_bytes,p_part_count);
 return true;
end
$open$;
revoke all on function public.issue137_h2_stage_open(uuid,uuid,uuid,uuid,text,bigint,integer)
 from public,anon,authenticated;
grant execute on function public.issue137_h2_stage_open(uuid,uuid,uuid,uuid,text,bigint,integer)
 to service_role;

create or replace function public.issue137_h2_stage_close(
 p_session uuid,p_series uuid,p_episode uuid,p_actor uuid,
 p_extension text,p_total_bytes bigint,p_mode text
) returns boolean language plpgsql volatile security invoker set search_path=''
as $close$
declare l record;
begin
 if p_mode not in ('seal','abort') then
  raise exception using errcode='42501',message='H2_STAGE_INVALID_CLOSE_MODE';
 end if;
 select * into l from libread_internal.h2_human_stage_lease
 where session_id=p_session for update;
 if not found or l.series_id is distinct from p_series
   or l.episode_id is distinct from p_episode
   or l.actor_id is distinct from p_actor
   or l.source_extension is distinct from p_extension
   or l.total_bytes is distinct from p_total_bytes
   or l.state<>'active' then
  raise exception using errcode='42501',message='H2_STAGE_NOT_OWNER_OR_ALREADY_CLOSED';
 end if;
 if p_mode='seal' and
   (l.expires_at<=clock_timestamp() or
    not libread_internal.h2_source_is_staging_eligible(p_series,p_episode,p_actor)) then
   raise exception using errcode='42501',message='H2_STAGE_REVOKED_OR_EXPIRED';
 end if;
 update libread_internal.h2_human_stage_lease
 set state=case when p_mode='seal' then 'sealed' else 'aborted' end,
     closed_at=clock_timestamp()
 where session_id=p_session;
 return true;
end
$close$;
revoke all on function public.issue137_h2_stage_close(uuid,uuid,uuid,uuid,text,bigint,text)
 from public,anon,authenticated;
grant execute on function public.issue137_h2_stage_close(uuid,uuid,uuid,uuid,text,bigint,text)
 to service_role;

-- This trigger, not RLS, is the revocation barrier for a pre-issued bearer
-- upload token. It also applies to service_role REST/S3 Storage metadata writes.
-- Synthetic names use this exact shape:
-- human-temp/<series>/<episode>/<actor>/<uuid-session>/part-0001.webm
create or replace function libread_internal.h2_guard_human_temp_storage()
returns trigger language plpgsql volatile security definer set search_path=''
as $guard$
declare l record; sid uuid; eid uuid; aid uuid; lease_id uuid;
 part_name text; part_num integer;
begin
 if TG_OP='UPDATE' and old.bucket_id='human-recording-audio'
   and old.name like 'human-temp/%'
   and (new.bucket_id is distinct from old.bucket_id or
        new.name is distinct from old.name) then
  raise exception using errcode='42501',message='H2_STAGE_PATH_IMMUTABLE';
 end if;
 if new.bucket_id<>'human-recording-audio'
    or new.name not like 'human-temp/%' then return new; end if;
 if new.name !~ '^human-temp/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/part-[0-9]{4}\.[a-z0-9]{2,8}$' then
  raise exception using errcode='42501',message='H2_STAGE_PATH_INVALID';
 end if;
 sid:=split_part(new.name,'/',2)::uuid;
 eid:=split_part(new.name,'/',3)::uuid;
 aid:=split_part(new.name,'/',4)::uuid;
 lease_id:=split_part(new.name,'/',5)::uuid;
 part_name:=split_part(new.name,'/',6);
 part_num:=substring(part_name from 6 for 4)::integer;
 select * into l from libread_internal.h2_human_stage_lease
 where session_id=lease_id for share;
 if not found or l.state<>'active'
   or l.expires_at<=clock_timestamp()
   or l.series_id is distinct from sid
   or l.episode_id is distinct from eid
   or l.actor_id is distinct from aid
   or part_num<1 or part_num>l.part_count
   or part_name is distinct from
      ('part-'||lpad(part_num::text,4,'0')||'.'||l.source_extension)
   or not libread_internal.h2_source_is_staging_eligible(sid,eid,aid) then
  raise exception using errcode='42501',message='H2_STAGE_LEASE_REVOKED';
 end if;
 return new;
end
$guard$;
revoke all on function libread_internal.h2_guard_human_temp_storage()
 from public,anon,authenticated;
drop trigger if exists issue137_h2_stage_storage_guard on storage.objects;
create trigger issue137_h2_stage_storage_guard
 before insert or update of bucket_id,name,metadata on storage.objects
 for each row execute function libread_internal.h2_guard_human_temp_storage();

-- Conservative retention inventory only; no Cron/physical removal.
-- 3h from lease issuance exceeds the SDK's 2h signed upload token lifetime,
-- including issuance latency. Beyond this threshold actual Storage inventory,
-- byte custody, concurrent tokens and rights still require careful cleanup.
create or replace function public.issue137_h2_stage_retire_candidates(p_limit integer default 20)
returns table(session_id uuid,series_id uuid,episode_id uuid,actor_id uuid,
 source_extension text,part_count integer,retire_after timestamptz)
language sql stable security invoker set search_path=''
as $candidates$
 select l.session_id,l.series_id,l.episode_id,l.actor_id,l.source_extension,
 l.part_count,l.retire_after from libread_internal.h2_human_stage_lease l
 where l.retire_after<clock_timestamp()
   and (l.state in ('sealed','aborted','retiring') or
     (l.state='active' and l.expires_at<clock_timestamp()))
 order by l.retire_after,l.session_id limit least(greatest(coalesce(p_limit,20),1),100)
$candidates$;
revoke all on function public.issue137_h2_stage_retire_candidates(integer)
 from public,anon,authenticated;
grant execute on function public.issue137_h2_stage_retire_candidates(integer)
 to service_role;

-- A separate authorized cleanup worker may claim a stale session only once
-- it outlives all bearer tokens. Merely marking 'retiring' blocks future
-- metadata uploads by the H2 Storage guard. No rows or bytes are deleted here.
create or replace function public.issue137_h2_stage_claim_retirement(p_session uuid)
returns boolean language plpgsql volatile security invoker set search_path=''
as $claim$
declare l record; temp_path text;
begin
 select * into l from libread_internal.h2_human_stage_lease
 where session_id=p_session for update;
 if not found or l.retire_after>=clock_timestamp() or
   not (l.state in ('sealed','aborted','retiring') or
     (l.state='active' and l.expires_at<clock_timestamp())) then
  raise exception using errcode='42501',message='H2_STAGE_RETIRE_TOO_EARLY_OR_NOT_OWNED';
 end if;
 temp_path:='human-temp/'||l.series_id||'/'||l.episode_id||'/'||
   l.actor_id||'/'||l.session_id||'/';
 if exists(select 1 from public.recordings r
   where r.audio_storage_path like temp_path||'%') then
  raise exception using errcode='42501',message='H2_STAGE_RECORDING_REFERENCE_HOLD';
 end if;
 update libread_internal.h2_human_stage_lease set state='retiring'
 where session_id=p_session;
 return true;
end $claim$;
revoke all on function public.issue137_h2_stage_claim_retirement(uuid)
 from public,anon,authenticated;
grant execute on function public.issue137_h2_stage_claim_retirement(uuid)
 to service_role;

-- The caller must have verified the exact Storage API deletion. This function
-- rechecks the actual public Storage catalog for ANY leftover object or DB ref;
-- it never fabricates or claims a physical deletion was performed.
create or replace function public.issue137_h2_stage_finish_retirement(p_session uuid)
returns boolean language plpgsql volatile security invoker set search_path=''
as $finish$
declare l record; temp_path text;
begin
 select * into l from libread_internal.h2_human_stage_lease
 where session_id=p_session for update;
 if not found or l.state<>'retiring' or l.retire_after>=clock_timestamp() then
  raise exception using errcode='42501',message='H2_STAGE_NOT_RETIRING';
 end if;
 temp_path:='human-temp/'||l.series_id||'/'||l.episode_id||'/'||
   l.actor_id||'/'||l.session_id||'/';
 if exists(select 1 from storage.objects o where
   o.bucket_id='human-recording-audio' and o.name like temp_path||'%')
   or exists(select 1 from public.recordings r where
    r.audio_storage_path like temp_path||'%') then
  raise exception using errcode='42501',message='H2_STAGE_PHYSICAL_OR_REFERENCE_REMAINS';
 end if;
 update libread_internal.h2_human_stage_lease set state='retired'
 where session_id=p_session;
 return true;
end $finish$;
revoke all on function public.issue137_h2_stage_finish_retirement(uuid)
 from public,anon,authenticated;
grant execute on function public.issue137_h2_stage_finish_retirement(uuid)
 to service_role;
commit;
