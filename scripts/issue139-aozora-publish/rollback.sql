-- Issue #139: exact revert of apply.sql (back to private Drafts).
-- Restores every stored previous value (publication_status, is_public,
-- posting_status, is_published, scheduled_for, posted_at, last_edited_at)
-- for the 4 series / 12 episodes recorded by apply.sql, then drops the
-- snapshot tables. Nothing is deleted from public tables: bookmarks, views,
-- reviews, translations or recordings created while public stay in place and
-- become non-public through the existing private/draft read boundary.
--
-- Aborts (no change) if any row was edited after apply.sql: a different
-- posted_at, a set last_edited_at, a scheduled episode or another
-- publication state. Resolve that case by hand; do not force it.
begin;

select s.id from public.series s
join libread_internal.issue139_publish_series_20261115 t on t.series_id = s.id
for update of s;

do $$ begin
  if (select count(*) from libread_internal.issue139_publish_series_20261115) <> 4
     or (select count(*) from libread_internal.issue139_publish_episodes_20261115) <> 12
     or exists (
       select 1 from libread_internal.issue139_publish_series_20261115
       where series_id not in ('e47476bc-07d3-4c65-86a1-78237e3c6948',
                               '6d832ac6-b457-43ff-97ef-50281b337ca3',
                               '7babc9f9-f015-4135-ba92-da0f54864158',
                               'a173c008-3e53-4126-927b-366e44a69b48'))
     or exists (
       select 1 from libread_internal.issue139_publish_episodes_20261115 e
       where e.series_id not in (select series_id from libread_internal.issue139_publish_series_20261115))
  then raise exception 'ISSUE139_ROLLBACK_SNAPSHOT_SCOPE_MISMATCH'; end if;

  -- Current state must still be exactly what apply.sql left.
  if exists (
    select 1
    from libread_internal.issue139_publish_series_20261115 t
    left join public.series s on s.id = t.series_id
    where s.id is null or s.publication_status <> 'public' or s.is_public is distinct from true
  ) then raise exception 'ISSUE139_ROLLBACK_SERIES_STATE_DRIFT'; end if;
  if exists (
    select 1
    from libread_internal.issue139_publish_episodes_20261115 t
    left join public.episodes e on e.id = t.episode_id
    where e.id is null
       or e.series_id <> t.series_id
       or e.posting_status <> 'posted' or e.is_published is distinct from true
       or e.scheduled_for is not null
       or t.posted_at_after is null or e.posted_at is distinct from t.posted_at_after
       or e.last_edited_at is distinct from t.last_edited_at_before
  ) then raise exception 'ISSUE139_ROLLBACK_EPISODE_STATE_DRIFT'; end if;
  if (select count(*) from public.episodes e
      join libread_internal.issue139_publish_series_20261115 t on t.series_id = e.series_id) <> 12 then
    raise exception 'ISSUE139_ROLLBACK_EPISODE_SET_CHANGED';
  end if;
end $$;

do $$
declare
  v_series integer;
  v_episodes integer;
begin
  update public.episodes e
    set posting_status = t.posting_status_before,
        is_published = t.is_published_before,
        scheduled_for = t.scheduled_for_before,
        posted_at = t.posted_at_before,
        last_edited_at = t.last_edited_at_before
  from libread_internal.issue139_publish_episodes_20261115 t
  where e.id = t.episode_id and e.posted_at = t.posted_at_after;
  get diagnostics v_episodes = row_count;
  if v_episodes <> 12 then
    raise exception 'ISSUE139_ROLLBACK_EPISODE_ROWCOUNT_MISMATCH %', v_episodes;
  end if;

  update public.series s
    set publication_status = t.publication_status_before,
        is_public = t.is_public_before
  from libread_internal.issue139_publish_series_20261115 t
  where s.id = t.series_id and s.publication_status = 'public';
  get diagnostics v_series = row_count;
  if v_series <> 4 then
    raise exception 'ISSUE139_ROLLBACK_SERIES_ROWCOUNT_MISMATCH %', v_series;
  end if;

  if exists (select 1 from public.public_episode_work_summaries v
             join libread_internal.issue139_publish_series_20261115 t on t.series_id = v.series_id) then
    raise exception 'ISSUE139_ROLLBACK_STILL_PUBLIC';
  end if;
end $$;

drop table libread_internal.issue139_publish_episodes_20261115;
drop table libread_internal.issue139_publish_series_20261115;
commit;

-- After commit: RLS hides the works and chapters immediately; the cached
-- catalog/search cards and sitemap drop them within 60 s (revalidate: 60).
