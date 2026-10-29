-- Issue #137 B2 DRAFT candidate. Not authorized for hosted/Production execution.
-- Requires independent live policy review, data inventory and explicit release consent.
begin;
create schema if not exists libread_internal;
revoke all on schema libread_internal from public, anon, authenticated;
grant usage on schema libread_internal to anon, authenticated;
create or replace function libread_internal.can_read_r18()
returns boolean language sql stable security definer set search_path = ''
as $$
 select (select auth.uid()) is not null and exists (
   select 1 from public.users u
   where u.id = (select auth.uid())
     and u.show_r18_content is true and u.r18_confirmed_at is not null
 );
$$;
revoke all on function libread_internal.can_read_r18() from public, anon, authenticated;
grant execute on function libread_internal.can_read_r18() to anon, authenticated;

-- Restrictive SELECT policies are ANDed with existing permissive policies;
-- preserve author workspace access even if consumer R18 display is OFF.
alter table public.series enable row level security;
drop policy if exists issue137_b2_series_r18_boundary on public.series;
create policy issue137_b2_series_r18_boundary on public.series
as restrictive for select to anon, authenticated
using (
 author_id = (select auth.uid()) or
 (content_rating is distinct from 'r18'
   and not ('sexual_r18'=any(coalesce(content_warnings,'{}'::text[]))))
 or (select libread_internal.can_read_r18())
);
alter table public.episodes enable row level security;
drop policy if exists issue137_b2_episode_r18_boundary on public.episodes;
create policy issue137_b2_episode_r18_boundary on public.episodes
as restrictive for select to anon, authenticated
using (exists (
 select 1 from public.series s where s.id=episodes.series_id
 and (
   s.author_id=(select auth.uid()) or
   (s.content_rating is distinct from 'r18'
     and not ('sexual_r18'=any(coalesce(s.content_warnings,'{}'::text[]))))
   or (select libread_internal.can_read_r18())
 )
));
alter table public.recordings enable row level security;
drop policy if exists issue137_b2_recordings_r18_boundary on public.recordings;
create policy issue137_b2_recordings_r18_boundary on public.recordings
as restrictive for select to anon, authenticated
using (exists (
 select 1 from public.series s where s.id=recordings.series_id
 and (
   s.author_id=(select auth.uid())
   or (recordings.is_public is distinct from true
     and (
       recordings.reader_user_id=(select auth.uid())
       or recordings.reader_id=(select auth.uid())
     ))
   or (s.content_rating is distinct from 'r18'
     and not ('sexual_r18'=any(coalesce(s.content_warnings,'{}'::text[]))))
   or (select libread_internal.can_read_r18())
 )
));
-- Human translation browser Data API grants stay revoked; defense in depth.
alter table public.episode_human_translations enable row level security;
drop policy if exists issue137_b2_human_translation_r18_boundary on public.episode_human_translations;
create policy issue137_b2_human_translation_r18_boundary
on public.episode_human_translations as restrictive for select to anon, authenticated
using (exists (
 select 1 from public.series s where s.id=episode_human_translations.series_id
 and (
   s.author_id=(select auth.uid())
   or translator_user_id=(select auth.uid())
   or (s.content_rating is distinct from 'r18'
     and not ('sexual_r18'=any(coalesce(s.content_warnings,'{}'::text[]))))
   or (select libread_internal.can_read_r18())
 )
));
-- Never modify the existing public recording-audio bucket.
insert into storage.buckets (id, name, public)
values ('r18-recording-audio','r18-recording-audio',false)
on conflict (id) do nothing;
do $$ begin
 if not exists (select 1 from storage.buckets
   where id='r18-recording-audio' and public is false)
 then raise exception 'B2_PRIVATE_BUCKET_REQUIRED'; end if;
end $$;
create or replace function libread_internal.is_restricted_recording_path(value text)
returns boolean language sql immutable set search_path = ''
as $$
 select value like 'r18-private:%'
   and length(value)>length('r18-private:')
   and value !~ '[?#]' and value !~ '\.\.';
$$;
revoke all on function libread_internal.is_restricted_recording_path(text)
 from public, anon, authenticated;

-- F2 PRIVATE HUMAN CUSTODY: path syntax alone does not confer containment.
-- Do not permit legacy public URLs just because a private twin exists.
create or replace function libread_internal.is_verified_private_human_recording(
 p_path text,p_sid uuid,p_eid uuid,p_reader uuid,
 p_name text,p_voice text,p_alias uuid
) returns boolean language sql stable security definer set search_path=''
as $$
 select p_path is not null and p_sid is not null and p_eid is not null and p_reader is not null
  and nullif(btrim(coalesce(p_voice,'')),'') is null
  and nullif(btrim(coalesce(p_name,'')),'') is not null
  and (p_alias is null or p_alias=p_reader)
  and p_path like ('human/'||p_sid::text||'/'||p_eid::text||'/'||p_reader::text||'/%')
  and p_path ~ '/[a-z0-9-]+/playback-from-[a-z0-9]+[.]m4a$'
  and exists(select 1 from storage.objects o join storage.buckets b on b.id=o.bucket_id
             where b.id='human-recording-audio' and b.public is false and o.name=p_path)
  and not exists(select 1 from storage.objects o
                 where o.bucket_id='recording-audio' and o.name=p_path);
$$;
revoke all on function libread_internal.is_verified_private_human_recording(
 text,uuid,uuid,uuid,text,text,uuid
) from public,anon,authenticated;
-- Prevent unsafe direct PostgREST classification/publication change.
-- Prevent orphaned PUBLIC Storage objects (no recordings row) from defeating
-- a general->R18 transition. Canonical Nemo/Aivis/Human path includes series ID.
create or replace function libread_internal.public_audio_exists_for_series(p_series_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$
 select exists (
  select 1 from storage.objects o where o.bucket_id='recording-audio'
  and (
   o.name like 'nemo/'||p_series_id::text||'/%'
   or o.name like 'aivis/'||p_series_id::text||'/%'
   or o.name like 'human/'||p_series_id::text||'/%'
  )
 );
$$;
revoke all on function libread_internal.public_audio_exists_for_series(uuid)
 from public,anon,authenticated;
create or replace function libread_internal.public_audio_exists_for_episode(sid uuid, eid uuid)
returns boolean language sql stable security definer set search_path=''
as $$
 select exists (
  select 1 from storage.objects o where o.bucket_id='recording-audio'
  and (
   o.name like 'nemo/'||sid::text||'/'||eid::text||'/%'
   or o.name like 'aivis/'||sid::text||'/'||eid::text||'/%'
   or o.name like 'human/'||sid::text||'/'||eid::text||'/%'
  )
 );
$$;
revoke all on function libread_internal.public_audio_exists_for_episode(uuid,uuid)
 from public,anon,authenticated;
create or replace function libread_internal.guard_series_media_transition()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
 if (
  new.publication_status is distinct from 'public'
  or new.content_rating='r18'
  or 'sexual_r18'=any(coalesce(new.content_warnings,'{}'::text[]))
 ) and exists (
  select 1 from public.recordings r where r.series_id=new.id
    and r.audio_storage_path is not null
    and not (libread_internal.is_restricted_recording_path(r.audio_storage_path)
     or libread_internal.is_verified_private_human_recording(
       r.audio_storage_path,r.series_id,r.episode_id,r.reader_id,
       r.reader_name,r.voice_model_id::text,r.reader_user_id))
 ) or (
   (new.publication_status is distinct from 'public'
    or new.content_rating='r18'
    or 'sexual_r18'=any(coalesce(new.content_warnings,'{}'::text[])))
   and libread_internal.public_audio_exists_for_series(new.id)
 ) then
   raise exception using errcode='23514',message='B2_MEDIA_CONTAINMENT_REQUIRED';
 end if;
 return new;
end;
$$;
revoke all on function libread_internal.guard_series_media_transition()
 from public,anon,authenticated;
drop trigger if exists issue137_b2_series_media_transition on public.series;
create trigger issue137_b2_series_media_transition
before update of publication_status,content_rating,content_warnings on public.series
for each row execute function libread_internal.guard_series_media_transition();
create or replace function libread_internal.guard_episode_media_transition()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
 if (new.posting_status is distinct from 'posted'
     or new.is_published is distinct from true)
   and exists (select 1 from public.recordings r where r.episode_id=new.id
     and r.audio_storage_path is not null
     and not (libread_internal.is_restricted_recording_path(r.audio_storage_path)
     or libread_internal.is_verified_private_human_recording(
       r.audio_storage_path,r.series_id,r.episode_id,r.reader_id,
       r.reader_name,r.voice_model_id::text,r.reader_user_id)))
   or ((new.posting_status is distinct from 'posted' or new.is_published is distinct from true)
     and libread_internal.public_audio_exists_for_episode(new.series_id,new.id))
 then raise exception using errcode='23514',message='B2_MEDIA_CONTAINMENT_REQUIRED';
 end if;
 return new;
end;
$$;
revoke all on function libread_internal.guard_episode_media_transition()
 from public,anon,authenticated;
drop trigger if exists issue137_b2_episode_media_transition on public.episodes;
create trigger issue137_b2_episode_media_transition
before update of posting_status,is_published on public.episodes
for each row execute function libread_internal.guard_episode_media_transition();
-- Lock parent against concurrent rating UPDATE while writing media references.
create or replace function libread_internal.guard_recording_media_reference()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare s record; e record;
begin
 select publication_status,content_rating,content_warnings into s
 from public.series where id=new.series_id for share;
 select series_id,posting_status,is_published into e
 from public.episodes where id=new.episode_id for share;
 if s is null or e is null or e.series_id is distinct from new.series_id then
   raise exception using errcode='23514',message='B2_INVALID_MEDIA_REFERENCE';
 end if;
 if new.audio_storage_path is not null
    and not (libread_internal.is_restricted_recording_path(new.audio_storage_path)
     or libread_internal.is_verified_private_human_recording(
       new.audio_storage_path,new.series_id,new.episode_id,new.reader_id,
       new.reader_name,new.voice_model_id::text,new.reader_user_id))
    and (
      s.publication_status is distinct from 'public'
      or e.posting_status is distinct from 'posted'
      or e.is_published is distinct from true
      or s.content_rating='r18'
      or 'sexual_r18'=any(coalesce(s.content_warnings,'{}'::text[]))
    ) then
   raise exception using errcode='23514',message='B2_MEDIA_CONTAINMENT_REQUIRED';
 end if;
 return new;
end;
$$;
revoke all on function libread_internal.guard_recording_media_reference()
 from public,anon,authenticated;
drop trigger if exists issue137_b2_recording_media_reference on public.recordings;
create trigger issue137_b2_recording_media_reference
before insert or update of series_id,episode_id,audio_storage_path,is_public
on public.recordings for each row execute function libread_internal.guard_recording_media_reference();

-- Replace transition guards with orphan-media coverage.

-- No new external public media even if the generator uses service_role,
-- races with a rating change, or never writes a recordings row.
create or replace function libread_internal.guard_public_storage_audio()
returns trigger language plpgsql security definer set search_path=''
as $$
declare sid uuid; eid uuid; s record; e record;
begin
 if tg_op='UPDATE' and old.bucket_id='recording-audio'
    and (new.bucket_id is distinct from old.bucket_id
         or new.name is distinct from old.name) then
   raise exception using errcode='23514',message='B2_PUBLIC_AUDIO_RENAME_HOLD';
 end if;
 -- F2-P: all PUBLIC buckets are potential alternate audio URL origins.
 -- Do not affect unrelated text/image assets or PRIVATE bucket writes.
 -- An old public URL is not retractable; this guards future object metadata.
 if new.bucket_id <> 'recording-audio' then
   if exists (
      select 1 from storage.buckets b
      where b.id=new.bucket_id and b.public is true
   ) and (
      split_part(new.name,'/',1) in ('nemo','aivis','human')
      or new.name ~* '[.](wav|mp3|m4a|aac|flac|ogg|opus|webm)$'
      or coalesce(new.metadata->>'mimetype','') ~* '^audio/'
   ) then
     raise exception using errcode='42501',message='B2_UNMONITORED_PUBLIC_AUDIO_HOLD';
   end if;
   return new;
 end if;
 if split_part(new.name,'/',1) not in ('nemo','aivis','human') then
   raise exception using errcode='42501',message='B2_UNCLASSIFIED_PUBLIC_AUDIO_PATH';
 end if;
 if split_part(new.name,'/',2) !~* '^[a-f0-9-]{36}$'
    or split_part(new.name,'/',3) !~* '^[a-f0-9-]{36}$' then
   raise exception using errcode='23514', message='B2_UNKNOWN_MEDIA_PATH';
 end if;
 sid:=split_part(new.name,'/',2)::uuid;
 eid:=split_part(new.name,'/',3)::uuid;
 select publication_status, content_rating, content_warnings into s
   from public.series where id=sid for share;
 select posting_status, is_published into e
   from public.episodes where id=eid and series_id=sid for share;
 if s is null or e is null
    or s.publication_status is distinct from 'public'
    or s.content_rating='r18'
    or 'sexual_r18'=any(coalesce(s.content_warnings,'{}'::text[]))
    or e.posting_status is distinct from 'posted'
    or e.is_published is distinct from true then
    raise exception using errcode='23514', message='B2_PUBLIC_MEDIA_WRITE_BLOCKED';
 end if;
 return new;
end;
$$;
revoke all on function libread_internal.guard_public_storage_audio()
 from public,anon,authenticated;
drop trigger if exists issue137_b2_public_audio_storage on storage.objects;
create trigger issue137_b2_public_audio_storage
before insert or update of bucket_id,name,metadata on storage.objects
for each row execute function libread_internal.guard_public_storage_audio();

-- The prior trigger only observes episode publication, not reassignment.
-- Treat any reparenting as a HOLD until a separately audited transaction
-- migrates all associated recording/media/timing references atomically.
create or replace function libread_internal.guard_episode_reparenting()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if new.series_id is distinct from old.series_id then
    raise exception using errcode='23514',message='B2_EPISODE_REPARENT_HOLD';
  end if;
  return new;
end;
$$;
revoke all on function libread_internal.guard_episode_reparenting() from public,anon,authenticated;
drop trigger if exists issue137_b2_episode_reparenting on public.episodes;
create trigger issue137_b2_episode_reparenting before update of series_id
on public.episodes for each row execute function libread_internal.guard_episode_reparenting();


-- F1: cache invalidation is a transactional DB property, not a best-effort
-- Next.js revalidateTag race. This SQL is SOURCE ONLY until separately approved.
create table if not exists libread_internal.public_catalog_revision (
 singleton boolean primary key default true check(singleton),
 epoch bigint not null default 1 check(epoch > 0)
);
revoke all on libread_internal.public_catalog_revision from public,anon,authenticated;
insert into libread_internal.public_catalog_revision(singleton,epoch)
values(true,1) on conflict(singleton) do nothing;

-- Only the trusted server's service_role may call this exposed, read-only RPC.
-- Never grant anon/authenticated execute just to make Preview work.
create or replace function public.libread_public_catalog_revision()
returns bigint language sql stable security definer set search_path=''
as $$
 select epoch from libread_internal.public_catalog_revision where singleton=true;
$$;
revoke all on function public.libread_public_catalog_revision() from public,anon,authenticated;
grant execute on function public.libread_public_catalog_revision() to service_role;

create or replace function libread_internal.bump_public_catalog_revision()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
 update libread_internal.public_catalog_revision
 set epoch=epoch+1 where singleton=true;
 return null; -- statement-level trigger; commit is atomic with the source mutation
end;
$$;
revoke all on function libread_internal.bump_public_catalog_revision() from public,anon,authenticated;

-- Statement-level triggers bound lock acquisition to one increment per DML
-- statement instead of O(changed rows). INSERT/DELETE/unpublish and warnings
-- all invalidate; Postgres rollback also rolls back the epoch increment.
drop trigger if exists issue137_b2_series_catalog_revision on public.series;
create trigger issue137_b2_series_catalog_revision
after insert or update or delete on public.series
for each statement execute function libread_internal.bump_public_catalog_revision();
drop trigger if exists issue137_b2_episode_catalog_revision on public.episodes;
create trigger issue137_b2_episode_catalog_revision
after insert or update or delete on public.episodes
for each statement execute function libread_internal.bump_public_catalog_revision();
drop trigger if exists issue137_b2_author_catalog_revision on public.users;
create trigger issue137_b2_author_catalog_revision
after update of display_name on public.users
for each statement execute function libread_internal.bump_public_catalog_revision();

commit;
