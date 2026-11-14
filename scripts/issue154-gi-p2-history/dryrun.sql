-- Issue #154 GI-P2: READ-ONLY impact of removing 2026-10-26..28 UTC view events
-- (AI crawler meta-externalagent burst, GI-P1) from series_popularity_daily.
with rm as (
  select series_id::text sid, public.to_tokyo_bucket_date(created_at) b, count(*) n
  from public.series_view_events
  where created_at >= '2026-10-26T00:00Z' and created_at < '2026-10-29T00:00Z'
  group by 1, 2)
select count(*) daily_rows_touched, sum(n) views_removed,
  (select count(*) from rm join public.series_popularity_daily d
     on d.series_id = rm.sid and d.bucket_date = rm.b where d.view_count < rm.n) rows_would_go_negative
from rm;
