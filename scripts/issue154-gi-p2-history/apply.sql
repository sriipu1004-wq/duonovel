-- Issue #154 GI-P2: subtract the 2026-10-26..28 UTC view-event burst from the
-- daily popularity aggregate. Events in series_view_events are NOT deleted
-- (raw evidence kept). Every subtracted amount is stored first so the change
-- can be reverted exactly with rollback.sql. Run once, in one transaction.
begin;
create schema if not exists libread_internal;
create table libread_internal.gi_p2_view_adjustment_20261114 (
  series_id text not null,
  bucket_date date not null,
  removed_views integer not null check (removed_views > 0),
  view_count_before integer not null,
  primary key (series_id, bucket_date)
);
alter table libread_internal.gi_p2_view_adjustment_20261114 enable row level security;
revoke all on libread_internal.gi_p2_view_adjustment_20261114 from public, anon, authenticated;

insert into libread_internal.gi_p2_view_adjustment_20261114
  (series_id, bucket_date, removed_views, view_count_before)
select rm.sid, rm.b, rm.n, d.view_count
from (
  select series_id::text sid, public.to_tokyo_bucket_date(created_at) b, count(*)::int n
  from public.series_view_events
  where created_at >= '2026-10-26T00:00Z' and created_at < '2026-10-29T00:00Z'
  group by 1, 2
) rm
join public.series_popularity_daily d on d.series_id = rm.sid and d.bucket_date = rm.b;

-- Guards: expected scope from the 2026-11-14 dry run; abort on drift.
do $$ begin
  if (select count(*) from libread_internal.gi_p2_view_adjustment_20261114) <> 193
     or (select sum(removed_views) from libread_internal.gi_p2_view_adjustment_20261114) <> 3776
     or exists (select 1 from libread_internal.gi_p2_view_adjustment_20261114 where removed_views > view_count_before)
  then raise exception 'GI_P2_ADJUSTMENT_SCOPE_DRIFT'; end if;
end $$;

do $$
declare
  v_total_before bigint;
  v_updated integer;
begin
  -- Sum only the affected (series, day) rows so concurrent new views on
  -- today's bucket cannot change the delta.
  select sum(d.view_count) into v_total_before
  from public.series_popularity_daily d
  join libread_internal.gi_p2_view_adjustment_20261114 a
    on d.series_id = a.series_id and d.bucket_date = a.bucket_date;
  update public.series_popularity_daily d
    set view_count = d.view_count - a.removed_views, updated_at = now()
  from libread_internal.gi_p2_view_adjustment_20261114 a
  where d.series_id = a.series_id and d.bucket_date = a.bucket_date
    and d.view_count = a.view_count_before;
  get diagnostics v_updated = row_count;
  -- Every stored row must be updated exactly once (no silent skips).
  if v_updated <> 193 then
    raise exception 'GI_P2_ADJUSTMENT_ROWCOUNT_MISMATCH %', v_updated;
  end if;
  if (select sum(d.view_count)
      from public.series_popularity_daily d
      join libread_internal.gi_p2_view_adjustment_20261114 a
        on d.series_id = a.series_id and d.bucket_date = a.bucket_date) <> v_total_before - 3776 then
    raise exception 'GI_P2_ADJUSTMENT_TOTAL_MISMATCH';
  end if;
end $$;
commit;
