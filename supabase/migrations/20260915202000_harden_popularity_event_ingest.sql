-- Popularity events feed ranking counters through INSERT triggers. They must not
-- be directly writable with the public Supabase key because a caller could forge
-- arbitrary session ids and inflate views / narration plays without passing the
-- server-side canonicalization and de-duplication in /api/popularity/events.

begin;

drop policy if exists "series_view_events_insert_public" on public.series_view_events;
drop policy if exists "recording_play_events_insert_public" on public.recording_play_events;

revoke insert, update, delete, truncate, references, trigger
  on table public.series_view_events
  from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger
  on table public.recording_play_events
  from anon, authenticated;

-- The daily aggregate is public read-only data. Its trigger functions run under
-- trusted database/server paths; browser roles never need mutation privileges.
revoke insert, update, delete, truncate, references, trigger
  on table public.series_popularity_daily
  from anon, authenticated;
grant select on table public.series_popularity_daily to anon, authenticated;

commit;
