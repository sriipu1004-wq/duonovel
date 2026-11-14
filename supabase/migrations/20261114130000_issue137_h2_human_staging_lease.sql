-- Issue #137 H2: Human multipart temporary staging under a server-side lease.
--
-- A multipart upload session gets signed upload tokens (bearer, ~2h) for
-- human-recording-audio/human-temp/<series>/<episode>/<actor>/<session>/
-- part-NNNN.<ext>. A token cannot be revoked by an app-side check, so the
-- storage.objects guard trigger below is the revocation barrier: a part can be
-- written only while its lease is ACTIVE, unexpired, owned by that path's
-- actor, inside the declared part count, and the source/consent is still
-- eligible. Sealing (finalize) or aborting closes the lease; later writes fail.
--
-- Requires: libread_internal schema from H1 (20261114120000, applied). Does NOT
-- depend on the unapplied B2 candidate and does not change schema grants:
-- anon/authenticated still have no USAGE on libread_internal and no EXECUTE
-- on any function here. Only service_role gets the RPCs.
-- Requires: the migration role can create a trigger on storage.objects. If it
-- cannot, this whole migration fails and nothing is applied.
--
-- Cleanup policy: no Cron here. Leases record retire_after (3 h after issue,
-- longer than the 2 h signed-token lifetime). The app removes the exact part
-- paths itself after seal/abort (writes are already blocked), and retires
-- matured leases of the same actor best-effort when that actor opens a new
-- session (candidates -> claim -> Storage API remove -> finish receipt).
begin;

do $require_h1$
begin
  if to_regnamespace('libread_internal') is null then
    raise exception 'H2_REQUIRES_H1_LIBREAD_INTERNAL' using errcode = '42501';
  end if;
end $require_h1$;

create table libread_internal.h2_human_stage_lease (
  session_id uuid primary key,
  series_id uuid not null,
  episode_id uuid not null,
  actor_id uuid not null,
  source_extension text not null check (source_extension ~ '^[a-z0-9]{2,8}$'),
  total_bytes bigint not null check (total_bytes >= 4194304 and total_bytes <= 1073741824),
  part_count integer not null check (part_count between 1 and 128),
  state text not null default 'active'
    check (state in ('active','sealed','aborted','retiring','retired')),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default clock_timestamp() + interval '90 minutes',
  retire_after timestamptz not null default clock_timestamp() + interval '3 hours',
  closed_at timestamptz,
  check (retire_after > expires_at)
);
create index h2_human_stage_lease_actor_retire_idx
  on libread_internal.h2_human_stage_lease (actor_id, retire_after);
alter table libread_internal.h2_human_stage_lease enable row level security;
revoke all on libread_internal.h2_human_stage_lease from public, anon, authenticated;
grant select, insert, update on libread_internal.h2_human_stage_lease to service_role;

-- Same source/consent/R18 rules as the H1 commit RPC, so a multipart upload
-- is allowed exactly where the final Human commit would be allowed:
-- recording permission 'open'; public+posted source, or the series author;
-- consent 2026-04-16; R18 only for the author or a confirmed R18 viewer.
-- Rows are read FOR SHARE so a concurrent revocation serializes with a write.
-- SECURITY DEFINER because the storage trigger calls it under Storage's role.
create or replace function libread_internal.h2_source_is_staging_eligible(
  p_series uuid, p_episode uuid, p_actor uuid
) returns boolean language plpgsql volatile security definer set search_path = ''
as $eligible$
declare
  s record;
  e record;
  v_consent text;
  v_r18 uuid;
begin
  if p_series is null or p_episode is null or p_actor is null then
    return false;
  end if;
  select id, author_id, publication_status, recording_permission_mode,
         content_rating, content_warnings into s
    from public.series where id = p_series for share;
  select id, series_id, posting_status, is_published into e
    from public.episodes where id = p_episode for share;
  if s.id is null or e.id is null or e.series_id is distinct from p_series
     or s.recording_permission_mode is distinct from 'open' then
    return false;
  end if;
  if (s.publication_status is distinct from 'public'
      or e.posting_status is distinct from 'posted'
      or e.is_published is distinct from true)
     and s.author_id is distinct from p_actor then
    return false;
  end if;
  select c.consent_version into v_consent
    from public.user_recording_consents c
    where c.user_id = p_actor and c.consent_key = 'recording_studio_global'
    for share;
  if v_consent is distinct from '2026-04-16' then
    return false;
  end if;
  if (s.content_rating = 'r18'
      or 'sexual_r18' = any(coalesce(s.content_warnings, '{}'::text[])))
     and s.author_id is distinct from p_actor then
    select u.id into v_r18 from public.users u
      where u.id = p_actor and u.show_r18_content is true
        and u.r18_confirmed_at is not null
      for share;
    if v_r18 is null then
      return false;
    end if;
  end if;
  return true;
end
$eligible$;
revoke all on function libread_internal.h2_source_is_staging_eligible(uuid,uuid,uuid)
  from public, anon, authenticated;
grant execute on function libread_internal.h2_source_is_staging_eligible(uuid,uuid,uuid)
  to service_role;

-- Open a lease BEFORE any signed upload token is minted. A reused session ID,
-- bad shape or ineligible source/consent fails; nothing is written then.
create or replace function public.issue137_h2_stage_open(
  p_session uuid, p_series uuid, p_episode uuid, p_actor uuid,
  p_extension text, p_total_bytes bigint, p_part_count integer
) returns boolean language plpgsql volatile security invoker set search_path = ''
as $open$
begin
  if p_session is null or p_actor is null or p_series is null or p_episode is null
     or p_extension is null or p_extension !~ '^[a-z0-9]{2,8}$'
     or p_total_bytes is null or p_total_bytes < 4194304 or p_total_bytes > 1073741824
     or p_part_count is distinct from ceil(p_total_bytes::numeric / 8388608)::integer then
    raise exception using errcode = '42501', message = 'H2_STAGE_BAD_INPUT';
  end if;
  if exists (select 1 from libread_internal.h2_human_stage_lease l
             where l.session_id = p_session) then
    raise exception using errcode = '42501', message = 'H2_STAGE_SESSION_REUSED';
  end if;
  if not libread_internal.h2_source_is_staging_eligible(p_series, p_episode, p_actor) then
    raise exception using errcode = '42501', message = 'H2_STAGE_SOURCE_OR_CONSENT_DENIED';
  end if;
  insert into libread_internal.h2_human_stage_lease(
    session_id, series_id, episode_id, actor_id, source_extension, total_bytes, part_count
  ) values (p_session, p_series, p_episode, p_actor, p_extension, p_total_bytes, p_part_count);
  return true;
end
$open$;
revoke all on function public.issue137_h2_stage_open(uuid,uuid,uuid,uuid,text,bigint,integer)
  from public, anon, authenticated;
grant execute on function public.issue137_h2_stage_open(uuid,uuid,uuid,uuid,text,bigint,integer)
  to service_role;

-- Seal (finalize) or abort exactly one ACTIVE lease of this actor/scope.
-- Seal additionally requires the lease to be unexpired and the source/consent
-- to still be eligible. Abort works even after expiry or revocation.
create or replace function public.issue137_h2_stage_close(
  p_session uuid, p_series uuid, p_episode uuid, p_actor uuid,
  p_extension text, p_total_bytes bigint, p_mode text
) returns boolean language plpgsql volatile security invoker set search_path = ''
as $close$
declare
  l record;
begin
  if p_mode is null or p_mode not in ('seal','abort') then
    raise exception using errcode = '42501', message = 'H2_STAGE_INVALID_CLOSE_MODE';
  end if;
  select * into l from libread_internal.h2_human_stage_lease
    where session_id = p_session for update;
  -- Not found and foreign owner share one message: no existence oracle.
  if not found or l.series_id is distinct from p_series
     or l.episode_id is distinct from p_episode
     or l.actor_id is distinct from p_actor
     or l.source_extension is distinct from p_extension
     or l.total_bytes is distinct from p_total_bytes then
    raise exception using errcode = '42501', message = 'H2_STAGE_NOT_FOUND_OR_NOT_OWNER';
  end if;
  if l.state <> 'active' then
    raise exception using errcode = '42501', message = 'H2_STAGE_ALREADY_CLOSED';
  end if;
  if p_mode = 'seal' then
    if l.expires_at <= clock_timestamp() then
      raise exception using errcode = '42501', message = 'H2_STAGE_EXPIRED';
    end if;
    if not libread_internal.h2_source_is_staging_eligible(p_series, p_episode, p_actor) then
      raise exception using errcode = '42501', message = 'H2_STAGE_REVOKED';
    end if;
  end if;
  update libread_internal.h2_human_stage_lease
    set state = case when p_mode = 'seal' then 'sealed' else 'aborted' end,
        closed_at = clock_timestamp()
    where session_id = p_session;
  return true;
end
$close$;
revoke all on function public.issue137_h2_stage_close(uuid,uuid,uuid,uuid,text,bigint,text)
  from public, anon, authenticated;
grant execute on function public.issue137_h2_stage_close(uuid,uuid,uuid,uuid,text,bigint,text)
  to service_role;

-- Storage guard: the only barrier that also stops an already-issued bearer
-- token. Applies to every role that writes storage.objects (Storage API,
-- service_role, S3/TUS metadata writes).
create or replace function libread_internal.h2_guard_human_temp_storage()
returns trigger language plpgsql volatile security definer set search_path = ''
as $guard$
declare
  l record;
  sid uuid;
  eid uuid;
  aid uuid;
  lease_id uuid;
  part_name text;
  part_num integer;
begin
  if TG_OP = 'UPDATE' and old.bucket_id = 'human-recording-audio'
     and old.name like 'human-temp/%'
     and (new.bucket_id is distinct from old.bucket_id
          or new.name is distinct from old.name) then
    raise exception using errcode = '42501', message = 'H2_STAGE_PATH_IMMUTABLE';
  end if;
  -- The former multipart shape directly under human/ is closed for new writes
  -- (old bearer tokens). Final media names (original.*, playback-from-*.m4a,
  -- timing JSON) do not match this shape. Nothing is deleted here.
  if new.bucket_id = 'human-recording-audio' and new.name ~
     '^human/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/part-[0-9]{4}\.[a-z0-9]{2,8}$' then
    raise exception using errcode = '42501', message = 'H2_LEGACY_MULTIPART_NEW_WRITE_HOLD';
  end if;
  if new.bucket_id is distinct from 'human-recording-audio'
     or new.name is null or new.name not like 'human-temp/%' then
    return new;
  end if;
  if new.name !~
     '^human-temp/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/part-[0-9]{4}\.[a-z0-9]{2,8}$' then
    raise exception using errcode = '42501', message = 'H2_STAGE_PATH_INVALID';
  end if;
  begin
    sid := split_part(new.name, '/', 2)::uuid;
    eid := split_part(new.name, '/', 3)::uuid;
    aid := split_part(new.name, '/', 4)::uuid;
    lease_id := split_part(new.name, '/', 5)::uuid;
  exception when invalid_text_representation then
    raise exception using errcode = '42501', message = 'H2_STAGE_PATH_INVALID';
  end;
  part_name := split_part(new.name, '/', 6);
  part_num := substring(part_name from 6 for 4)::integer;
  select * into l from libread_internal.h2_human_stage_lease
    where session_id = lease_id for share;
  if not found or l.state <> 'active'
     or l.expires_at <= clock_timestamp()
     or l.series_id is distinct from sid
     or l.episode_id is distinct from eid
     or l.actor_id is distinct from aid
     or part_num < 1 or part_num > l.part_count
     or part_name is distinct from
        ('part-' || lpad(part_num::text, 4, '0') || '.' || l.source_extension)
     or not libread_internal.h2_source_is_staging_eligible(sid, eid, aid) then
    raise exception using errcode = '42501', message = 'H2_STAGE_LEASE_REVOKED';
  end if;
  return new;
end
$guard$;
revoke all on function libread_internal.h2_guard_human_temp_storage()
  from public, anon, authenticated;
drop trigger if exists issue137_h2_stage_storage_guard on storage.objects;
create trigger issue137_h2_stage_storage_guard
  before insert or update of bucket_id, name, metadata on storage.objects
  for each row execute function libread_internal.h2_guard_human_temp_storage();

-- Retirement (no Cron). Matured = retire_after passed and the lease is closed,
-- already retiring, or an expired never-closed ACTIVE lease.
create or replace function public.issue137_h2_stage_retire_candidates(
  p_actor uuid default null, p_limit integer default 20
) returns table(session_id uuid, series_id uuid, episode_id uuid, actor_id uuid,
  source_extension text, part_count integer, retire_after timestamptz)
language sql stable security invoker set search_path = ''
as $candidates$
  select l.session_id, l.series_id, l.episode_id, l.actor_id, l.source_extension,
         l.part_count, l.retire_after
    from libread_internal.h2_human_stage_lease l
    where l.retire_after < clock_timestamp()
      and (p_actor is null or l.actor_id = p_actor)
      and (l.state in ('sealed','aborted','retiring')
        or (l.state = 'active' and l.expires_at < clock_timestamp()))
    order by l.retire_after, l.session_id
    limit least(greatest(coalesce(p_limit, 20), 1), 100)
$candidates$;
revoke all on function public.issue137_h2_stage_retire_candidates(uuid,integer)
  from public, anon, authenticated;
grant execute on function public.issue137_h2_stage_retire_candidates(uuid,integer)
  to service_role;

create or replace function public.issue137_h2_stage_claim_retirement(p_session uuid)
returns boolean language plpgsql volatile security invoker set search_path = ''
as $claim$
declare
  l record;
  temp_path text;
begin
  select * into l from libread_internal.h2_human_stage_lease
    where session_id = p_session for update;
  if not found or l.retire_after >= clock_timestamp()
     or not (l.state in ('sealed','aborted','retiring')
       or (l.state = 'active' and l.expires_at < clock_timestamp())) then
    raise exception using errcode = '42501', message = 'H2_STAGE_RETIRE_TOO_EARLY_OR_NOT_ELIGIBLE';
  end if;
  temp_path := 'human-temp/' || l.series_id || '/' || l.episode_id || '/'
    || l.actor_id || '/' || l.session_id || '/';
  if exists (select 1 from public.recordings r
             where r.audio_storage_path like temp_path || '%') then
    raise exception using errcode = '42501', message = 'H2_STAGE_RECORDING_REFERENCE_HOLD';
  end if;
  update libread_internal.h2_human_stage_lease set state = 'retiring'
    where session_id = p_session;
  return true;
end
$claim$;
revoke all on function public.issue137_h2_stage_claim_retirement(uuid)
  from public, anon, authenticated;
grant execute on function public.issue137_h2_stage_claim_retirement(uuid)
  to service_role;

-- Receipt only after the caller removed the exact paths through the Storage
-- API. Refuses while any object under the prefix or any DB reference remains.
create or replace function public.issue137_h2_stage_finish_retirement(p_session uuid)
returns boolean language plpgsql volatile security invoker set search_path = ''
as $finish$
declare
  l record;
  temp_path text;
begin
  select * into l from libread_internal.h2_human_stage_lease
    where session_id = p_session for update;
  if not found or l.state <> 'retiring' or l.retire_after >= clock_timestamp() then
    raise exception using errcode = '42501', message = 'H2_STAGE_NOT_RETIRING';
  end if;
  temp_path := 'human-temp/' || l.series_id || '/' || l.episode_id || '/'
    || l.actor_id || '/' || l.session_id || '/';
  if exists (select 1 from storage.objects o
             where o.bucket_id = 'human-recording-audio' and o.name like temp_path || '%')
     or exists (select 1 from public.recordings r
                where r.audio_storage_path like temp_path || '%') then
    raise exception using errcode = '42501', message = 'H2_STAGE_PHYSICAL_OR_REFERENCE_REMAINS';
  end if;
  update libread_internal.h2_human_stage_lease set state = 'retired'
    where session_id = p_session;
  return true;
end
$finish$;
revoke all on function public.issue137_h2_stage_finish_retirement(uuid)
  from public, anon, authenticated;
grant execute on function public.issue137_h2_stage_finish_retirement(uuid)
  to service_role;

select pg_catalog.pg_notify('pgrst', 'reload schema');
commit;
