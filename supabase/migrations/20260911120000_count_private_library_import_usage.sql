-- Imports use the existing free generation/translation bucket. A database
-- trigger covers both batched imports and the legacy TXT RPC, even when called
-- directly. Validation, quota reservation, and publication commit atomically.
begin;

create or replace function public.count_private_library_import_usage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allowed boolean;
begin
  if new.import_status <> 'ready' then return new; end if;
  if tg_op = 'UPDATE' then
    if old.import_status = 'ready' then return new; end if;
  end if;

  if exists (
    select 1 from public.libread_user_entitlements
    where user_id = new.owner_user_id and plan_type = 'subscriber'
      and (subscriber_until is null or subscriber_until > now())
  ) then return new; end if;

  -- Reuse the existing action type so every deployed quota reader counts the
  -- same bucket; subscriber imports never reserve AI generation/cost allowance.
  select allowed into v_allowed
  from public.reserve_libread_daily_ai_action(
    new.id, new.owner_user_id, null, 'story_generation', 3, 10
  );
  if v_allowed is distinct from true then
    raise exception 'Free library import daily action limit' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- New clients use a versioned entry point: before this migration is installed,
-- the import cannot silently succeed without charging the promised free use.
create or replace function public.complete_private_library_import_with_usage(p_work_id uuid)
returns uuid
language sql
security invoker
set search_path = public
as $$ select public.complete_private_library_import(p_work_id); $$;
revoke all on function public.complete_private_library_import_with_usage(uuid) from public;
grant execute on function public.complete_private_library_import_with_usage(uuid) to authenticated;

revoke all on function public.count_private_library_import_usage() from public;
drop trigger if exists count_private_library_import_usage on public.private_library_works;
create trigger count_private_library_import_usage
  after insert or update of import_status on public.private_library_works
  for each row execute function public.count_private_library_import_usage();

create or replace function public.complete_private_library_import(p_work_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_status text;
  v_expected_units integer;
  v_expected_sections integer;
  v_expected_chars integer;
  v_actual_units integer;
  v_actual_sections integer;
  v_actual_chars integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select chapter_count, section_count, source_char_count, import_status
  into v_expected_units, v_expected_sections, v_expected_chars, v_status
  from public.private_library_works
  where id = p_work_id
    and owner_user_id = v_user_id
  for update;

  if not found then
    raise exception 'Import session not accessible' using errcode = '42501';
  end if;

  -- Retrying a completed upload is a success and never consumes another use.
  if v_status = 'ready' then return p_work_id; end if;
  if v_status <> 'uploading' then
    raise exception 'Import session not accessible' using errcode = '42501';
  end if;

  select count(*), count(distinct section_number), coalesce(sum(source_char_count), 0)
  into v_actual_units, v_actual_sections, v_actual_chars
  from public.private_library_chapters
  where work_id = p_work_id;

  if v_actual_units <> v_expected_units
    or v_actual_sections <> v_expected_sections
    or v_actual_chars <> v_expected_chars then
    raise exception 'Import is incomplete' using errcode = '22023';
  end if;

  update public.private_library_works
  set import_status = 'ready', updated_at = now()
  where id = p_work_id;

  return p_work_id;
end;
$$;

commit;
