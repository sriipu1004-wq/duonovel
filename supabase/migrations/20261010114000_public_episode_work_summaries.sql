-- Child84: summarize only posted, published episodes belonging to public series.
-- security_invoker is required: RLS on public.series and public.episodes
-- must continue to apply to both anonymous and authenticated callers.
create view public.public_episode_work_summaries
with (security_invoker = true)
as
select
  e.series_id,
  count(*)::integer as episode_count,
  (array_agg(e.id order by e.episode_number asc, e.id asc))[1] as first_episode_id,
  (array_agg(e.episode_number order by e.episode_number asc, e.id asc))[1] as first_episode_number,
  (array_agg(e.posted_at order by e.episode_number asc, e.id asc))[1] as first_posted_at,
  (array_agg(e.posted_at order by e.episode_number desc, e.id desc))[1] as latest_posted_at,
  coalesce(
    array_agg(e.episode_number order by e.episode_number asc, e.id asc)
      filter (where e.episode_number > 0),
    array[]::integer[]
  ) as public_episode_numbers
from public.episodes e
join public.series s on s.id = e.series_id
where s.publication_status = 'public'
  and e.posting_status = 'posted'
  and e.is_published = true
group by e.series_id;

-- Explicit Data API exposure: avoid relying on database default privileges.
revoke all on public.public_episode_work_summaries from public;
grant select on public.public_episode_work_summaries to anon, authenticated;

comment on view public.public_episode_work_summaries is
  'Public series posted/published episode metadata summary. security_invoker preserves source-table RLS; no body or private work content.';
