-- Issue #221 / KD-3 (PR-B). DO NOT apply to the hosted project without a
-- separate, scope-specific owner approval and an independent review.
--
-- series.effect_settings mixes author presentation settings with two
-- operator-only records:
--   * publicDomain       reviewed rights / provenance evidence
--   * legacyAttribution  legacy official-account attribution
-- Author sessions (PostgREST roles anon / authenticated) must not add,
-- change or delete either key. Operator scripts use service_role; migrations
-- and maintenance use a database owner role. Both are left unchanged.
--
-- The trigger compares only those two keys, so authors keep full control of
-- every other key in effect_settings. No data change.

-- Normalises effect_settings to a jsonb object. Legacy rows may hold the
-- object serialised as a jsonb string; anything else counts as empty.
create or replace function public.series_effect_settings_object(p_value jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_parsed jsonb;
begin
  if p_value is null then
    return '{}'::jsonb;
  end if;
  if jsonb_typeof(p_value) = 'object' then
    return p_value;
  end if;
  if jsonb_typeof(p_value) = 'string' then
    begin
      v_parsed := (p_value #>> '{}')::jsonb;
    exception when others then
      return '{}'::jsonb;
    end;
    if jsonb_typeof(v_parsed) = 'object' then
      return v_parsed;
    end if;
  end if;
  return '{}'::jsonb;
end;
$$;

create or replace function public.guard_series_operator_effect_settings()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_jwt_role text;
  v_old jsonb := '{}'::jsonb;
  v_new jsonb := '{}'::jsonb;
  v_key text;
begin
  -- Not SECURITY DEFINER: current_user is the invoking role. The JWT role is
  -- checked too, so an author request is also caught when it runs through a
  -- SECURITY DEFINER function owned by another role.
  v_jwt_role := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
  if current_user not in ('anon', 'authenticated')
     and coalesce(v_jwt_role, '') not in ('anon', 'authenticated') then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    v_old := public.series_effect_settings_object(old.effect_settings);
  end if;
  v_new := public.series_effect_settings_object(new.effect_settings);

  foreach v_key in array array['publicDomain', 'legacyAttribution'] loop
    if (v_old ? v_key) is distinct from (v_new ? v_key)
       or (v_old -> v_key) is distinct from (v_new -> v_key) then
      raise exception 'series.effect_settings.% is operator-managed', v_key
        using errcode = '42501';
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists guard_series_operator_effect_settings on public.series;
create trigger guard_series_operator_effect_settings
  before insert or update of effect_settings on public.series
  for each row
  execute function public.guard_series_operator_effect_settings();

-- Trigger functions are never called directly by clients (see
-- 20261114030000_revoke_authenticated_execute_trigger_fn.sql). EXECUTE is
-- checked only at CREATE TRIGGER time, so the trigger keeps firing for author
-- writes after this revoke. The helper above is called from the trigger body
-- as the invoking role, so it keeps its default EXECUTE grant.
revoke execute on function public.guard_series_operator_effect_settings() from public, anon, authenticated;
