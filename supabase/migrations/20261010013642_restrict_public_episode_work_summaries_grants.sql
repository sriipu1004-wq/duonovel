-- Child84 post-create least-privilege hardening.
-- Existing Supabase default privileges may directly grant DML even after PUBLIC revoke.
-- The view is read-only by design; clients only require SELECT.
revoke all on public.public_episode_work_summaries from anon, authenticated;
grant select on public.public_episode_work_summaries to anon, authenticated;
