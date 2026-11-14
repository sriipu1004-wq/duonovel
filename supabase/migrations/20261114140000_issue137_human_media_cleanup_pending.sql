-- Issue #137 S2-1: durable record of Human media removals that failed after a
-- committed H1 delete/replace, so they can be retried instead of the
-- narrator's audio silently staying in the PRIVATE bucket.
--
-- Requires the libread_internal schema (H1, applied). No B2 dependency and no
-- schema-grant changes: anon/authenticated get nothing; service_role only.
-- Stores only UUIDs, object paths under human/<series>/<episode>/<owner>/,
-- a reason code and timestamps (no audio, no names, no SQL error text).
begin;

do $require_h1$
begin
  if to_regnamespace('libread_internal') is null then
    raise exception 'S21_REQUIRES_H1_LIBREAD_INTERNAL' using errcode = '42501';
  end if;
end $require_h1$;

create table libread_internal.human_media_cleanup_pending (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  series_id uuid not null,
  episode_id uuid not null,
  object_paths text[] not null
    check (cardinality(object_paths) between 1 and 64),
  reason text not null check (reason in ('delete','replace')),
  created_at timestamptz not null default clock_timestamp(),
  attempts integer not null default 0 check (attempts >= 0),
  last_attempt_at timestamptz,
  resolved_at timestamptz
);
create index human_media_cleanup_pending_open_idx
  on libread_internal.human_media_cleanup_pending (owner_id, created_at)
  where resolved_at is null;
alter table libread_internal.human_media_cleanup_pending enable row level security;
revoke all on libread_internal.human_media_cleanup_pending from public, anon, authenticated;
grant select, insert, update on libread_internal.human_media_cleanup_pending to service_role;

-- Record a failed removal. Every path must sit under exactly this owner's
-- human/<series>/<episode>/<owner>/ prefix, without traversal.
create or replace function public.issue137_human_media_cleanup_record(
  p_owner_id uuid, p_series_id uuid, p_episode_id uuid,
  p_object_paths text[], p_reason text
) returns uuid language plpgsql volatile security invoker set search_path = ''
as $record$
declare
  v_prefix text;
  v_path text;
  v_id uuid;
begin
  if p_owner_id is null or p_series_id is null or p_episode_id is null
     or p_object_paths is null or cardinality(p_object_paths) not between 1 and 64
     or p_reason is null or p_reason not in ('delete','replace') then
    raise exception using errcode = '42501', message = 'S21_BAD_INPUT';
  end if;
  v_prefix := 'human/' || p_series_id::text || '/' || p_episode_id::text || '/'
    || p_owner_id::text || '/';
  foreach v_path in array p_object_paths loop
    if v_path is null or left(v_path, length(v_prefix)) is distinct from v_prefix
       or v_path like '%..%' or v_path like '%//%'
       or v_path !~ '^human/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/[a-z0-9-]+/[a-z0-9.-]+$' then
      raise exception using errcode = '42501', message = 'S21_PATH_OUTSIDE_OWNER_PREFIX';
    end if;
  end loop;
  insert into libread_internal.human_media_cleanup_pending
    (owner_id, series_id, episode_id, object_paths, reason)
  values (p_owner_id, p_series_id, p_episode_id, p_object_paths, p_reason)
  returning id into v_id;
  return v_id;
end
$record$;
revoke all on function public.issue137_human_media_cleanup_record(uuid,uuid,uuid,text[],text)
  from public, anon, authenticated;
grant execute on function public.issue137_human_media_cleanup_record(uuid,uuid,uuid,text[],text)
  to service_role;

-- Unresolved records, oldest first; one owner, or all for an operator sweep.
create or replace function public.issue137_human_media_cleanup_pending(
  p_owner_id uuid default null, p_limit integer default 20
) returns table(id uuid, owner_id uuid, series_id uuid, episode_id uuid,
  object_paths text[], reason text, created_at timestamptz, attempts integer)
language sql stable security invoker set search_path = ''
as $pending$
  select p.id, p.owner_id, p.series_id, p.episode_id, p.object_paths, p.reason,
         p.created_at, p.attempts
    from libread_internal.human_media_cleanup_pending p
    where p.resolved_at is null
      and (p_owner_id is null or p.owner_id = p_owner_id)
    order by p.created_at, p.id
    limit least(greatest(coalesce(p_limit, 20), 1), 100)
$pending$;
revoke all on function public.issue137_human_media_cleanup_pending(uuid,integer)
  from public, anon, authenticated;
grant execute on function public.issue137_human_media_cleanup_pending(uuid,integer)
  to service_role;

-- Receipt after a retry. Marks resolved ONLY when the caller reports success
-- AND none of the listed objects remains in human-recording-audio AND no
-- recordings row references them. Otherwise counts the attempt.
create or replace function public.issue137_human_media_cleanup_resolve(
  p_id uuid, p_succeeded boolean
) returns boolean language plpgsql volatile security invoker set search_path = ''
as $resolve$
declare
  r record;
begin
  select * into r from libread_internal.human_media_cleanup_pending
    where id = p_id for update;
  if not found or r.resolved_at is not null then
    raise exception using errcode = '42501', message = 'S21_NOT_PENDING';
  end if;
  if p_succeeded is true
     and not exists (select 1 from storage.objects o
                     where o.bucket_id = 'human-recording-audio'
                       and o.name = any(r.object_paths))
     and not exists (select 1 from public.recordings x
                     where x.audio_storage_path = any(r.object_paths)) then
    update libread_internal.human_media_cleanup_pending
      set resolved_at = clock_timestamp(), attempts = attempts + 1,
          last_attempt_at = clock_timestamp()
      where id = p_id;
    return true;
  end if;
  update libread_internal.human_media_cleanup_pending
    set attempts = attempts + 1, last_attempt_at = clock_timestamp()
    where id = p_id;
  return false;
end
$resolve$;
revoke all on function public.issue137_human_media_cleanup_resolve(uuid,boolean)
  from public, anon, authenticated;
grant execute on function public.issue137_human_media_cleanup_resolve(uuid,boolean)
  to service_role;

select pg_catalog.pg_notify('pgrst', 'reload schema');
commit;
