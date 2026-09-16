-- Prevent an authenticated client from under-reporting source_char_count at
-- import start and then storing substantially more chapter text while keeping
-- the work in the temporary `uploading` state. Completion already checks exact
-- totals; enforce the same size ceiling during every batch append so incomplete
-- imports cannot be used as a storage-quota bypass.

create or replace function public.append_private_library_import_units(
  p_work_id uuid,
  p_start_unit_number integer,
  p_units jsonb
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_expected_units integer;
  v_expected_sections integer;
  v_expected_chars integer;
  v_existing_chars bigint;
  v_batch_chars bigint;
  v_batch_count integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select chapter_count, section_count, source_char_count
  into v_expected_units, v_expected_sections, v_expected_chars
  from public.private_library_works
  where id = p_work_id
    and owner_user_id = v_user_id
    and import_status = 'uploading'
  for update;

  if not found then
    raise exception 'Import session not accessible' using errcode = '42501';
  end if;

  if p_units is null or jsonb_typeof(p_units) <> 'array' then
    raise exception 'Invalid import units' using errcode = '22023';
  end if;

  v_batch_count := jsonb_array_length(p_units);
  if v_batch_count not between 1 and 50 then
    raise exception 'Import batch size exceeds limit' using errcode = '22023';
  end if;

  if p_start_unit_number < 1
    or p_start_unit_number + v_batch_count - 1 > v_expected_units then
    raise exception 'Invalid import unit range' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_units) as unit(value)
    where jsonb_typeof(unit.value) <> 'object'
      or char_length(btrim(coalesce(unit.value ->> 'title', ''))) not between 1 and 200
      or char_length(btrim(coalesce(unit.value ->> 'sectionTitle', ''))) not between 1 and 200
      or char_length(btrim(coalesce(unit.value ->> 'body', ''))) not between 1 and 7500
      or coalesce((unit.value ->> 'sectionNumber')::integer, 0) not between 1 and v_expected_sections
      or coalesce((unit.value ->> 'partNumber')::integer, 0) < 1
      or coalesce((unit.value ->> 'partCount')::integer, 0) < 1
      or (unit.value ->> 'partNumber')::integer > (unit.value ->> 'partCount')::integer
  ) then
    raise exception 'Invalid import unit content' using errcode = '22023';
  end if;

  select coalesce(sum(source_char_count), 0)
  into v_existing_chars
  from public.private_library_chapters
  where work_id = p_work_id;

  select coalesce(sum(char_length(btrim(unit.value ->> 'body'))), 0)
  into v_batch_chars
  from jsonb_array_elements(p_units) as unit(value);

  if v_existing_chars + v_batch_chars > v_expected_chars then
    raise exception 'Import text exceeds declared source size' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.private_library_chapters
    where work_id = p_work_id
      and chapter_number between p_start_unit_number and p_start_unit_number + v_batch_count - 1
  ) then
    raise exception 'Import unit range already stored' using errcode = '23505';
  end if;

  insert into public.private_library_chapters (
    work_id,
    chapter_number,
    title,
    body,
    source_char_count,
    section_number,
    section_title,
    part_number,
    part_count
  )
  select
    p_work_id,
    p_start_unit_number + ordinality::integer - 1,
    btrim(unit.value ->> 'title'),
    btrim(unit.value ->> 'body'),
    char_length(btrim(unit.value ->> 'body')),
    (unit.value ->> 'sectionNumber')::integer,
    btrim(unit.value ->> 'sectionTitle'),
    (unit.value ->> 'partNumber')::integer,
    (unit.value ->> 'partCount')::integer
  from jsonb_array_elements(p_units) with ordinality as unit(value, ordinality);

  update public.private_library_works
  set updated_at = now()
  where id = p_work_id;

  return v_batch_count;
end;
$function$;

-- This RPC is intentionally callable by an authenticated browser session; its
-- authorization is bound to auth.uid() inside the function. Keep anonymous
-- callers out explicitly even if default function privileges change later.
revoke all on function public.append_private_library_import_units(uuid, integer, jsonb) from public, anon;
grant execute on function public.append_private_library_import_units(uuid, integer, jsonb) to authenticated, service_role;
