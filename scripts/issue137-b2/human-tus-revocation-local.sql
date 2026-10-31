-- Issue #137 TUS investigation: ONLY disposable LOCAL Docker PostgreSQL.
-- NEVER apply to hosted Supabase, migrations, Production, or project branches.
-- A separate PRIVATE bucket isolates test policy from existing recording buckets.
insert into storage.buckets(id,name,public,file_size_limit)
 values ('f2p-tus-revocation-local','f2p-tus-revocation-local',false,16777216);

create table libread_internal.issue137_tus_local_grants (
 actor_id uuid primary key references auth.users(id),
 consent_ok boolean not null default true,
 owner_ok boolean not null default true,
 rights_ok boolean not null default true,
 r18_ok boolean not null default true
);
revoke all on libread_internal.issue137_tus_local_grants from public,anon,authenticated,service_role;

-- In the local fixture only, check fresh DB consent/grants AND live auth.sessions
-- on each SQL RLS evaluation. Whether Storage invokes RLS on every PATCH is what
-- this experiment will measure. A SECURITY DEFINER helper alone does not secure
-- provider REST/S3 alternate paths or validate the bytes themselves.
create function libread_internal.issue137_tus_can_insert(p_bucket text,p_path text)
 returns boolean language sql volatile security definer set search_path='' as $f$
 select p_bucket='f2p-tus-revocation-local'
 and (select auth.uid()) is not null
 and p_path like 'owner/'||(select auth.uid())::text||'/%'
 and exists (
   select 1 from auth.sessions s
   where s.id=nullif((select auth.jwt())->>'session_id','')::uuid
     and s.user_id=(select auth.uid())
 )
 and exists (
   select 1 from libread_internal.issue137_tus_local_grants g
   where g.actor_id=(select auth.uid())
    and g.consent_ok and g.owner_ok and g.rights_ok and g.r18_ok
 )
 and exists (
   select 1 from public.user_recording_consents c
   where c.user_id=(select auth.uid())
     and c.consent_key='recording_studio_global'
     and c.consent_version='2026-04-16'
 )
$f$;
revoke all on function libread_internal.issue137_tus_can_insert(text,text)
 from public,anon,authenticated,service_role;
grant usage on schema libread_internal to authenticated;
grant execute on function libread_internal.issue137_tus_can_insert(text,text)
 to authenticated;

create policy issue137_tus_local_allow on storage.objects as permissive
 for insert to authenticated
 with check (libread_internal.issue137_tus_can_insert(bucket_id,name));
create policy issue137_tus_local_fence on storage.objects as restrictive
 for insert to authenticated
 with check (
   bucket_id<>'f2p-tus-revocation-local'
   or libread_internal.issue137_tus_can_insert(bucket_id,name)
 );
-- No authenticated / anon TUS update or delete for this bucket.
create policy issue137_tus_local_update_fence on storage.objects as restrictive
 for update to authenticated
 using(bucket_id<>'f2p-tus-revocation-local')
 with check(bucket_id<>'f2p-tus-revocation-local');
create policy issue137_tus_local_delete_fence on storage.objects as restrictive
 for delete to authenticated
 using(bucket_id<>'f2p-tus-revocation-local');

create function libread_internal.issue137_tus_no_public() returns trigger
 language plpgsql security invoker set search_path='' as $$
begin
 if new.public is distinct from false then
   raise exception using errcode='42501',message='ISSUE137_LOCAL_TUS_BUCKET_PRIVATE_HOLD';
 end if;
 return new;
end $$;
create trigger issue137_tus_no_public before update of public on storage.buckets
 for each row when (new.id='f2p-tus-revocation-local')
 execute function libread_internal.issue137_tus_no_public();
