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
  v_side integer;
  v_raw jsonb;
  v_obj jsonb;
begin
  -- Not SECURITY DEFINER: current_user is the invoking role. The JWT role is
  -- checked too, so an author request is also caught when it runs through a
  -- SECURITY DEFINER function owned by another role.
  v_jwt_role := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
  if current_user not in ('anon', 'authenticated')
     and coalesce(v_jwt_role, '') not in ('anon', 'authenticated') then
    return new;
  end if;

  -- Normalise OLD / NEW effect_settings to jsonb objects inline (no
  -- separate callable helper). Legacy rows may hold the object serialised as
  -- a jsonb string; anything else counts as empty.
  for v_side in 1..2 loop
    if v_side = 1 then
      if tg_op <> 'UPDATE' then
        continue;
      end if;
      v_raw := old.effect_settings;
    else
      v_raw := new.effect_settings;
    end if;
    v_obj := '{}'::jsonb;
    if v_raw is not null and jsonb_typeof(v_raw) = 'object' then
      v_obj := v_raw;
    elsif v_raw is not null and jsonb_typeof(v_raw) = 'string' then
      begin
        v_obj := (v_raw #>> '{}')::jsonb;
      exception when others then
        v_obj := '{}'::jsonb;
      end;
      if v_obj is null or jsonb_typeof(v_obj) <> 'object' then
        v_obj := '{}'::jsonb;
      end if;
    end if;
    if v_side = 1 then
      v_old := v_obj;
    else
      v_new := v_obj;
    end if;
  end loop;

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
-- writes after this revoke. Normalisation is inlined above on purpose: a
-- separate public helper would be callable as an RPC, and revoking its
-- EXECUTE from authenticated would break the trigger body that calls it as
-- the invoking role.
revoke execute on function public.guard_series_operator_effect_settings() from public, anon, authenticated;
