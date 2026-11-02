-- Issue #137 G2: disposable LOCAL ONLY, independent GoTrue attestor identity.
-- Reuses the previously installed server-provisioned auditor identity registry:
-- public.issue137_http_local_auditor_identities plus signed app_metadata
-- and LIVE auth.sessions. Never apply this SQL to hosted Supabase.
-- This scope authenticates byte READ, not immutable storage or rights evidence.
create table libread_internal.issue137_g2_local_attestor_assignments (
 lease_id uuid primary key references libread_internal.issue137_tus_app_leases(lease_id),
 attestor_id uuid not null
  references public.issue137_http_local_auditor_identities(user_id),
 provider_object_id uuid not null,
 created_at timestamptz not null default pg_catalog.clock_timestamp()
);
revoke all on libread_internal.issue137_g2_local_attestor_assignments
 from public,anon,authenticated,service_role;

-- Security definer intentionally returns a BOOLEAN, never a path/secret.
-- Current auditor JWT must be both independently registered and assigned
-- to this exact LIVE unexpired lease, physical provider object UUID and
-- original narrator authority. User metadata spoof is ignored.
create function libread_internal.issue137_g2_local_attestor_allowed(
 p_bucket text,p_path text
) returns boolean language sql volatile security definer set search_path='' as $g2$
 select p_bucket='f2p-tus-app-authority-local'
  and public.issue137_http_local_auditor_active()
  and exists (
   select 1 from libread_internal.issue137_g2_local_attestor_assignments a
   join libread_internal.issue137_tus_app_leases l on l.lease_id=a.lease_id
   join storage.objects o on o.bucket_id=p_bucket and o.name=p_path
    and o.id=a.provider_object_id
   where a.attestor_id=(select auth.uid())
    and l.object_path=p_path and l.state='active'
    and l.expires_at>pg_catalog.clock_timestamp()
    and l.actor_id<>(select auth.uid())
    and libread_internal.issue137_tus_private_authorized(
     l.lease_id,l.actor_id,l.issued_session_id)
    and not exists(
     select 1 from libread_internal.issue137_tus_app_receipts r
     where r.lease_id=l.lease_id and r.state='SEALED_PRIVATE_SNAPSHOT')
  )
$g2$;
revoke all on function libread_internal.issue137_g2_local_attestor_allowed(text,text)
 from public,anon,authenticated,service_role;
grant execute on function libread_internal.issue137_g2_local_attestor_allowed(text,text)
 to authenticated;

-- The separate process asks only for a lease UUID. Server-owned metadata
-- comes from the ORIGINAL lease plus the independently registered scoped
-- assignment; the caller must not supply bucket/path/SHA/size.
create function public.issue137_g2_local_attestor_scope(p_lease uuid)
returns jsonb language sql volatile security definer set search_path='' as $g2$
 select pg_catalog.jsonb_build_object(
  'leaseId',l.lease_id,'bucket','f2p-tus-app-authority-local',
  'path',l.object_path,'sha256',l.expected_sha256,
  'size',l.expected_bytes,'objectId',a.provider_object_id)
 from libread_internal.issue137_g2_local_attestor_assignments a
 join libread_internal.issue137_tus_app_leases l on l.lease_id=a.lease_id
 where a.lease_id=p_lease and a.attestor_id=(select auth.uid())
  and libread_internal.issue137_g2_local_attestor_allowed(
   'f2p-tus-app-authority-local',l.object_path)
$g2$;
revoke all on function public.issue137_g2_local_attestor_scope(uuid)
 from public,anon,authenticated,service_role;
grant execute on function public.issue137_g2_local_attestor_scope(uuid)
 to authenticated;

-- The existing two RESTRICTIVE SELECT fences are ANDed in PostgreSQL.
-- Both must admit only the newly assigned, still-live dedicated auditor,
-- in addition to already authorized original narrator staged/sealed reads.
create policy issue137_g2_local_scoped_attestor_select
 on storage.objects as permissive for select to authenticated
 using (bucket_id='f2p-tus-app-authority-local'
  and libread_internal.issue137_g2_local_attestor_allowed(bucket_id,name));
alter policy issue137_g2_local_staged_owner_read_fence
 on storage.objects using (
  bucket_id<>'f2p-tus-app-authority-local'
  or libread_internal.issue137_g2_local_staged_owner_read(bucket_id,name)
  or libread_internal.issue137_g2_local_owner_can_read(bucket_id,name)
  or libread_internal.issue137_g2_local_attestor_allowed(bucket_id,name)
 );
alter policy issue137_g2_local_private_owner_read_fence
 on storage.objects using (
  bucket_id<>'f2p-tus-app-authority-local'
  or libread_internal.issue137_g2_local_staged_owner_read(bucket_id,name)
  or libread_internal.issue137_g2_local_owner_can_read(bucket_id,name)
  or libread_internal.issue137_g2_local_attestor_allowed(bucket_id,name)
 );
-- No INSERT/UPDATE/DELETE policies or PUBLIC visibility changed.
select pg_catalog.pg_notify('pgrst','reload schema');
