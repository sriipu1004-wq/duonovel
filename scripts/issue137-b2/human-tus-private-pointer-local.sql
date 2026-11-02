-- Issue #137 G1 PRIVATE staging -> receipt -> POINTER, disposable TEST ONLY.
-- Never apply to hosted Supabase, migrations or a production schema.
-- This is an app-visible pointer snapshot; service_role/S3 can still change
-- physical Storage bytes later. No PUBLIC path or recordings publication.
create table libread_internal.issue137_tus_private_pointers (
 lease_id uuid primary key references libread_internal.issue137_tus_app_leases(lease_id),
 owner_id uuid not null,
 issued_session_id uuid not null,
 series_id uuid not null,
 episode_id uuid not null,
 stage_bucket text not null check(stage_bucket='f2p-tus-app-authority-local'),
 stage_path text not null unique,
 provider_object_id uuid not null,
 verified_sha256 text not null check(verified_sha256 ~ '^[a-f0-9]{64}$'),
 verified_bytes bigint not null check(verified_bytes>0 and verified_bytes<=16777216),
 claim_nonce uuid not null unique,
 pointer_state text not null default 'PRIVATE_POINTER_ONLY'
   check(pointer_state='PRIVATE_POINTER_ONLY'),
 pointer_version bigint not null default 1 check(pointer_version=1),
 created_at timestamptz not null default clock_timestamp()
);
revoke all on libread_internal.issue137_tus_private_pointers
 from public,anon,authenticated,service_role;

-- Server-side read and commit use the SAME canonical authority graph.
-- Caller is the trusted disposable PostgreSQL harness, never user REST.
-- A live GoTrue session must match the one that issued the ticket;
-- the original actor cannot borrow a second session or foreign pointer.
create function libread_internal.issue137_tus_private_authorized(
 p_lease uuid,p_actor uuid,p_session uuid
) returns boolean language sql volatile security invoker set search_path='' as $$
 select exists(
  select 1 from libread_internal.issue137_tus_app_leases l
  join auth.sessions a on a.id=l.issued_session_id and a.user_id=l.actor_id
  join auth.users au on au.id=l.actor_id
  join public.series s on s.id=l.series_id
  join public.episodes e on e.id=l.episode_id and e.series_id=s.id
  join public.user_recording_consents c on c.user_id=l.actor_id
   and c.consent_key='recording_studio_global'
   and c.consent_version='2026-04-16'
  join public.users u on u.id=l.actor_id
  where l.lease_id=p_lease and l.actor_id=p_actor
   and l.issued_session_id=p_session and l.state='active'
   and l.expires_at>clock_timestamp()
   and lower(btrim(au.email))<>'libread08@gmail.com'
   -- Human narration is NOT author-only: a different signed-in narrator
   -- may stage/claim a publicly posted work when recording is OPEN.
   -- The narrator owns the private lease/audio; the series author is a
   -- separate actor. OPEN is product permission, NOT independent evidence
   -- of original-text, edition, translation or third-party legal rights.
   and s.recording_permission_mode='open'
   and s.publication_status='public'
   and e.posting_status='posted' and e.is_published is true
   -- Match application getSeriesContentRating warning escalation. Even
   -- the author cannot bypass the R18 viewer opt-in+age gate here.
   and ((s.content_rating is distinct from 'r18'
     and not ('sexual_r18'=any(coalesce(s.content_warnings,'{}'::text[]))))
     or (u.show_r18_content is true and u.r18_confirmed_at is not null))
 )
$$;
revoke all on function libread_internal.issue137_tus_private_authorized(uuid,uuid,uuid)
 from public,anon,authenticated,service_role;

-- CAS is server-only and must run AFTER an independently acquired full
-- Storage download and exact SHA-256/size/object identity verification.
-- Even this PostgreSQL commit cannot atomically freeze provider bytes.
create function libread_internal.issue137_tus_private_commit(
 p_lease uuid,p_actor uuid,p_session uuid,p_nonce uuid,
 p_sha text,p_size bigint,p_object uuid
) returns boolean language plpgsql volatile security invoker set search_path='' as $$
declare l record; r record;
begin
 if p_lease is null or p_actor is null or p_session is null or
    p_nonce is null or p_object is null or
    coalesce(p_sha,'') !~ '^[a-f0-9]{64}$' or
    p_size is null or p_size<44 or p_size>16777216 then
  return false;
 end if;
 -- Lock the lease and receipt against multiple concurrent finalizers. A
 -- prior durable STAGED -> VERIFYING claim (version=1) is mandatory.
 select * into l from libread_internal.issue137_tus_app_leases
  where lease_id=p_lease for update;
 select * into r from libread_internal.issue137_tus_app_receipts
  where lease_id=p_lease for update;
 if not found or r.state is distinct from 'VERIFYING' or
    r.attempted is distinct from true or r.version is distinct from 1 or
    l.lease_id is null or l.state is distinct from 'active' or
    l.actor_id is distinct from p_actor or
    l.issued_session_id is distinct from p_session or
    l.expected_sha256 is distinct from p_sha or
    l.expected_bytes is distinct from p_size or
    r.expected_bytes is distinct from p_size or
    l.expires_at<=clock_timestamp() then
  return false;
 end if;
 -- Lock all mutable authority rows until pointer commit. An already-waiting
 -- revocation must execute before a delayed finalizer is allowed to commit.
 perform 1
 from public.series s
 join public.episodes e on e.series_id=s.id and e.id=l.episode_id
 join public.user_recording_consents c on c.user_id=l.actor_id
  and c.consent_key='recording_studio_global'
 join public.users u on u.id=l.actor_id
 join auth.sessions a on a.id=l.issued_session_id and a.user_id=l.actor_id
 join auth.users au on au.id=l.actor_id
 where s.id=l.series_id
 for share of s,e,c,u,a,au;
 if not found or not libread_internal.issue137_tus_private_authorized(
    p_lease,p_actor,p_session) then return false; end if;
 -- A real provider object must be present under the single server-minted
 -- canonical PRIVATE path with the same identity seen during readback.
 perform 1 from storage.objects o
 where o.bucket_id='f2p-tus-app-authority-local'
  and o.name=l.object_path and o.id=p_object
 for share;
 if not found then return false; end if;
 update libread_internal.issue137_tus_app_receipts
 set state='SEALED_PRIVATE_SNAPSHOT',verified_sha256=p_sha,
  verified_bytes=p_size,provider_object_id=p_object,
  verified_at=clock_timestamp(),version=version+1
 where lease_id=p_lease and state='VERIFYING' and attempted
  and version=1;
 if not found then return false; end if;
 insert into libread_internal.issue137_tus_private_pointers (
  lease_id,owner_id,issued_session_id,series_id,episode_id,stage_bucket,
  stage_path,provider_object_id,verified_sha256,verified_bytes,claim_nonce
 ) values(p_lease,p_actor,p_session,l.series_id,l.episode_id,
  'f2p-tus-app-authority-local',l.object_path,p_object,p_sha,p_size,p_nonce)
 on conflict do nothing;
 if not found then
  raise exception using errcode='23505',
   message='ISSUE137_LOCAL_PRIVATE_POINTER_DUPLICATE_HOLD';
 end if;
 return true;
end
$$;
revoke all on function libread_internal.issue137_tus_private_commit(
 uuid,uuid,uuid,uuid,text,bigint,uuid) from public,anon,authenticated,service_role;

-- G1 durable LOCAL PRIVATE Reader entitlement, NOT a lasting TUS upload.
-- CAS retains ORIGINAL 10-minute lease and issuer session. Only after sealed
-- CAS can a newly signed-in session of the SAME narrator read the PRIVATE
-- pointer: current GoTrue auth.sessions, current consent/rights/R18, existing
-- object identity and permanently nonrevoked lease are all mandatory.
-- Initial upload lease expiry and its first auth session do not determine
-- the lifetime of an already sealed PRIVATE entitlement.
create function libread_internal.issue137_g1_sealed_current_owner(
 p_lease uuid,p_actor uuid,p_current_session uuid
) returns boolean language sql volatile security invoker set search_path='' as ' select exists (
  select 1 from libread_internal.issue137_tus_private_pointers p
  join libread_internal.issue137_tus_app_leases l on l.lease_id=p.lease_id
  join libread_internal.issue137_tus_app_receipts r on r.lease_id=p.lease_id
  join auth.users au on au.id=p.owner_id
  join auth.sessions live on live.id=p_current_session
   and live.user_id=p.owner_id
  join public.series s on s.id=p.series_id
  join public.episodes e on e.id=p.episode_id and e.series_id=s.id
  join public.user_recording_consents c on c.user_id=p.owner_id
   and c.consent_key=''recording_studio_global''
   and c.consent_version=''2026-04-16''
  join public.users u on u.id=p.owner_id
  join storage.objects o on o.bucket_id=p.stage_bucket and o.name=p.stage_path
   and o.id=p.provider_object_id
  where p.lease_id=p_lease and p.owner_id=p_actor
   and l.actor_id=p.owner_id and l.issued_session_id=p.issued_session_id
   and l.series_id=p.series_id and l.episode_id=p.episode_id
   and l.object_path=p.stage_path and l.state=''active''
   and p.pointer_state=''PRIVATE_POINTER_ONLY''
   and r.state=''SEALED_PRIVATE_SNAPSHOT''
   and r.verified_sha256=p.verified_sha256
   and r.verified_bytes=p.verified_bytes
   and r.provider_object_id=p.provider_object_id
   and lower(btrim(au.email))<>''libread08@gmail.com''
   and s.recording_permission_mode=''open'' and s.publication_status=''public''
   and e.posting_status=''posted'' and e.is_published is true
   and ((s.content_rating is distinct from ''r18''
     and not (''sexual_r18''=any(coalesce(s.content_warnings,''{}''::text[]))))
     or (u.show_r18_content is true and u.r18_confirmed_at is not null))
 )';
revoke all on function
 libread_internal.issue137_g1_sealed_current_owner(uuid,uuid,uuid)
 from public,anon,authenticated,service_role;

-- This is a SERVER-ONLY *authorization preflight* for a PRIVATE pointer:
-- it returns no PUBLIC URL. A worker must independently re-read provider
-- bytes and compare exact SHA + object ID before serving even private bytes.
create function libread_internal.issue137_tus_private_read(
 p_lease uuid,p_actor uuid,p_session uuid
) returns text language sql volatile security invoker set search_path='' as $$
 select p.stage_path from libread_internal.issue137_tus_private_pointers p
 join libread_internal.issue137_tus_app_receipts r on r.lease_id=p.lease_id
 join storage.objects o on o.bucket_id=p.stage_bucket
  and o.name=p.stage_path and o.id=p.provider_object_id
 where p.lease_id=p_lease and p.owner_id=p_actor
  and p.pointer_state='PRIVATE_POINTER_ONLY'
  and r.state='SEALED_PRIVATE_SNAPSHOT'
  and r.verified_sha256=p.verified_sha256
  and r.verified_bytes=p.verified_bytes
  and r.provider_object_id=p.provider_object_id
  and libread_internal.issue137_g1_sealed_current_owner(
    p_lease,p_actor,p_session)
$$;
revoke all on function libread_internal.issue137_tus_private_read(uuid,uuid,uuid)
 from public,anon,authenticated,service_role;


-- HTTP bridge preflight is strictly for the disposable localhost test.
-- No hosted migration; the existing Next HUMAN AUDIO GET only uses this
-- when its independent loopback-only runtime guard is satisfied.
-- The API is invisible to anon/authenticated; postgres-owned definer verifies
-- the *original* GoTrue session, live lease, sealed receipt, object ID,
-- current work/R18/consent and owner before returning any object coordinates.
create function public.issue137_g1_local_http_preflight(
 p_lease uuid, p_actor uuid, p_session uuid
) returns jsonb language plpgsql volatile security definer set search_path=''
as $$
declare p record;
begin
 if p_lease is null or p_actor is null or p_session is null then return null; end if;
 select p0.lease_id,p0.owner_id,p0.issued_session_id,p0.stage_bucket,
   p0.stage_path,p0.provider_object_id,p0.verified_sha256,
   p0.verified_bytes,p0.pointer_version
 into p from libread_internal.issue137_tus_private_pointers p0
 where p0.lease_id=p_lease
  and p0.owner_id=p_actor
  and p0.pointer_state='PRIVATE_POINTER_ONLY'
  and libread_internal.issue137_tus_private_read(
    p_lease,p_actor,p_session)=p0.stage_path;
 if not found or p.stage_bucket is distinct from 'f2p-tus-app-authority-local'
  or p.verified_bytes<44 or p.verified_bytes>16777216 then return null; end if;
 return pg_catalog.jsonb_build_object(
  'leaseId',p.lease_id,'ownerId',p.owner_id,'sessionId',p_session,
  'bucket',p.stage_bucket,'path',p.stage_path,'objectId',p.provider_object_id,
  'sha256',p.verified_sha256,'size',p.verified_bytes,
  'version',p.pointer_version,'state','PRIVATE_POINTER_ONLY');
end
$$;
revoke all on function public.issue137_g1_local_http_preflight(uuid,uuid,uuid)
 from public,anon,authenticated,service_role;
grant execute on function public.issue137_g1_local_http_preflight(uuid,uuid,uuid)
 to service_role;
select pg_catalog.pg_notify('pgrst','reload schema');


-- G2: LOCAL-ONLY reader credential isolation for existing G1 HTTP GET.
-- The app's physical Storage download MUST carry the original user JWT and
-- only the PUBLIC local anon API key. This policy cannot grant INSERT/UPDATE
-- or DELETE to the same actor and does not affect any hosted bucket.
-- SECURITY DEFINER is confined to a boolean nonexposed-schema helper with
-- explicit live actor+session+sealed-pointer checks; it returns no object path.
create function libread_internal.issue137_g2_local_owner_can_read(
 p_bucket text,p_path text
) returns boolean language sql volatile security definer set search_path=''
as $$
 select p_bucket='f2p-tus-app-authority-local'
  and (select auth.uid()) is not null
  and (select auth.jwt()->>'role')='authenticated'
  and exists (
   select 1 from libread_internal.issue137_tus_private_pointers p
   where p.stage_bucket=p_bucket and p.stage_path=p_path
    and p.owner_id=(select auth.uid())
    and p.pointer_state='PRIVATE_POINTER_ONLY'
    and libread_internal.issue137_tus_private_read(
      p.lease_id,p.owner_id,
      nullif((select auth.jwt())->>'session_id','')::uuid)=p_path
  )
$$;
revoke all on function libread_internal.issue137_g2_local_owner_can_read(text,text)
 from public,anon,authenticated,service_role;
grant execute on function libread_internal.issue137_g2_local_owner_can_read(text,text)
 to authenticated;
create policy issue137_g2_local_private_owner_read
on storage.objects as permissive for select to authenticated
using (libread_internal.issue137_g2_local_owner_can_read(bucket_id,name));
-- Even an unrelated permissive SELECT cannot widen this bucket's read scope.
create policy issue137_g2_local_private_owner_read_fence
on storage.objects as restrictive for select to authenticated
using (bucket_id<>'f2p-tus-app-authority-local'
 or libread_internal.issue137_g2_local_owner_can_read(bucket_id,name)
 -- Prior to sealing, only the same live GoTrue actor/session may read the
 -- STAGED object. Both restrictive guards still deny revoked and foreign.
 or libread_internal.issue137_g2_local_staged_owner_read(bucket_id,name));
-- READ-ONLY isolation is deliberately NOT a claim of full provider custody:
-- project-wide service_role and generated S3 keys still bypass this RLS.

-- G1/2 LOCAL integration: this earlier restrictive SELECT policy was
-- installed during TUS issuer setup, BEFORE the G1 sealed function existed.
-- PostgreSQL combines restrictive policies with AND: without this ALTER,
-- the original STAGED-only predicate denies every PRIVATE read once the
-- 10-minute TUS lease expires, even though a sealed durable receipt exists.
-- Keep the same original owner/session and live revoked/rights checks for
-- either branch; DO NOT broaden anonymous, write or PUBLIC access.
alter policy issue137_g2_local_staged_owner_read_fence
 on storage.objects using (
  bucket_id<>'f2p-tus-app-authority-local'
  or libread_internal.issue137_g2_local_staged_owner_read(bucket_id,name)
  or libread_internal.issue137_g2_local_owner_can_read(bucket_id,name)
 );
