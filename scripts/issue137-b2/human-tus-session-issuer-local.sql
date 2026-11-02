-- Issue #137: disposable LOCAL-only app-schema-aligned user-JWT TUS issuer.
-- Never install on hosted Supabase. This SECURITY DEFINER RPC is intentionally
-- exposed ONLY inside the disposable Docker PostgreSQL fixture.
alter table libread_internal.issue137_tus_app_leases
 add column issued_session_id uuid,
 add column expected_bytes bigint check(expected_bytes>0 and expected_bytes<=16777216);

create function libread_internal.issue137_tus_local_session_fence(p_bucket text,p_path text)
returns boolean language sql volatile security definer set search_path='' as $$
 select p_bucket<>'f2p-tus-app-authority-local' or exists (
  select 1 from libread_internal.issue137_tus_app_leases l
  where l.object_path=p_path and l.state='active'
   and (l.issued_session_id is null or
     l.issued_session_id=nullif((select auth.jwt())->>'session_id','')::uuid)
 )
$$;
revoke all on function libread_internal.issue137_tus_local_session_fence(text,text)
 from public,anon,authenticated,service_role;
grant execute on function libread_internal.issue137_tus_local_session_fence(text,text)
 to authenticated;
create policy issue137_tus_local_issued_session_fence on storage.objects
 as restrictive for insert to authenticated with check (
  libread_internal.issue137_tus_local_session_fence(bucket_id,name)
 );

create function public.issue137_tus_local_issue(
 p_series_id uuid,p_episode_id uuid,p_expected_sha256 text,p_size_bytes bigint
) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare
 actor uuid;
 session_id uuid;
 lease_uuid uuid;
 path text;
 valid_until timestamptz;
begin
 actor=(select auth.uid());
 -- Invalid or stale GoTrue session, malformed input, missing consent, foreign
 -- series/episode, closed permission, or R18 block must not create a lease.
 if actor is null or coalesce(p_expected_sha256,'') !~ '^[a-f0-9]{64}$'
    or p_size_bytes is null or p_size_bytes<44 or p_size_bytes>16777216
    or p_series_id is null or p_episode_id is null then
  raise exception using errcode='42501',message='LOCAL_ISSUE137_LEASE_HOLD';
 end if;
 -- Next.js alone is not an authorization boundary for a directly callable
 -- PostgREST RPC: mirror the current Official-account prohibition HERE.
 -- This uses trusted GoTrue account email, not user-editable JWT metadata.
 if exists (
   select 1 from auth.users a where a.id=actor
   and pg_catalog.lower(pg_catalog.btrim(a.email))='libread08@gmail.com'
 ) then
   raise exception using errcode='42501',message='LOCAL_ISSUE137_OFFICIAL_HOLD';
 end if;
 session_id=nullif((select auth.jwt())->>'session_id','')::uuid;
 if session_id is null or not exists (
    select 1 from auth.sessions s where s.id=session_id and s.user_id=actor
 ) then
  raise exception using errcode='42501',message='LOCAL_ISSUE137_SESSION_HOLD';
 end if;
 lease_uuid=pg_catalog.gen_random_uuid();
 path='owner/'||actor::text||'/series/'||p_series_id::text||
  '/episode/'||p_episode_id::text||'/'||lease_uuid::text||'.wav';
 valid_until=pg_catalog.clock_timestamp()+interval '10 minutes';
 insert into libread_internal.issue137_tus_app_leases
 (lease_id,actor_id,series_id,episode_id,object_path,expected_sha256,
  issued_session_id,expected_bytes,expires_at,state)
 values (lease_uuid,actor,p_series_id,p_episode_id,path,p_expected_sha256,
  session_id,p_size_bytes,valid_until,'active');
 if not libread_internal.issue137_tus_app_can_insert(
     'f2p-tus-app-authority-local',path) then
  raise exception using errcode='42501',message='LOCAL_ISSUE137_AUTH_HOLD';
 end if;
 -- Deliberately no signed URL, secret, JWT, S3 key, or PUBLIC object.
 return pg_catalog.jsonb_build_object('leaseId',lease_uuid,'objectPath',path,
  'expiresAt',valid_until,'mode','PRIVATE_JWT_TUS_LOCAL_ONLY');
end
$$;
revoke all on function public.issue137_tus_local_issue(uuid,uuid,text,bigint)
 from public,anon,authenticated,service_role;
grant execute on function public.issue137_tus_local_issue(uuid,uuid,text,bigint)
 to authenticated;

-- G1 candidate LOCAL ONLY: preserve revocation across temporary withdrawals.
-- These are test-scoped event invalidations; they do NOT revoke privileged
-- service_role/S3 writers or prove cross-transaction writer exclusion.
-- An old ticket is never revived by reaccepting consent or reopening a work.
create function libread_internal.issue137_tus_local_consent_epoch()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.consent_key='recording_studio_global' and
    (tg_op='DELETE' or old.consent_version is distinct from new.consent_version) then
  update libread_internal.issue137_tus_app_leases
   set state='revoked' where actor_id=old.user_id
   and issued_session_id is not null and state='active';
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end
$$;
revoke all on function libread_internal.issue137_tus_local_consent_epoch()
 from public,anon,authenticated,service_role;
create trigger issue137_tus_local_consent_epoch
after update of consent_version or delete on public.user_recording_consents
for each row execute function libread_internal.issue137_tus_local_consent_epoch();

-- A profile change affecting R18 viewing may toggle OFF and ON again before
-- the next PATCH. Tie the original ticket to the old authority epoch.
create function libread_internal.issue137_tus_local_profile_epoch()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.show_r18_content is distinct from new.show_r18_content or
    old.r18_confirmed_at is distinct from new.r18_confirmed_at then
  update libread_internal.issue137_tus_app_leases
   set state='revoked' where actor_id=old.id
   and issued_session_id is not null and state='active';
 end if;
 return new;
end
$$;
revoke all on function libread_internal.issue137_tus_local_profile_epoch()
 from public,anon,authenticated,service_role;
create trigger issue137_tus_local_profile_epoch
after update of show_r18_content,r18_confirmed_at on public.users
for each row execute function libread_internal.issue137_tus_local_profile_epoch();

-- A changed author, work visibility, permission, or rating/warnings alters
-- upload authorization. An unrelated work's leases must remain unaffected.
create function libread_internal.issue137_tus_local_series_epoch()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.author_id is distinct from new.author_id or
    old.publication_status is distinct from new.publication_status or
    old.recording_permission_mode is distinct from new.recording_permission_mode or
    old.content_rating is distinct from new.content_rating or
    old.content_warnings is distinct from new.content_warnings then
  update libread_internal.issue137_tus_app_leases
   set state='revoked' where series_id=old.id
   and issued_session_id is not null and state='active';
 end if;
 return new;
end
$$;
revoke all on function libread_internal.issue137_tus_local_series_epoch()
 from public,anon,authenticated,service_role;
create trigger issue137_tus_local_series_epoch
after update of author_id,publication_status,recording_permission_mode,
 content_rating,content_warnings on public.series
for each row execute function libread_internal.issue137_tus_local_series_epoch();

-- Publication/episode reassignment/body edits can invalidate a stage's
-- eligibility or transcription alignment; never reuse its prior lease.
create function libread_internal.issue137_tus_local_episode_epoch()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.series_id is distinct from new.series_id or
    old.posting_status is distinct from new.posting_status or
    old.is_published is distinct from new.is_published or
    old.body is distinct from new.body then
  update libread_internal.issue137_tus_app_leases
   set state='revoked' where episode_id=old.id
   and issued_session_id is not null and state='active';
 end if;
 return new;
end
$$;
revoke all on function libread_internal.issue137_tus_local_episode_epoch()
 from public,anon,authenticated,service_role;
create trigger issue137_tus_local_episode_epoch
after update of series_id,posting_status,is_published,body on public.episodes
for each row execute function libread_internal.issue137_tus_local_episode_epoch();


-- G2 LOCAL-ONLY: existing Human finalize may inspect an authenticated
-- uploaded PRIVATE TUS object, but cannot publish or seal it as trusted.
-- This is installed only in disposable PostgreSQL, NOT a hosted migration.
-- Authorization comes from real auth.uid()/jwt session and the ORIGINAL
-- live lease/consent/permission/R18 authority. Never accept client-supplied
-- object paths, actor UUIDs, size or digest as authorization.
create function libread_internal.issue137_g2_local_staged_owner_read(
 p_bucket text,p_path text
) returns boolean language sql volatile security definer set search_path='' as $$
 select p_bucket='f2p-tus-app-authority-local'
  and (select auth.uid()) is not null
  and (select auth.jwt()->>'role')='authenticated'
  and exists (
   select 1 from libread_internal.issue137_tus_app_leases l
   where l.object_path=p_path and l.actor_id=(select auth.uid())
    and l.issued_session_id=
      nullif((select auth.jwt())->>'session_id','')::uuid
    and libread_internal.issue137_tus_app_can_insert(p_bucket,p_path)
  )
$$;
revoke all on function libread_internal.issue137_g2_local_staged_owner_read(text,text)
 from public,anon,authenticated,service_role;
grant execute on function libread_internal.issue137_g2_local_staged_owner_read(text,text)
 to authenticated;
create policy issue137_g2_local_staged_owner_read
on storage.objects as permissive for select to authenticated
using (libread_internal.issue137_g2_local_staged_owner_read(bucket_id,name));
create policy issue137_g2_local_staged_owner_read_fence
on storage.objects as restrictive for select to authenticated
using (bucket_id<>'f2p-tus-app-authority-local'
 or libread_internal.issue137_g2_local_staged_owner_read(bucket_id,name));

create function public.issue137_g2_local_uploaded_preflight(p_lease uuid)
returns jsonb language plpgsql volatile security definer set search_path=''
as $$
declare l record; obj uuid;
begin
 if p_lease is null or (select auth.uid()) is null or
  (select auth.jwt()->>'role') is distinct from 'authenticated'
 then return null; end if;
 select * into l from libread_internal.issue137_tus_app_leases
 where lease_id=p_lease and actor_id=(select auth.uid())
  and issued_session_id=nullif((select auth.jwt())->>'session_id','')::uuid
  and state='active' and expires_at>pg_catalog.clock_timestamp();
 if not found or not libread_internal.issue137_tus_app_can_insert(
    'f2p-tus-app-authority-local',l.object_path) then return null; end if;
 select o.id into obj from storage.objects o
 where o.bucket_id='f2p-tus-app-authority-local'
   and o.name=l.object_path;
 if not found or obj is null then return null; end if;
 return pg_catalog.jsonb_build_object(
   'leaseId',l.lease_id,'actorId',l.actor_id,
   'seriesId',l.series_id,'episodeId',l.episode_id,
   'sessionId',l.issued_session_id,'objectId',obj,
   'bucket','f2p-tus-app-authority-local','path',l.object_path,
   'size',l.expected_bytes,'sha256',l.expected_sha256,
   'state','STAGED_NOT_SEALED');
end
$$;
revoke all on function public.issue137_g2_local_uploaded_preflight(uuid)
 from public,anon,authenticated,service_role;
grant execute on function public.issue137_g2_local_uploaded_preflight(uuid)
 to authenticated;
select pg_catalog.pg_notify('pgrst','reload schema');
