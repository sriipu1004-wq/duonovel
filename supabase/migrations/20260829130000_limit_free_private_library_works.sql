-- Limit free private-library storage to three works while retaining the
-- existing twenty-work ceiling for active subscribers. Existing works are
-- preserved; the limit applies only when inserting a new work.

create or replace function public.enforce_private_library_work_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_works integer;
  v_work_limit integer := 3;
begin
  if exists (
    select 1
    from public.libread_user_entitlements as entitlement
    where entitlement.user_id = new.owner_user_id
      and entitlement.plan_type = 'subscriber'
      and (
        entitlement.subscriber_until is null
        or entitlement.subscriber_until > now()
      )
  ) then
    v_work_limit := 20;
  end if;

  -- Match the lock used by the import RPCs so direct inserts cannot race them.
  perform pg_advisory_xact_lock(
    hashtextextended(new.owner_user_id::text, 0)
  );

  select count(*)::integer
  into v_existing_works
  from public.private_library_works as work
  where work.owner_user_id = new.owner_user_id;

  if v_existing_works >= v_work_limit then
    if v_work_limit = 3 then
      raise exception 'Free private library work limit reached'
        using errcode = '54000';
    end if;

    raise exception 'Private library work limit reached'
      using errcode = '54000';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_private_library_work_limit
  on public.private_library_works;
create trigger trg_enforce_private_library_work_limit
before insert on public.private_library_works
for each row execute function public.enforce_private_library_work_limit();

revoke all on function public.enforce_private_library_work_limit()
  from public, anon, authenticated;

-- New imports use translation-sized units. Existing 6,001-7,500 character
-- units remain readable so progress and cached translations are not destroyed.
create or replace function public.enforce_private_library_unit_cost_limit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if char_length(new.body) > 6000 or new.source_char_count > 6000 then
    raise exception 'Translation-safe reading unit limit exceeded'
      using errcode = '54000';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_private_library_unit_cost_limit
  on public.private_library_chapters;
create trigger trg_enforce_private_library_unit_cost_limit
before insert on public.private_library_chapters
for each row execute function public.enforce_private_library_unit_cost_limit();

revoke all on function public.enforce_private_library_unit_cost_limit()
  from public, anon, authenticated;
