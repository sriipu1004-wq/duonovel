-- Issue #139 (rights) CI fixture (disposable PostgreSQL only, never Production).
-- Runs AFTER scripts/issue139-us104a-unpublish/test-fixture.sql and its
-- apply.sql, so the 8 works are private exactly as in Production after PR #210.
-- Adds the recordings columns, the H1 trigger and a minimal storage schema as
-- read from Production on 2026-11-15, and seeds 330 target narration rows
-- (630 + 30 = 660 objects) plus non-target rows that must stay untouched.
alter table public.recordings
  add column audio_storage_path text,
  add column voice_model_id uuid,
  add column reader_id uuid,
  add column reader_user_id uuid,
  add column reader_name text;

-- Production trigger (libread_internal.h1_guard_human_mutation), verbatim
-- logic: only Human-looking rows (no voice model, a /human path segment) are
-- guarded; the narration rows here must pass through it.
create or replace function libread_internal.h1_guard_human_mutation()
returns trigger language plpgsql set search_path to '' as $f$
declare
  before_guarded boolean := false;
  after_guarded boolean := false;
begin
  if TG_OP <> 'INSERT' then
    before_guarded := nullif(btrim(coalesce(old.voice_model_id::text,'')),'') is null
      and ('/' || coalesce(old.audio_storage_path,'') like '%/human/%'
        or '/' || coalesce(old.audio_storage_path,'') like '%/human');
  end if;
  if TG_OP <> 'DELETE' then
    after_guarded := nullif(btrim(coalesce(new.voice_model_id::text,'')),'') is null
      and ('/' || coalesce(new.audio_storage_path,'') like '%/human/%'
        or '/' || coalesce(new.audio_storage_path,'') like '%/human');
  end if;
  if (before_guarded or after_guarded)
     and pg_catalog.current_setting('libread.h1_atomic_scope', true) is null then
    raise exception using errcode = 'P0001', message = 'H1_ATOMIC_RPC_REQUIRED';
  end if;
  return case when TG_OP = 'DELETE' then old else new end;
end $f$;

create table ci.audio_targets as
  select series_id from libread_internal.issue139_unpublish_series_20261115;

-- 330 target rows: the 63 existing ones + 4 more per chapter + 15 more.
insert into public.recordings (series_id, episode_id)
select e.series_id, e.id from public.episodes e cross join generate_series(1, 4)
where e.series_id in (select series_id from ci.audio_targets);
insert into public.recordings (series_id, episode_id)
select e.series_id, e.id from public.episodes e
where e.series_id in (select series_id from ci.audio_targets)
order by e.id limit 15;
update public.recordings r set
  audio_storage_path = 'https://nyxbnccuvmlzffgtdadi.supabase.co/storage/v1/object/public/recording-audio/'
    || case when x.n % 3 = 0 then 'nemo' else 'aivis' end || '/' || r.series_id || '/' || r.episode_id
    || '/' || replace(r.id::text, '-', '') || '.wav',
  voice_model_id = case when x.n % 22 = 0 then null else '485f12bc-ac34-4262-ae12-2301f1b4ce95'::uuid end,
  reader_id = '11111111-1111-4111-8111-111111111111',
  reader_name = 'AI ' || (x.n % 5)
from (select id, row_number() over (order by id) n from public.recordings) x
where x.id = r.id;

create trigger issue137_h1_human_atomic_guard
  before insert or delete or update on public.recordings
  for each row execute function libread_internal.h1_guard_human_mutation();

-- Non-targets: a public-bucket AI row and a Human row of another work.
insert into public.recordings (series_id, episode_id, audio_storage_path, voice_model_id, reader_id, reader_name)
select '00000000-0000-4000-8000-0000000000a1', e.id,
  'https://nyxbnccuvmlzffgtdadi.supabase.co/storage/v1/object/public/recording-audio/aivis/00000000-0000-4000-8000-0000000000a1/'
    || e.id || '/n.wav',
  '485f12bc-ac34-4262-ae12-2301f1b4ce95', '11111111-1111-4111-8111-111111111111', 'AI'
from public.episodes e where e.series_id = '00000000-0000-4000-8000-0000000000a1' and e.episode_number = 1;
set libread.h1_atomic_scope = 'fixture';
insert into public.recordings (series_id, episode_id, audio_storage_path, reader_id, reader_name)
select '00000000-0000-4000-8000-0000000000a3', e.id,
  'u/human/' || e.id || '/take.m4a', '22222222-2222-4222-8222-222222222222', 'H'
from public.episodes e where e.series_id = '00000000-0000-4000-8000-0000000000a3';
reset libread.h1_atomic_scope;

create schema storage;
create table storage.buckets (id text primary key, public boolean not null);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null references storage.buckets(id),
  name text not null,
  metadata jsonb,
  unique (bucket_id, name)
);
insert into storage.buckets values ('recording-audio', true), ('ai-narration-private', false);

-- Originals: wav + timing.json per row (sizes differ per object).
create table ci.target_object_list as
select o.name, o.size
from public.recordings r
cross join lateral (
  select substr(r.audio_storage_path, length('https://nyxbnccuvmlzffgtdadi.supabase.co/storage/v1/object/public/recording-audio/') + 1) p
) x
cross join lateral (values (x.p, 1000000 + length(r.id::text) * 7 + ascii(substr(r.id::text, 1, 1))),
                           (regexp_replace(x.p, '\.wav$', '.timing.json'), 2000 + ascii(substr(r.id::text, 2, 1)))) o(name, size)
where r.series_id in (select series_id from ci.audio_targets);

insert into storage.objects (bucket_id, name, metadata)
select 'recording-audio', name, jsonb_build_object('size', size) from ci.target_object_list;
insert into storage.objects (bucket_id, name, metadata)
select 'recording-audio',
  substr(r.audio_storage_path, length('https://nyxbnccuvmlzffgtdadi.supabase.co/storage/v1/object/public/recording-audio/') + 1),
  '{"size": 5}'
from public.recordings r where r.series_id = '00000000-0000-4000-8000-0000000000a1';

create table ci.recordings_before as select * from public.recordings;
