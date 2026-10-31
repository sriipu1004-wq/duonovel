-- Issue #137: LOCAL-ONLY synthetic read-only auditor / sealed receipt scope.
-- NOT a migration; NEVER install in hosted or Production Supabase.
-- Auditor has no service_role/S3 key, no INSERT/UPDATE/DELETE on audio.
create table public.issue137_http_local_auditor_identities (
 user_id uuid primary key references auth.users(id)
);
alter table public.issue137_http_local_auditor_identities enable row level security;
revoke all on public.issue137_http_local_auditor_identities
 from public,anon,authenticated;
grant select,insert on public.issue137_http_local_auditor_identities to service_role;

-- Centralized per-request live GoTrue session and independently provisioned
-- app_metadata + server-owned local identity registry: user_metadata is ignored.
create function public.issue137_http_local_auditor_active()
returns boolean language sql volatile security definer set search_path='' as $f$
 select (select auth.uid()) is not null
  and (select auth.jwt()->>'role')='authenticated'
  and (select auth.jwt()->'app_metadata'->>'libread_local_auditor')='true'
  and exists(select 1 from public.issue137_http_local_auditor_identities i
     join auth.sessions s on s.user_id=i.user_id
     where i.user_id=(select auth.uid())
       and s.id=nullif((select auth.jwt())->>'session_id','')::uuid);
$f$;
revoke all on function public.issue137_http_local_auditor_active()
 from public,anon,authenticated,service_role;
grant execute on function public.issue137_http_local_auditor_active()
 to authenticated;

-- The Storage policy exposes only SEALED receipts in the test-only bucket.
-- RLS is checked by the provider during real authenticated PRIVATE GET.
create function public.issue137_http_local_auditor_can_read(p_path text)
returns boolean language sql volatile security definer set search_path='' as $f$
 select public.issue137_http_local_auditor_active()
 and exists(select 1 from public.issue137_http_local_tickets t
  where t.object_path=p_path and t.state='SEALED_PRIVATE_SNAPSHOT');
$f$;
revoke all on function public.issue137_http_local_auditor_can_read(text)
 from public,anon,authenticated,service_role;
grant execute on function public.issue137_http_local_auditor_can_read(text)
 to authenticated;
create policy issue137_http_auditor_private_read
on storage.objects as permissive for select to authenticated
using (bucket_id='f2p-http-privileged-worker-private'
 and public.issue137_http_local_auditor_can_read(name));
-- Prevent other permissive SELECT policies in this synthetic stack
-- from granting owner/third-party access to this fixture bucket.
create policy issue137_http_auditor_private_read_fence
on storage.objects as restrictive for select to authenticated
using (bucket_id<>'f2p-http-privileged-worker-private'
 or public.issue137_http_local_auditor_can_read(name));

-- Explicit DENY of modifications for the local auditor PRIVATE bucket,
-- even when other disposable fixtures have permissive write/delete policies.
-- In Postgres restrictive policies apply together with any permissive policy.
create policy issue137_http_auditor_private_update_fence
on storage.objects as restrictive for update to authenticated
using(bucket_id<>'f2p-http-privileged-worker-private')
with check(bucket_id<>'f2p-http-privileged-worker-private');
create policy issue137_http_auditor_private_delete_fence
on storage.objects as restrictive for delete to authenticated
using(bucket_id<>'f2p-http-privileged-worker-private');

-- A narrowly scoped receipt view through a service-owned, LOCAL ONLY RPC.
-- The private ledger stays unreadable via direct Data API table SELECT.
create function public.issue137_http_local_auditor_receipt(p_ticket uuid)
returns jsonb language sql volatile security definer set search_path='' as $f$
 select case when public.issue137_http_local_auditor_active()
 then (select jsonb_build_object(
  'bucket','f2p-http-privileged-worker-private',
  'path',t.object_path,'expectedSha256',t.expected_sha256
 ) from public.issue137_http_local_tickets t
 where t.ticket=p_ticket and t.state='SEALED_PRIVATE_SNAPSHOT')
 else null end;
$f$;
revoke all on function public.issue137_http_local_auditor_receipt(uuid)
 from public,anon,authenticated,service_role;
grant execute on function public.issue137_http_local_auditor_receipt(uuid)
 to authenticated;
notify pgrst,'reload schema';
