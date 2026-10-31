-- Issue #137 H1 DRAFT / UNAPPLIED candidate. Never execute against hosted Supabase
-- without independent security review, data inventory and separate user approval.
-- Required after 20261026120000_issue137_b2_r18_boundary.sql.
begin;
create schema if not exists libread_internal;
-- The existing B2 candidate grants anon/authenticated scoped usage only.
grant usage on schema libread_internal to service_role;
create table if not exists libread_internal.h1_human_scope_revision (
  series_id uuid not null,
  episode_id uuid not null,
  owner_id uuid not null,
  revision bigint not null default 0 check (revision >= 0),
  primary key (series_id, episode_id, owner_id)
);
alter table libread_internal.h1_human_scope_revision enable row level security;
revoke all on libread_internal.h1_human_scope_revision from public, anon, authenticated;
grant select, insert, update on libread_internal.h1_human_scope_revision to service_role;

-- SQL equivalent of the current known-Human provenance predicate. Unknown
-- legacy/AI rows are not silently reclassified as Human. Separate rights
-- inventory/release gate must address those unknown rows.
create or replace function libread_internal.h1_known_human(
  p_voice_model_id text, p_reader_name text, p_reader_id uuid,
  p_reader_user_id uuid, p_audio_storage_path text
) returns boolean language sql immutable security invoker set search_path = ''
as $$
  select nullif(btrim(coalesce(p_voice_model_id,'')),'') is null
    and nullif(btrim(coalesce(p_reader_name,'')),'') is not null
    and (p_reader_id is not null or p_reader_user_id is not null)
    and ('/' || coalesce(p_audio_storage_path,'') like '%/human/%'
      or coalesce(p_audio_storage_path,'') like 'human/%')
$$;
revoke all on function libread_internal.h1_known_human(text,text,uuid,uuid,text)
  from public, anon, authenticated;
grant execute on function libread_internal.h1_known_human(text,text,uuid,uuid,text)
  to service_role;

-- A privileged direct PostgREST INSERT/UPDATE/DELETE is not permitted to skip
-- the revision protocol. A transaction-local marker is set only by the
-- service-role-only atomic RPC while holding the owner/episode revision lock.
create or replace function libread_internal.h1_guard_human_mutation()
returns trigger language plpgsql security invoker set search_path = ''
as $$
declare
  before_human boolean := false;
  after_human boolean := false;
  scope_key text;
begin
  if TG_OP <> 'INSERT' then
    before_human := libread_internal.h1_known_human(
      old.voice_model_id::text,old.reader_name,old.reader_id,old.reader_user_id,
      old.audio_storage_path
    );
  end if;
  if TG_OP <> 'DELETE' then
    after_human := libread_internal.h1_known_human(
      new.voice_model_id::text,new.reader_name,new.reader_id,new.reader_user_id,
      new.audio_storage_path
    );
  end if;
  if before_human or after_human then
    if TG_OP = 'DELETE' then
      scope_key := old.series_id::text || ':' || old.episode_id::text || ':' || old.reader_id::text;
    else
      scope_key := new.series_id::text || ':' || new.episode_id::text || ':' || new.reader_id::text;
    end if;
    if scope_key is null or current_setting('libread.h1_atomic_scope',true) is distinct from scope_key
      or (TG_OP = 'UPDATE' and
        (old.series_id is distinct from new.series_id
          or old.episode_id is distinct from new.episode_id
          or old.reader_id is distinct from new.reader_id))
    then
      raise exception using errcode='P0001',message='H1_ATOMIC_RPC_REQUIRED';
    end if;
  end if;
  return case when TG_OP = 'DELETE' then old else new end;
end;
$$;
revoke all on function libread_internal.h1_guard_human_mutation()
  from public, anon, authenticated;
drop trigger if exists issue137_h1_human_atomic_guard on public.recordings;
create trigger issue137_h1_human_atomic_guard
before insert or update or delete on public.recordings
for each row execute function libread_internal.h1_guard_human_mutation();

-- An absent scope is revision zero. Reading never creates a scope row;
-- the commit RPC atomically creates and locks it before comparing revisions.
create or replace function public.issue137_h1_human_revision(
 p_series_id uuid, p_episode_id uuid, p_owner_id uuid
) returns bigint language sql stable security invoker set search_path = ''
as $$
 select coalesce((select r.revision from libread_internal.h1_human_scope_revision r
   where r.series_id=p_series_id and r.episode_id=p_episode_id and r.owner_id=p_owner_id),0)
$$;
revoke all on function public.issue137_h1_human_revision(uuid,uuid,uuid)
 from public, anon, authenticated;
grant execute on function public.issue137_h1_human_revision(uuid,uuid,uuid)
 to service_role;

-- 'insert' / 'replace' / 'visibility' / 'delete_all' share the same durable
-- revision, including after deletion. This is a service-role-only API, never
-- an end-user authentication shortcut. Route handlers must verify identity.
create or replace function public.issue137_h1_human_commit(
 p_series_id uuid, p_episode_id uuid, p_owner_id uuid,
 p_expected_revision bigint, p_action text,
 p_recording_id uuid default null, p_reader_name text default null,
 p_audio_storage_path text default null, p_is_public boolean default null,
 p_prior_audio_storage_path text default null, p_prior_is_public boolean default null
) returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare
 current_revision bigint;
 s record;
 e record;
 consent_version text;
 r18_user uuid;
 affected integer := 0;
 result_id uuid;
 ids uuid[] := '{}'::uuid[];
begin
 if p_series_id is null or p_episode_id is null or p_owner_id is null
  or p_expected_revision is null or p_expected_revision < 0
  or p_action not in ('insert','replace','visibility','delete_all') then
   raise exception using errcode='P0001',message='H1_BAD_INPUT';
 end if;
 -- H2: serialize the *final* permission decision with author changes.
 -- Locks are acquired BEFORE the per-owner revision row, and retained through
 -- the recording mutation. Only new/replace/public-exposure needs consent;
 -- hiding and owner deletion must remain possible after permission revocation.
 if p_action in ('insert','replace') or
    (p_action='visibility' and p_is_public is true) then
   select id,author_id,publication_status,recording_permission_mode,
          content_rating,content_warnings into s
     from public.series where id=p_series_id for share;
   select id,series_id,posting_status,is_published into e
     from public.episodes where id=p_episode_id for share;
   if s is null or e is null or e.series_id is distinct from p_series_id
      or s.recording_permission_mode is distinct from 'open' then
     raise exception using errcode='P0001',message='H2_PERMISSION_REVOKED';
   end if;
   -- A recorded reader cannot continue into newly private/draft content.
   -- The series author may still save an explicitly private take to a draft.
   if (s.publication_status is distinct from 'public'
       or e.posting_status is distinct from 'posted'
       or e.is_published is distinct from true)
       and (p_is_public is true or s.author_id is distinct from p_owner_id) then
     raise exception using errcode='P0001',message='H2_PUBLICATION_REVOKED';
   end if;
   select c.consent_version into consent_version
     from public.user_recording_consents c
     where c.user_id=p_owner_id and c.consent_key='recording_studio_global'
     for share;
   if consent_version is distinct from '2026-04-16' then
     raise exception using errcode='P0001',message='H2_CONSENT_REVOKED';
   end if;
   if (s.content_rating='r18' or
       'sexual_r18'=any(coalesce(s.content_warnings,'{}'::text[])))
       and s.author_id is distinct from p_owner_id then
     select u.id into r18_user from public.users u
       where u.id=p_owner_id and u.show_r18_content is true
         and u.r18_confirmed_at is not null for share;
     if r18_user is null then
       raise exception using errcode='P0001',message='H2_R18_REVOKED';
     end if;
   end if;
 end if;
 insert into libread_internal.h1_human_scope_revision(series_id,episode_id,owner_id)
 values(p_series_id,p_episode_id,p_owner_id) on conflict do nothing;
 select revision into current_revision from libread_internal.h1_human_scope_revision
 where series_id=p_series_id and episode_id=p_episode_id and owner_id=p_owner_id
 for update;
 if current_revision is distinct from p_expected_revision then
  raise exception using errcode='P0001',message='H1_STALE_REVISION';
 end if;
 -- An owner-alias conflict is never authority for a public write or deletion.
 if exists (
   select 1 from public.recordings r
   where r.series_id=p_series_id and r.episode_id=p_episode_id
    and (r.reader_id=p_owner_id or r.reader_user_id=p_owner_id)
    and libread_internal.h1_known_human(
     r.voice_model_id::text,r.reader_name,r.reader_id,r.reader_user_id,r.audio_storage_path)
    and (r.reader_id is null or r.reader_id<>p_owner_id
      or (r.reader_user_id is not null and r.reader_user_id<>p_owner_id))
 ) then
   raise exception using errcode='P0001',message='H1_AMBIGUOUS_OWNER';
 end if;
 if p_action in ('insert','replace') then
   if p_recording_id is null or p_is_public is null
     or nullif(btrim(coalesce(p_reader_name,'')),'') is null
     or p_audio_storage_path is null
     or p_audio_storage_path not like
      ('human/' || p_series_id::text || '/' || p_episode_id::text || '/' || p_owner_id::text || '/%')
     or p_audio_storage_path !~ '/[a-z0-9-]+/playback-from-[a-z0-9]+[.]m4a$'
   then
     raise exception using errcode='P0001',message='H1_BAD_HUMAN_PATH_OR_INPUT';
   end if;
 end if;
 if p_is_public is true and p_action in ('insert','replace')
   and exists (
    select 1 from public.recordings r
    where r.series_id=p_series_id and r.episode_id=p_episode_id
      and (r.reader_id=p_owner_id or r.reader_user_id=p_owner_id)
      and libread_internal.h1_known_human(
       r.voice_model_id::text,r.reader_name,r.reader_id,r.reader_user_id,r.audio_storage_path)
      and r.is_public is distinct from true
   ) then
   raise exception using errcode='P0001',message='H1_PRIVATE_REPUBLISH_DENIED';
 end if;
 perform pg_catalog.set_config('libread.h1_atomic_scope',
   p_series_id::text || ':' || p_episode_id::text || ':' || p_owner_id::text,true);
 if p_action = 'insert' then
   insert into public.recordings
    (id,series_id,episode_id,reader_id,reader_name,audio_storage_path,is_public,voice_model_id)
   values(p_recording_id,p_series_id,p_episode_id,p_owner_id,
     p_reader_name,p_audio_storage_path,p_is_public,null);
   affected := 1;
   result_id := p_recording_id;
 elsif p_action = 'replace' then
   -- Snapshot CAS + persistent revision: same-column ABA is rejected even
   -- if the previous publication flag and path were restored.
   update public.recordings r
    set audio_storage_path=p_audio_storage_path,is_public=p_is_public
    where r.id=p_recording_id and r.series_id=p_series_id
      and r.episode_id=p_episode_id and r.reader_id=p_owner_id
      and (r.reader_user_id is null or r.reader_user_id=p_owner_id)
      and r.reader_name=p_reader_name and r.voice_model_id is null
      and r.audio_storage_path=p_prior_audio_storage_path
      and r.is_public is not distinct from p_prior_is_public
      and libread_internal.h1_known_human(
        r.voice_model_id::text,r.reader_name,r.reader_id,r.reader_user_id,r.audio_storage_path);
   get diagnostics affected = row_count;
   result_id := p_recording_id;
 elsif p_action = 'visibility' then
   if p_recording_id is null or p_is_public is null then
     raise exception using errcode='P0001',message='H1_BAD_INPUT';
   end if;
   update public.recordings r set is_public=p_is_public
    where r.id=p_recording_id and r.series_id=p_series_id
      and r.episode_id=p_episode_id and r.reader_id=p_owner_id
      and (r.reader_user_id is null or r.reader_user_id=p_owner_id)
      and libread_internal.h1_known_human(
        r.voice_model_id::text,r.reader_name,r.reader_id,r.reader_user_id,r.audio_storage_path);
   get diagnostics affected = row_count;
   result_id := p_recording_id;
 elsif p_action = 'delete_all' then
   select coalesce(array_agg(r.id),'{}'::uuid[]) into ids
    from public.recordings r
    where r.series_id=p_series_id and r.episode_id=p_episode_id
      and r.reader_id=p_owner_id
      and (r.reader_user_id is null or r.reader_user_id=p_owner_id)
      and libread_internal.h1_known_human(
        r.voice_model_id::text,r.reader_name,r.reader_id,r.reader_user_id,r.audio_storage_path);
   delete from public.recordings r
    where r.id=any(ids) and r.series_id=p_series_id
      and r.episode_id=p_episode_id and r.reader_id=p_owner_id;
   get diagnostics affected = row_count;
 end if;
 if affected < 1 or (p_action <> 'delete_all' and affected <> 1) then
   raise exception using errcode='P0001',message='H1_OWNER_OR_ROW_CONFLICT';
 end if;
 update libread_internal.h1_human_scope_revision
   set revision=revision+1
 where series_id=p_series_id and episode_id=p_episode_id and owner_id=p_owner_id;
 return jsonb_build_object('recording_id',result_id,'deleted_count',affected,
   'revision',current_revision+1);
end;
$$;
revoke all on function public.issue137_h1_human_commit(
 uuid,uuid,uuid,bigint,text,uuid,text,text,boolean,text,boolean)
 from public,anon,authenticated;
grant execute on function public.issue137_h1_human_commit(
 uuid,uuid,uuid,bigint,text,uuid,text,text,boolean,text,boolean)
 to service_role;
select pg_catalog.pg_notify('pgrst','reload schema');
commit;
