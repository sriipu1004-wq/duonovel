-- #137 NONPRODUCTION ONLY: selected LIVE read-only catalog CHECK/FK/UNIQUE
-- shapes reproduced *only* after local disposable fixture creation.
-- Not a complete schema dump, not a Production migration, no real data.
-- R0_EPHEMERAL_CONFIRM gate is enforced by the one-migration renderer.
-- Current source: pg_constraint hosted READ-ONLY inspection 2026-11-03.
do $local_gate$
begin
 if not exists (select 1 from libread_r0_disposable.sentinel
   where id is true and purpose='SYNTHETIC-R0-ONLY') then
   raise exception 'ISSUE137_NO_LOCAL_SENTINEL' using errcode='42501';
 end if;
end $local_gate$;
-- The first-stage synthetic fixture *already* created an automatically
-- named series_author_id_fkey referencing auth.users. Require exactly that
-- disposable-only mismatch, and correct it to the LIVE public.users FK.
-- Never run this fixture overlay against a real or linked Supabase project.
do $assert_synthetic_old_fk$
declare fk text;
begin
 select pg_get_constraintdef(oid) into fk from pg_constraint
 where conrelid='public.series'::regclass
   and conname='series_author_id_fkey';
 if fk is null or fk not like '%REFERENCES auth.users(id)%' then
  raise exception 'ISSUE137_NOT_THE_EXPECTED_LOCAL_FK' using errcode='42501';
 end if;
end $assert_synthetic_old_fk$;
alter table public.series drop constraint series_author_id_fkey;
alter table public.series
 add constraint series_author_id_fkey
 foreign key(author_id) references public.users(id);
-- Actual hosted recordings.reader_id / reader_user_id refer to public.users.
create table public.voice_models(id uuid primary key);
alter table public.voice_models enable row level security;
revoke all on public.voice_models from public, anon, authenticated;
alter table public.recordings
 add constraint recordings_reader_id_fkey
 foreign key(reader_id) references public.users(id);
alter table public.recordings
 add constraint recordings_reader_user_id_fkey
 foreign key(reader_user_id) references public.users(id) on delete set null;
alter table public.recordings
 add constraint recordings_voice_model_id_fkey
 foreign key(voice_model_id) references public.voice_models(id);
alter table public.series
 add constraint series_publication_status_check
 check (publication_status = any(array['private'::text,'public'::text]));
alter table public.series
 add constraint series_content_rating_check
 check (content_rating = any(array['general'::text,'r18'::text]));
alter table public.series
 add constraint series_content_warnings_check
 check (content_warnings <@ array['sexual_r18'::text,'violence'::text]);
alter table public.series
 add constraint series_content_warning_locks_check
 check (content_warning_locks <@ array['sexual_r18'::text,'violence'::text]
   and content_warning_locks <@ content_warnings);
alter table public.series
 add constraint series_recording_permission_mode_check
 check (recording_permission_mode = any(
  array['open'::text,'closed'::text,'approval_required'::text]));
alter table public.episodes
 add constraint episodes_posting_status_check
 check (posting_status = any(array['draft'::text,'scheduled'::text,'posted'::text]));
alter table public.episodes
 add constraint episodes_scheduled_for_consistency_check
 check ((posting_status='scheduled' and scheduled_for is not null)
   or (posting_status=any(array['draft'::text,'posted'::text])
      and scheduled_for is null));
alter table public.episodes
 add constraint episodes_series_id_episode_number_key
 unique(series_id,episode_number);
