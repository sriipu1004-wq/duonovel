-- Supabase security-advisor hardening. These helpers are SECURITY INVOKER,
-- but pinning search_path avoids object-shadowing surprises and removes the
-- mutable-search-path warning without changing application behavior.

alter function public.touch_user_series_reviews_updated_at() set search_path = public;
alter function public.set_updated_at() set search_path = public;
alter function public.set_user_series_reactions_updated_at() set search_path = public;
alter function public.to_tokyo_bucket_date(timestamp with time zone) set search_path = public;
alter function public.upsert_series_popularity_daily(text, date, integer, integer, integer, integer) set search_path = public;
alter function public.handle_user_series_reactions_popularity_daily() set search_path = public;
alter function public.handle_user_series_bookmarks_popularity_daily() set search_path = public;
alter function public.handle_series_view_events_popularity_daily() set search_path = public;
alter function public.handle_recording_play_events_popularity_daily() set search_path = public;
