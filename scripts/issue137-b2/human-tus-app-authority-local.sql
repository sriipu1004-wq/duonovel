-- Issue #137 LOCAL-ONLY experiment: actual LIB read Human route authority fields.
-- This file is NOT a migration and MUST NEVER be applied to hosted Supabase.
-- Uses synthetic public.series/episodes/users/user_recording_consents columns
-- faithfully named to match current source. Real permissions/rights gates still
-- require a later independent hosted-design review.
insert into storage.buckets (id,name,public,file_size_limit)
values ('f2p-tus-app-authority-local','f2p-tus-app-authority-local',false,16777216);

-- Only the trusted disposable TEST HARNESS can provision a stage/lease.
-- Real application allocation and ledger persistence are NOT implemented.
create table libread_internal.issue137_tus_app_leases (
 lease_id uuid primary key,
 actor_id uuid not null references auth.users(id),
 series_id uuid not null references public.series(id),
 episode_id uuid not null references public.episodes(id),
 object_path text not null unique,
 expected_sha256 text not null check (expected_sha256 ~ '^[a-f0-9]{64}$'),
 state text not null default 'active' check(state in ('active','revoked')),
 expires_at timestamptz not null,
 constraint issue137_tus_app_canonical_path check(
  object_path='owner/'||actor_id::text||'/series/'||series_id::text||
  '/episode/'||episode_id::text||'/'||lease_id::text||'.wav'
 )
);
revoke all on libread_internal.issue137_tus_app_leases from public,anon,authenticated,service_role;

-- The function is test-only: SQL reads live authority on every provider RLS
-- invocation. It does NOT prove independent rights approvals, payload digest,
-- exclusive service-role/S3 ingress or production PostgreSQL privileges.
create function libread_internal.issue137_tus_app_can_insert(
 p_bucket text,p_path text
) returns boolean language sql volatile security definer set search_path='' as $f$
 select p_bucket='f2p-tus-app-authority-local'
 and (select auth.uid()) is not null
 and exists (
  select 1 from libread_internal.issue137_tus_app_leases l
  join public.series s on s.id=l.series_id
  join public.episodes e on e.id=l.episode_id and e.series_id=s.id
  join public.user_recording_consents c on
   c.user_id=l.actor_id and c.consent_key='recording_studio_global'
   and c.consent_version='2026-04-16'
  join public.users u on u.id=l.actor_id
  join auth.sessions a on a.user_id=l.actor_id
  where l.object_path=p_path and l.actor_id=(select auth.uid())
   and l.state='active' and l.expires_at>clock_timestamp()
   and a.id=nullif((select auth.jwt())->>'session_id','')::uuid
   -- Actual Human route policy: only open is eligible, including author.
   and s.recording_permission_mode='open'
   -- Actual Reader/RLS visibility: draft is accessible only to author.
   and (s.author_id=l.actor_id or (
     s.publication_status='public'
     and e.posting_status='posted' and e.is_published is true
   ))
   -- Both R18 rating and warning are protective. Author's own work
   -- exception mirrors draft Reader RLS; all others require opt-in+age.
   and (
     s.author_id=l.actor_id
     or (
       s.content_rating is distinct from 'r18'
       and not ('sexual_r18'=any(coalesce(s.content_warnings,'{}'::text[])))
     )
     or (u.show_r18_content is true and u.r18_confirmed_at is not null)
   )
 )
$f$;
revoke all on function libread_internal.issue137_tus_app_can_insert(text,text)
from public,anon,authenticated,service_role;
grant usage on schema libread_internal to authenticated;
grant execute on function libread_internal.issue137_tus_app_can_insert(text,text)
to authenticated;

-- Defensive restrictive AND policy: an unrelated permissive INSERT cannot
-- authorize an object in the LOCAL test bucket.
create policy issue137_tus_app_allow on storage.objects
as permissive for insert to authenticated
with check(libread_internal.issue137_tus_app_can_insert(bucket_id,name));
create policy issue137_tus_app_insert_fence on storage.objects
as restrictive for insert to authenticated
with check(
 bucket_id<>'f2p-tus-app-authority-local'
 or libread_internal.issue137_tus_app_can_insert(bucket_id,name)
);
create policy issue137_tus_app_update_fence on storage.objects
as restrictive for update to authenticated
using(bucket_id<>'f2p-tus-app-authority-local')
with check(bucket_id<>'f2p-tus-app-authority-local');
create policy issue137_tus_app_delete_fence on storage.objects
as restrictive for delete to authenticated
using(bucket_id<>'f2p-tus-app-authority-local');

create function libread_internal.issue137_tus_app_no_public()
returns trigger language plpgsql security invoker set search_path='' as $f$
begin
 if new.public is distinct from false then
  raise exception using errcode='42501',message='ISSUE137_TEST_APP_TUS_PRIVATE_HOLD';
 end if;
 return new;
end
$f$;
create trigger issue137_tus_app_no_public
before update of public on storage.buckets for each row
when (new.id='f2p-tus-app-authority-local')
execute function libread_internal.issue137_tus_app_no_public();
