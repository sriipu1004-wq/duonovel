-- Issue #137 F2-P: disposable LOCAL DB/Storage adapter ONLY.
-- Loaded by run-local.sh AFTER unlinked localhost Supabase startup.
-- DO NOT copy to supabase/migrations, run against hosted SQL or expose publicly.
create schema if not exists libread_internal;
revoke all on schema libread_internal from public, anon, authenticated;
create table libread_internal.issue137_f2p_private_candidates(
 id uuid primary key,
 actor_id uuid not null,
 session_id uuid not null,
 session_active boolean not null default true,
 writer_permission boolean not null default true,
 kind text not null check(kind in ('ai-recording','human-recording','site-bgm')),
 stage_bucket text not null,
 stage_path text not null,
 stage_object_id uuid not null,
 stage_sha256 text not null check(stage_sha256 ~ '^[0-9a-f]{64}$'),
 owner_verified boolean not null default true,
 rights_approved boolean not null default true,
 rights_withdrawn boolean not null default false,
 r18_effective boolean not null default false,
 publication text not null default 'public',
 episode_posted boolean not null default true,
 episode_published boolean not null default true,
 episode_matches boolean not null default true,
 human_consent_current boolean not null default true,
 ai_provenance_verified boolean not null default true,
 bgm_catalog_verified boolean not null default true,
 pointer_revision bigint not null default 0 check(pointer_revision >= 0),
 private_audio_path text,
 unique(stage_bucket,stage_path)
);
create table libread_internal.issue137_f2p_consumed_nonces(
 candidate_id uuid not null references libread_internal.issue137_f2p_private_candidates(id),
 nonce uuid not null,
 primary key(candidate_id,nonce)
);
revoke all on libread_internal.issue137_f2p_private_candidates from public,anon,authenticated;
revoke all on libread_internal.issue137_f2p_consumed_nonces from public,anon,authenticated;
-- Synthetic staging bucket: block all same-key metadata replacement or delete,
-- including privileged local S3/REST object row updates. This is LOCAL defense
-- for this fixture only; it is NOT full proof of backend byte immutability.
create or replace function libread_internal.issue137_f2p_stage_immutable()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if old.bucket_id='f2p-local-private-stage' then
  raise exception using errcode='42501',message='F2P_LOCAL_STAGE_IMMUTABLE';
 end if;
 return coalesce(new,old);
end
$$;
create trigger issue137_f2p_local_immutable_before_update
 before update on storage.objects for each row
 execute function libread_internal.issue137_f2p_stage_immutable();
create trigger issue137_f2p_local_immutable_before_delete
 before delete on storage.objects for each row
 execute function libread_internal.issue137_f2p_stage_immutable();
-- Storage bucket publicity protection is part of the local synthetic stage:
-- no accidentally changing its visibility after a candidate is created.
create or replace function libread_internal.issue137_f2p_stage_private()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if old.id='f2p-local-private-stage' and new.public is distinct from false then
  raise exception using errcode='42501',message='F2P_LOCAL_PUBLICITY_HOLD';
 end if;
 return new;
end
$$;
create trigger issue137_f2p_local_bucket_publicity
 before update on storage.buckets for each row
 execute function libread_internal.issue137_f2p_stage_private();

-- One invocation = one real PostgreSQL transaction under row/Storage locks.
-- Authentication and byte SHA/decode must be verified by a trusted server
-- independently before calling this service-role-only local RPC.
create or replace function public.issue137_f2p_local_private_commit(
 p_id uuid, p_actor_id uuid, p_session_id uuid,
 p_expected_revision bigint, p_nonce uuid,
 p_stage_bucket text, p_stage_path text,
 p_stage_object_id uuid, p_sha256 text,
 p_fail_after_update boolean default false
) returns bigint language plpgsql security invoker
set search_path='' as $$
declare
 c libread_internal.issue137_f2p_private_candidates%rowtype;
 o storage.objects%rowtype;
 b storage.buckets%rowtype;
 rev bigint;
begin
 select * into c from libread_internal.issue137_f2p_private_candidates
  where id=p_id for update;
 if not found then raise exception using errcode='42501',message='F2P_CANDIDATE_MISSING'; end if;
 if c.actor_id is distinct from p_actor_id or c.session_id is distinct from p_session_id
  or not c.session_active or not c.writer_permission then
  raise exception using errcode='42501',message='F2P_REVOKED'; end if;
 if not c.rights_approved or c.rights_withdrawn then
  raise exception using errcode='42501',message='F2P_RIGHTS'; end if;
 if c.r18_effective then
  raise exception using errcode='42501',message='F2P_R18'; end if;
 if not c.owner_verified then
  raise exception using errcode='42501',message='F2P_OWNER'; end if;
 if c.kind='human-recording' and not c.human_consent_current then
  raise exception using errcode='42501',message='F2P_CONSENT'; end if;
 if c.kind='ai-recording' and not c.ai_provenance_verified then
  raise exception using errcode='42501',message='F2P_PROVENANCE'; end if;
 if c.kind='site-bgm' then
  if not c.bgm_catalog_verified then
   raise exception using errcode='42501',message='F2P_BGM'; end if;
 else
  if c.publication <> 'public' or not c.episode_posted
   or not c.episode_published or not c.episode_matches then
   raise exception using errcode='42501',message='F2P_PUBLICATION'; end if;
 end if;
 if c.pointer_revision is distinct from p_expected_revision then
  raise exception using errcode='40001',message='F2P_STALE_REVISION'; end if;
 if c.stage_bucket is distinct from p_stage_bucket or c.stage_path is distinct from p_stage_path
  or c.stage_object_id is distinct from p_stage_object_id
  or c.stage_sha256 is distinct from p_sha256 then
  raise exception using errcode='42501',message='F2P_STAGE_CHANGED'; end if;
 -- Lock authoritative bucket/object rows; do not rely on caller's MIME/flags.
 select * into b from storage.buckets where id=c.stage_bucket for share;
 if not found or b.public is distinct from false then
  raise exception using errcode='42501',message='F2P_BUCKET_PUBLIC'; end if;
 select * into o from storage.objects
  where bucket_id=c.stage_bucket and name=c.stage_path and id=c.stage_object_id for share;
 if not found then
  raise exception using errcode='42501',message='F2P_OBJECT_MISSING'; end if;
 if exists(select 1 from libread_internal.issue137_f2p_consumed_nonces
           where candidate_id=p_id and nonce=p_nonce) then
  raise exception using errcode='23505',message='F2P_REPLAY'; end if;
 if c.pointer_revision = 9223372036854775807 then
  raise exception using errcode='22003',message='F2P_REVISION_OVERFLOW'; end if;
 insert into libread_internal.issue137_f2p_consumed_nonces(candidate_id,nonce)
 values(p_id,p_nonce);
 update libread_internal.issue137_f2p_private_candidates
  set pointer_revision=pointer_revision+1,private_audio_path=stage_path where id=p_id
  returning pointer_revision into rev;
 if p_fail_after_update then
  raise exception using errcode='P0001',message='F2P_LOCAL_INJECTED_ROLLBACK'; end if;
 return rev;
end
$$;
revoke all on function public.issue137_f2p_local_private_commit(
 uuid,uuid,uuid,bigint,uuid,text,text,uuid,text,boolean)
 from public,anon,authenticated;
grant execute on function public.issue137_f2p_local_private_commit(
 uuid,uuid,uuid,bigint,uuid,text,text,uuid,text,boolean) to service_role;
