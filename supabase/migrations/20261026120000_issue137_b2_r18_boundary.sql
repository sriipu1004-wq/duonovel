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
    and not libread_internal.is_restricted_recording_path(r.audio_storage_path)
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
     and not libread_internal.is_restricted_recording_path(r.audio_storage_path))
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
    and not libread_internal.is_restricted_recording_path(new.audio_storage_path)
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
 if new.bucket_id <> 'recording-audio' then return new; end if;
 if split_part(new.name,'/',1) not in ('nemo','aivis','human') then
   raise exception using errcode='23514',message='B2_UNCLASSIFIED_PUBLIC_AUDIO_PATH';
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
before insert or update of bucket_id,name on storage.objects
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

commit;
