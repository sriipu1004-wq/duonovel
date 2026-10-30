-- Issue #137 F2-P: local-only provider-side Storage RLS broker fence.
-- DO NOT APPLY TO HOSTED SUPABASE / supabase/migrations.
-- Requires local human-one-shot-broker-local.sql already loaded.
-- A separate synthetic authenticated GoTrue user with server-owned
-- app_metadata.libread_local_broker=true (not editable user_metadata)
-- is the ONLY Storage INSERT principal for this PRIVATE bucket.
-- No service-role or generated S3 key is used for the successful PUT.
insert into storage.buckets(id,name,public)
values ('f2p-broker-private-stage','f2p-broker-private-stage',false);

create table libread_internal.issue137_human_broker_local_identity(
  user_id uuid primary key references auth.users(id)
);
revoke all on libread_internal.issue137_human_broker_local_identity
  from public,anon,authenticated,service_role;

-- RLS requires the helper to read unexposed private permit/session tables.
-- SECURITY DEFINER is deliberate TEST ONLY; not a production-ready pattern.
-- Path scoped, returns only bool, never grants modification of any table.
create function libread_internal.issue137_human_broker_can_insert(
 p_bucket text,p_name text
) returns boolean language sql stable security definer set search_path='' as $$
 select p_bucket='f2p-broker-private-stage'
 and (select auth.jwt()->>'role')='authenticated'
 and (select auth.jwt()->'app_metadata'->>'libread_local_broker')='true'
 and exists(
  select 1
   from libread_internal.issue137_human_broker_local_identity b
  where b.user_id=(select auth.uid())
 )
 and exists(
  select 1 from libread_internal.issue137_human_broker_permits p
  join libread_internal.issue137_human_broker_grants g
    on g.actor_id=p.actor_id
  join auth.sessions s on s.id=p.session_id and s.user_id=p.actor_id
  where p_name='owner/'||p.actor_id::text||'/'||p.object_id::text||'.wav'
   and p.claimed_at is not null
   and p.expires_at>clock_timestamp()
   and g.recording_consent and g.owner_allowed and g.rights_allowed
 )
$$;
revoke all on function libread_internal.issue137_human_broker_can_insert(text,text)
 from public,anon,authenticated,service_role;
grant usage on schema libread_internal to authenticated;
grant execute on function libread_internal.issue137_human_broker_can_insert(text,text)
 to authenticated;

-- Storage INSERT policy is permissive ONLY for broker JWT. Restrictive policy
-- ensures other permissive policies cannot open this new bucket to owner JWT.
create policy issue137_human_broker_private_insert
on storage.objects as permissive for insert to authenticated
with check (
  libread_internal.issue137_human_broker_can_insert(bucket_id,name)
);
create policy issue137_human_broker_private_insert_fence
on storage.objects as restrictive for insert to authenticated
with check(
 bucket_id<>'f2p-broker-private-stage'
 or libread_internal.issue137_human_broker_can_insert(bucket_id,name)
);
-- Ordinary owner JWT may read his own private object ONLY, not upload.
create policy issue137_human_broker_private_read
on storage.objects as permissive for select to authenticated
using(
 bucket_id='f2p-broker-private-stage'
 and name like 'owner/'||(select auth.uid())::text||'/%'
);
create policy issue137_human_broker_private_read_fence
on storage.objects as restrictive for select to authenticated
using(
 bucket_id<>'f2p-broker-private-stage'
 or name like 'owner/'||(select auth.uid())::text||'/%'
);
-- No user modification or deletion of any object in this new fixture bucket,
-- regardless of other permissive UPDATE/DELETE policies in the local instance.
create policy issue137_human_broker_private_update_fence
on storage.objects as restrictive for update to authenticated
using(bucket_id<>'f2p-broker-private-stage')
with check(bucket_id<>'f2p-broker-private-stage');
create policy issue137_human_broker_private_delete_fence
on storage.objects as restrictive for delete to authenticated
using(bucket_id<>'f2p-broker-private-stage');

-- Never allow a publicity flip in this disposable bucket, even via local
-- privileged bucket REST metadata; this does not restrict external keys.
create function libread_internal.issue137_human_broker_no_public()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.public is distinct from false then
  raise exception using errcode='42501',message='F2P_BROKER_BUCKET_PUBLIC_HOLD';
 end if;
 return new;
end $$;
create trigger issue137_human_broker_no_public
before update of public on storage.buckets for each row
when (new.id='f2p-broker-private-stage')
execute function libread_internal.issue137_human_broker_no_public();
