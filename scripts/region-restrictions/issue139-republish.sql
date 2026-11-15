-- Issue #139 / D030: re-publish the 8 works with per-country restrictions.
-- Same as scripts/issue139-us104a-unpublish/rollback.sql, plus a guard that
-- the restriction rows from issue139-restrictions.sql exist and are >= 2 min old.
-- Undo: scripts/issue139-us104a-unpublish/apply.sql (makes them private again).
-- Restores the stored publication_status and is_public of the 8 series
-- recorded by apply.sql, then drops the snapshot tables. Chapters were never
-- written by apply.sql; this script checks they are still exactly as
-- recorded, so returning the series to public republishes the same 63
-- chapters and nothing else.
--
-- Aborts (no change) if anything drifted after apply.sql: a series that is
-- no longer private, a different author, or a chapter that was added,
-- removed, renumbered, unposted, scheduled or edited. Resolve that case by
-- hand; do not force it.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- D030 guard: every one of the 8 works must already carry its per-country
-- restriction, written at least 2 minutes ago (the app caches the list for
-- 60 s), before it becomes public again.
do $$ begin
  if (select count(*) from public.series_region_restrictions r
      join libread_internal.issue139_unpublish_series_20261115 t on t.series_id = r.series_id
      where r.decided_at <= now() - interval '2 minutes') <> 8 then
    raise exception 'ISSUE139_REPUBLISH_RESTRICTIONS_MISSING_OR_TOO_NEW';
  end if;
end $$;

select s.id from public.series s
join libread_internal.issue139_unpublish_series_20261115 t on t.series_id = s.id
for update of s;
select e.id from public.episodes e
join libread_internal.issue139_unpublish_series_20261115 t on t.series_id = e.series_id
for update of e;

do $$ begin
  if (select count(*) from libread_internal.issue139_unpublish_series_20261115) <> 8
     or (select count(*) from libread_internal.issue139_unpublish_episodes_20261115) <> 63
     or exists (
       select 1 from libread_internal.issue139_unpublish_series_20261115
       where series_id not in ('8514e9da-7864-4dad-a397-de06abee8fdc',
                               'd5cc7bf2-c76e-49e8-a078-150636fc0344',
                               '4d328931-ca04-4843-bcb5-9ac080cfbbf1',
                               'ac25272b-fc09-4f20-a94a-816791e750d0',
                               '82309887-add7-4406-aa18-d8a435c3b967',
                               'f7ba9cd3-0ede-48df-92d7-2ea297f33475',
                               '833b0303-d034-4ebb-ae6f-e023dd765a64',
                               '4f48c202-3ba1-47cb-b887-90880534c96e'))
     or exists (
       select 1 from libread_internal.issue139_unpublish_episodes_20261115 e
       where e.series_id not in (select series_id from libread_internal.issue139_unpublish_series_20261115))
  then raise exception 'ISSUE139_UNPUBLISH_ROLLBACK_SNAPSHOT_SCOPE_MISMATCH'; end if;

  -- Current state must still be exactly what apply.sql left.
  if exists (
    select 1
    from libread_internal.issue139_unpublish_series_20261115 t
    left join public.series s on s.id = t.series_id
    where s.id is null
       or s.publication_status <> 'private' or s.is_public is distinct from false
       or s.author_id is distinct from t.author_id_before
  ) then raise exception 'ISSUE139_UNPUBLISH_ROLLBACK_SERIES_STATE_DRIFT'; end if;
  if exists (
    select 1
    from libread_internal.issue139_unpublish_episodes_20261115 t
    left join public.episodes e on e.id = t.episode_id
    where e.id is null
       or e.series_id <> t.series_id
       or e.episode_number <> t.episode_number
       or e.posting_status <> t.posting_status_before
       or e.is_published is distinct from t.is_published_before
       or e.scheduled_for is distinct from t.scheduled_for_before
       or e.posted_at is distinct from t.posted_at_before
       or e.last_edited_at is distinct from t.last_edited_at_before
  ) then raise exception 'ISSUE139_UNPUBLISH_ROLLBACK_EPISODE_STATE_DRIFT'; end if;
  if (select count(*) from public.episodes e
      join libread_internal.issue139_unpublish_series_20261115 t on t.series_id = e.series_id) <> 63 then
    raise exception 'ISSUE139_UNPUBLISH_ROLLBACK_EPISODE_SET_CHANGED';
  end if;
end $$;

do $$
declare
  v_series integer;
begin
  update public.series s
    set publication_status = t.publication_status_before,
        is_public = t.is_public_before
  from libread_internal.issue139_unpublish_series_20261115 t
  where s.id = t.series_id
    and s.publication_status = 'private' and s.is_public = false;
  get diagnostics v_series = row_count;
  if v_series <> 8 then
    raise exception 'ISSUE139_UNPUBLISH_ROLLBACK_SERIES_ROWCOUNT_MISMATCH %', v_series;
  end if;

  -- The public read boundary exposes the 8 works again with every chapter.
  if (select count(*) from public.public_episode_work_summaries v
      join libread_internal.issue139_unpublish_series_20261115 t on t.series_id = v.series_id
      where v.episode_count = t.expected_episodes) <> 8 then
    raise exception 'ISSUE139_UNPUBLISH_ROLLBACK_PUBLIC_VIEW_MISMATCH';
  end if;
end $$;

drop table libread_internal.issue139_unpublish_episodes_20261115;
drop table libread_internal.issue139_unpublish_series_20261115;
commit;

-- After commit: RLS, the Work page and the Reader serve the works again at
-- once; the cached catalog / search cards and sitemap list them again
-- within about 60 s (revalidate: 60).
