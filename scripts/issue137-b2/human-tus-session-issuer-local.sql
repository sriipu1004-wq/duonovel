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

-- Consent version withdrawal marks already-issued tickets terminal. This
-- simulates atomic app invalidation only in this disposable database.
create function libread_internal.issue137_tus_local_consent_epoch()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.consent_version is distinct from new.consent_version then
  update libread_internal.issue137_tus_app_leases
   set state='revoked' where actor_id=new.user_id
   and issued_session_id is not null and state='active';
 end if;
 return new;
end
$$;
create trigger issue137_tus_local_consent_epoch
after update of consent_version on public.user_recording_consents
for each row execute function libread_internal.issue137_tus_local_consent_epoch();
