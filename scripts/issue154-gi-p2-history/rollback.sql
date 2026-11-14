-- Issue #154 GI-P2: exact revert of apply.sql (adds the stored amounts back).
begin;
update public.series_popularity_daily d
  set view_count = d.view_count + a.removed_views, updated_at = now()
from libread_internal.gi_p2_view_adjustment_20261114 a
where d.series_id = a.series_id and d.bucket_date = a.bucket_date;
drop table libread_internal.gi_p2_view_adjustment_20261114;
commit;
