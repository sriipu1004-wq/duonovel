-- Transactional checks for 20261126121000_issue221_guard_series_operator_effect_settings.sql
-- (Issue #221 / KD-3). LOCAL / disposable databases only.
--
-- Prerequisites (local stack from scripts/dev/local-supabase.sh, see
-- docs/local-supabase-dev.md; repository migrations are not replayed there):
-- 1. A public.series table with at least (id uuid primary key, author_id uuid,
--    effect_settings jsonb). On an empty local stack, the minimal fixture is:
--      create table if not exists public.series (
--        id uuid primary key default gen_random_uuid(),
--        author_id uuid,
--        effect_settings jsonb
--      );
--      grant select, insert, update on public.series to authenticated, service_role;
--    If the table has RLS, the test user below must own the row (author_id).
-- 2. Apply the migration above.
-- 3. Run this file as a database owner (e.g. psql as postgres).
--
-- Everything is rolled back at the end. Any failed expectation raises.

begin;

select set_config('libread.kd3_author', gen_random_uuid()::text, true);
select set_config('libread.kd3_series', gen_random_uuid()::text, true);

-- Owner role (migration / maintenance) may write operator keys.
insert into public.series (id, author_id, effect_settings)
values (
  current_setting('libread.kd3_series')::uuid,
  current_setting('libread.kd3_author')::uuid,
  jsonb_build_object(
    'notes', 'before',
    'publicDomain', jsonb_build_object('rightsChecked', true, 'manifestId', 'kd3-test'),
    'legacyAttribution', jsonb_build_object('originalAuthor', 'kd3-test')
  )
);

-- Author session.
select set_config(
  'request.jwt.claims',
  jsonb_build_object('role', 'authenticated', 'sub', current_setting('libread.kd3_author'))::text,
  true
);
set local role authenticated;

do $$
declare
  v_id uuid := current_setting('libread.kd3_series')::uuid;
  v_rows integer;
  v_case text;
  v_blocked boolean;
begin
  -- Allowed: change a presentation key, operator keys untouched.
  update public.series
     set effect_settings = effect_settings || jsonb_build_object('notes', 'after')
   where id = v_id;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'setup: author update touched % rows (RLS/grants); the negative checks below would be vacuous', v_rows;
  end if;

  -- Rejected: change, delete, whole overwrite, null. (Add is checked by the
  -- insert below.) The message is checked so an RLS denial (also 42501)
  -- cannot pass for the trigger.
  foreach v_case in array array[
    'change_public_domain',
    'delete_public_domain',
    'delete_legacy',
    'overwrite_whole_column',
    'null_column'
  ] loop
    v_blocked := false;
    begin
      if v_case = 'change_public_domain' then
        update public.series
           set effect_settings = jsonb_set(effect_settings, '{publicDomain,manifestId}', '"forged"')
         where id = v_id;
      elsif v_case = 'delete_public_domain' then
        update public.series set effect_settings = effect_settings - 'publicDomain' where id = v_id;
      elsif v_case = 'delete_legacy' then
        update public.series set effect_settings = effect_settings - 'legacyAttribution' where id = v_id;
      elsif v_case = 'overwrite_whole_column' then
        update public.series set effect_settings = '{"notes":"x"}'::jsonb where id = v_id;
      elsif v_case = 'null_column' then
        update public.series set effect_settings = null where id = v_id;
      end if;
    exception when insufficient_privilege then
      v_blocked := sqlerrm like '%operator-managed%';
    end;
    if not v_blocked then
      raise exception 'expected % to be rejected by the guard for an author session', v_case;
    end if;
  end loop;

  -- Rejected: author INSERT carrying an operator key.
  v_blocked := false;
  begin
    insert into public.series (author_id, effect_settings)
    values (current_setting('libread.kd3_author')::uuid,
            '{"publicDomain":{"rightsChecked":true}}'::jsonb);
  exception when insufficient_privilege then
    v_blocked := sqlerrm like '%operator-managed%';
  end;
  if not v_blocked then
    raise exception 'expected author insert with publicDomain to be rejected';
  end if;
end;
$$;

-- service_role (operator scripts) may still change operator keys.
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
update public.series
   set effect_settings = effect_settings - 'legacyAttribution'
 where id = current_setting('libread.kd3_series')::uuid;
reset role;

do $$
begin
  if exists (
    select 1 from public.series
     where id = current_setting('libread.kd3_series')::uuid
       and (effect_settings ? 'legacyAttribution'
            or effect_settings ->> 'notes' <> 'after'
            or effect_settings #>> '{publicDomain,manifestId}' <> 'kd3-test')
  ) then
    raise exception 'unexpected final effect_settings';
  end if;
  raise notice 'PASS: KD-3 operator effect_settings guard';
end;
$$;

rollback;
