-- P9: exact revert of apply.sql. Restores series.description of the 168
-- works and the one fixed series.title from libread_internal.p9_synopses_20261115,
-- then drops the snapshot table. Aborts (no change) if anything was edited
-- after apply.sql: a description or title that is no longer exactly what
-- apply.sql wrote, or a snapshot that is not the expected rows. Resolve that
-- case by hand; do not force it.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

select s.id from public.series s
join libread_internal.p9_synopses_20261115 t on t.series_id = s.id
for update of s;

do $$ begin
  if (select count(*) from libread_internal.p9_synopses_20261115) <> 168
     or (select count(*) from libread_internal.p9_synopses_20261115 where title_after is distinct from title_before) <> 1
     or not exists (select 1 from libread_internal.p9_synopses_20261115 where series_id = 'c8c0d8f9-7ecd-410b-b64d-90ab89fbfba5'::uuid
                    and title_before = '虜美人草・夏目漱石' and title_after = '虞美人草・夏目漱石')
  then raise exception 'P9_SYNOPSES_ROLLBACK_SNAPSHOT_SCOPE_MISMATCH'; end if;

  if exists (
    select 1 from libread_internal.p9_synopses_20261115 t
    left join public.series s on s.id = t.series_id
    where s.id is null
       or s.description is distinct from t.description_after
       or s.title is distinct from t.title_after
  ) then raise exception 'P9_SYNOPSES_ROLLBACK_STATE_DRIFT'; end if;
end $$;

do $$
declare
  v_desc integer;
  v_title integer;
begin
  update public.series s
    set description = t.description_before
  from libread_internal.p9_synopses_20261115 t
  where s.id = t.series_id
    and s.description = t.description_after;
  get diagnostics v_desc = row_count;
  if v_desc <> 168 then
    raise exception 'P9_SYNOPSES_ROLLBACK_DESCRIPTION_ROWCOUNT_MISMATCH %', v_desc;
  end if;

  update public.series s
    set title = t.title_before
  from libread_internal.p9_synopses_20261115 t
  where s.id = t.series_id
    and t.title_after is distinct from t.title_before
    and s.title = t.title_after;
  get diagnostics v_title = row_count;
  if v_title <> 1 then
    raise exception 'P9_SYNOPSES_ROLLBACK_TITLE_ROWCOUNT_MISMATCH %', v_title;
  end if;

  if exists (
    select 1 from libread_internal.p9_synopses_20261115 t
    join public.series s on s.id = t.series_id
    where s.description is distinct from t.description_before
       or s.title is distinct from t.title_before
  ) then raise exception 'P9_SYNOPSES_ROLLBACK_POSTCHECK_FAILED'; end if;
end $$;

drop table libread_internal.p9_synopses_20261115;
commit;
