-- Legacy official attribution: exact revert of apply.sql.
-- Restores series.effect_settings of the 28 works to the value stored by
-- apply.sql (NULL), then drops the snapshot table. Aborts (no change) if
-- anything drifted after apply.sql: a work whose effect_settings is no longer
-- exactly what apply.sql wrote (for example edited later), a different title
-- or author, or a snapshot outside the 28 ids. Resolve that case by hand; do
-- not force it.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

select s.id from public.series s
join libread_internal.legacy_attribution_series_20261115 t on t.series_id = s.id
for update of s;

do $$ begin
  if (select count(*) from libread_internal.legacy_attribution_series_20261115) <> 28
     or exists (
       select 1 from libread_internal.legacy_attribution_series_20261115
       where series_id not in (
                          'f0c430bd-daaf-4e70-8f8e-a6855c80a327',
                          '19b5f47e-e0c3-4833-a87e-32e3b0bde8af',
                          '1bca3c84-f58e-4020-aa57-b63ce401db9c',
                          '2e756c81-825d-4402-81f3-fff0fb9b4ed6',
                          'd23ea483-66fd-46e2-8520-30ac65f8adac',
                          '555f50cb-18e9-4cdc-bb0c-1cef29865dfc',
                          '6d6d655c-25a3-4b65-936f-900f3ae90adb',
                          'a8d58532-24e1-4dad-84df-15709395011e',
                          '99c79528-0cc1-4381-a723-1f4ebcc36477',
                          'b8b3a2ba-f8a5-4837-90bc-37df2ec49b61',
                          '8e263f81-6348-4fb2-82a5-786b6c080515',
                          '3bff7df0-a23f-4672-a957-22f1a5b2f508',
                          'b7b3ec89-207d-4e40-98aa-d3a30e7caf6f',
                          '1caa86e6-ffff-47aa-bd06-36c454b97ebb',
                          '1dbf029f-ccd7-4e99-b875-432ad50abb50',
                          'ea94cd2b-0172-4821-8a45-59b576a59e16',
                          'c8c0d8f9-7ecd-410b-b64d-90ab89fbfba5',
                          '1b86b07e-397b-4784-ad78-0feab39d5144',
                          '742aa40a-e447-4851-8217-c1959d3fa346',
                          '44c36412-31ca-4c27-8266-684d06afed2b',
                          '8f791e1f-5e92-43ca-9e65-ea1bf5bf9aba',
                          'dd176a0c-d139-44fe-a680-54b1073986fc',
                          '7fcf4e7b-3d80-4d26-88d6-a1948dd0cccb',
                          'd6e1de4e-1c21-4e30-94b5-3c13970ce55d',
                          '7c225e2f-8c46-4882-abf7-27bfeb1c5883',
                          'cffb4d1e-1925-41dc-bcb8-127ac73a393b',
                          '85f48ae4-03b9-4338-8bdc-6bd0316333e3',
                          'd5e231b1-4f59-4d44-80a8-067cd49f8504'
       ))
  then raise exception 'LEGACY_ATTRIBUTION_ROLLBACK_SNAPSHOT_SCOPE_MISMATCH'; end if;

  if exists (
    select 1
    from libread_internal.legacy_attribution_series_20261115 t
    left join public.series s on s.id = t.series_id
    where s.id is null
       or s.effect_settings is distinct from t.effect_settings_after
       or s.title is distinct from t.title_before
       or s.author_id is distinct from t.author_id_before
  ) then raise exception 'LEGACY_ATTRIBUTION_ROLLBACK_STATE_DRIFT'; end if;
end $$;

do $$
declare
  v_series integer;
begin
  update public.series s
    set effect_settings = t.effect_settings_before
  from libread_internal.legacy_attribution_series_20261115 t
  where s.id = t.series_id
    and s.effect_settings = t.effect_settings_after;
  get diagnostics v_series = row_count;
  if v_series <> 28 then
    raise exception 'LEGACY_ATTRIBUTION_ROLLBACK_ROWCOUNT_MISMATCH %', v_series;
  end if;

  if exists (
    select 1 from libread_internal.legacy_attribution_series_20261115 t
    join public.series s on s.id = t.series_id
    where s.effect_settings is distinct from t.effect_settings_before
  ) then raise exception 'LEGACY_ATTRIBUTION_ROLLBACK_POSTCHECK_FAILED'; end if;
end $$;

drop table libread_internal.legacy_attribution_series_20261115;
commit;
