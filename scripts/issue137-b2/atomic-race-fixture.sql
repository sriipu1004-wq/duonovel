-- Issue #137 B2: DISPOSABLE LOCAL-ONLY concurrency experiment, not a product migration.
-- Loaded into the ephemeral, unlinked Supabase instance BEFORE the B2 SQL.
-- Models a possible durable owner/episode generation protocol on the fixture.
-- Direct service-role writes still bypass this opt-in RPC: this is NOT a solution.
create table public.issue137_b2_race_generation (
 series_id uuid not null, episode_id uuid not null, owner_id uuid not null,
 generation bigint not null default 0 check (generation >= 0),
 primary key (series_id, episode_id, owner_id)
);
alter table public.issue137_b2_race_generation enable row level security;
revoke all on public.issue137_b2_race_generation from public, anon, authenticated;
grant select, insert, update on public.issue137_b2_race_generation to service_role;

create function public.issue137_b2_race_commit(
 p_series_id uuid, p_episode_id uuid, p_owner_id uuid,
 p_expected_generation bigint, p_recording_id uuid, p_action text,
 p_is_public boolean default null, p_alias_id uuid default null,
 p_hold_ms integer default 0
) returns bigint
language plpgsql security invoker set search_path = ''
as $$
declare
 current_generation bigint;
 affected integer;
begin
 if p_expected_generation < 0 or p_hold_ms < 0 or p_hold_ms > 1000
    or p_action not in ('insert', 'visibility', 'replace', 'alias', 'delete') then
   raise exception using errcode='P0001', message='B2_RACE_BAD_INPUT';
 end if;
 -- The absent-scope case must be serialized too; the row survives DELETE.
 insert into public.issue137_b2_race_generation(series_id,episode_id,owner_id)
 values(p_series_id,p_episode_id,p_owner_id)
 on conflict do nothing;
 select generation into current_generation
 from public.issue137_b2_race_generation
 where series_id=p_series_id and episode_id=p_episode_id and owner_id=p_owner_id
 for update;
 if current_generation is distinct from p_expected_generation then
   raise exception using errcode='P0001', message='B2_RACE_STALE_GENERATION';
 end if;
 -- Test-only bounded hold forces two independent HTTP transactions to overlap.
 if p_hold_ms > 0 then
   perform pg_catalog.pg_sleep(p_hold_ms::double precision / 1000.0);
 end if;
 -- A public-take replacement must not bypass a separate private take.
 -- This is a conservative LOCAL experiment, not an adopted publication policy.
 if p_action = 'replace' and exists (
   select 1 from public.recordings r
   where r.series_id=p_series_id and r.episode_id=p_episode_id
     and (r.reader_id=p_owner_id or r.reader_user_id=p_owner_id)
     and r.id<>p_recording_id
     and r.is_public is distinct from true
 ) then
   raise exception using errcode='P0001',message='B2_RACE_PRIVATE_ROW';
 end if;
 if p_action = 'insert' then
   if p_is_public is null then
     raise exception using errcode='P0001', message='B2_RACE_BAD_INPUT';
   end if;
   if p_is_public and exists(
      select 1 from public.recordings r
      where r.series_id=p_series_id and r.episode_id=p_episode_id
        and (r.reader_id=p_owner_id or r.reader_user_id=p_owner_id)
        and r.is_public is distinct from true
   ) then
     raise exception using errcode='P0001', message='B2_RACE_PRIVATE_ROW';
   end if;
   insert into public.recordings(
     id,series_id,episode_id,reader_id,reader_user_id,reader_name,
     voice_model_id,is_public,audio_storage_path
   ) values (
     p_recording_id,p_series_id,p_episode_id,p_owner_id,p_owner_id,
     'Synthetic Human Reader',null,p_is_public,
     'human/'||p_series_id::text||'/'||p_episode_id::text||'/'||
       p_owner_id::text||'/'||p_recording_id::text||'/playback-from-mp3.m4a'
   );
 else
   if p_action = 'visibility' then
     if p_is_public is null then
       raise exception using errcode='P0001', message='B2_RACE_BAD_INPUT';
     end if;
     update public.recordings set is_public=p_is_public
      where id=p_recording_id and series_id=p_series_id
       and episode_id=p_episode_id and reader_id=p_owner_id
       and (reader_user_id is null or reader_user_id=p_owner_id);
   elsif p_action = 'alias' then
     if p_alias_id is null then
       raise exception using errcode='P0001', message='B2_RACE_BAD_INPUT';
     end if;
     update public.recordings set reader_user_id=p_alias_id
      where id=p_recording_id and series_id=p_series_id
       and episode_id=p_episode_id and reader_id=p_owner_id;
   elsif p_action = 'replace' then
     update public.recordings
       set audio_storage_path='human/'||p_series_id::text||'/'||
         p_episode_id::text||'/'||p_owner_id::text||'/'||
         p_recording_id::text||'-replacement/playback-from-mp3.m4a'
      where id=p_recording_id and series_id=p_series_id
       and episode_id=p_episode_id and reader_id=p_owner_id
       and (reader_user_id is null or reader_user_id=p_owner_id)
       and is_public=true;
   elsif p_action = 'delete' then
     delete from public.recordings
      where id=p_recording_id and series_id=p_series_id
       and episode_id=p_episode_id and reader_id=p_owner_id
       and (reader_user_id is null or reader_user_id=p_owner_id);
   end if;
   get diagnostics affected = row_count;
   if affected <> 1 then
     raise exception using errcode='P0001', message='B2_RACE_OWNER_OR_ROW_CONFLICT';
   end if;
 end if;
 update public.issue137_b2_race_generation set generation=generation+1
 where series_id=p_series_id and episode_id=p_episode_id and owner_id=p_owner_id;
 return current_generation+1;
end;
$$;
revoke all on function public.issue137_b2_race_commit(
 uuid,uuid,uuid,bigint,uuid,text,boolean,uuid,integer
) from public, anon, authenticated;
grant execute on function public.issue137_b2_race_commit(
 uuid,uuid,uuid,bigint,uuid,text,boolean,uuid,integer
) to service_role;
