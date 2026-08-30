-- Expand the owner-only private library for long-form, multi-format imports.
-- Logical sections stay separate from the <= 7,500 character reading/translation
-- units so long chapters do not appear as unrelated chapters in the bookshelf.

alter table public.private_library_works
  drop constraint if exists private_library_works_source_type_check,
  drop constraint if exists private_library_works_source_char_count_check,
  drop constraint if exists private_library_works_chapter_count_check,
  drop constraint if exists private_library_works_last_opened_chapter_number_check;

alter table public.private_library_works
  add column if not exists section_count integer,
  add column if not exists import_status text not null default 'ready';

update public.private_library_works
set section_count = chapter_count
where section_count is null;

create or replace function public.fill_private_library_work_section_count()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.section_count is null then
    new.section_count := new.chapter_count;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_fill_private_library_work_section_count
  on public.private_library_works;
create trigger trg_fill_private_library_work_section_count
before insert or update on public.private_library_works
for each row execute function public.fill_private_library_work_section_count();

alter table public.private_library_works
  alter column section_count set not null,
  add constraint private_library_works_source_type_check
    check (source_type in ('txt', 'epub', 'docx', 'pdf')),
  add constraint private_library_works_source_char_count_check
    check (source_char_count between 1 and 5000000),
  add constraint private_library_works_chapter_count_check
    check (chapter_count between 1 and 4000),
  add constraint private_library_works_section_count_check
    check (section_count between 1 and 1500),
  add constraint private_library_works_import_status_check
    check (import_status in ('uploading', 'ready')),
  add constraint private_library_works_last_opened_chapter_number_check
    check (
      last_opened_chapter_number is null
      or last_opened_chapter_number between 1 and chapter_count
    );

alter table public.private_library_chapters
  drop constraint if exists private_library_chapters_chapter_number_check;

alter table public.private_library_chapters
  add column if not exists section_number integer,
  add column if not exists section_title text,
  add column if not exists part_number integer,
  add column if not exists part_count integer;

update public.private_library_chapters
set
  section_number = chapter_number,
  section_title = title,
  part_number = 1,
  part_count = 1
where section_number is null
   or section_title is null
   or part_number is null
   or part_count is null;

create or replace function public.fill_private_library_chapter_section_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.section_number is null then
    new.section_number := new.chapter_number;
  end if;
  if new.section_title is null then
    new.section_title := new.title;
  end if;
  if new.part_number is null then
    new.part_number := 1;
  end if;
  if new.part_count is null then
    new.part_count := 1;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_fill_private_library_chapter_section_fields
  on public.private_library_chapters;
create trigger trg_fill_private_library_chapter_section_fields
before insert or update on public.private_library_chapters
for each row execute function public.fill_private_library_chapter_section_fields();

alter table public.private_library_chapters
  alter column section_number set not null,
  alter column section_title set not null,
  alter column part_number set not null,
  alter column part_count set not null,
  add constraint private_library_chapters_chapter_number_check
    check (chapter_number between 1 and 4000),
  add constraint private_library_chapters_section_number_check
    check (section_number between 1 and 1500),
  add constraint private_library_chapters_section_title_check
    check (char_length(section_title) between 1 and 200),
  add constraint private_library_chapters_part_number_check
    check (part_number between 1 and 1000),
  add constraint private_library_chapters_part_count_check
    check (part_count between 1 and 1000),
  add constraint private_library_chapters_part_bounds_check
    check (part_number <= part_count);

create unique index if not exists idx_private_library_chapters_work_section_part
  on public.private_library_chapters (work_id, section_number, part_number);

create or replace function public.begin_private_library_import(
  p_title text,
  p_author_name text,
  p_source_type text,
  p_source_language text,
  p_original_file_name text,
  p_source_char_count integer,
  p_unit_count integer,
  p_section_count integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_work_id uuid;
  v_existing_works integer;
  v_existing_chars bigint;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_title is null or char_length(btrim(p_title)) not between 1 and 200 then
    raise exception 'Invalid title' using errcode = '22023';
  end if;

  if p_author_name is not null and char_length(btrim(p_author_name)) > 200 then
    raise exception 'Invalid author name' using errcode = '22023';
  end if;

  if p_source_type not in ('txt', 'epub', 'docx', 'pdf') then
    raise exception 'Unsupported source type' using errcode = '22023';
  end if;

  if p_source_language not in ('ja', 'en', 'ko', 'fr', 'de', 'es', 'zh-Hans', 'zh-Hant') then
    raise exception 'Unsupported source language' using errcode = '22023';
  end if;

  if p_original_file_name is not null and char_length(p_original_file_name) > 255 then
    raise exception 'Invalid file name' using errcode = '22023';
  end if;

  if p_source_char_count not between 1 and 5000000 then
    raise exception 'Text size exceeds limit' using errcode = '22023';
  end if;

  if p_unit_count not between 1 and 4000 then
    raise exception 'Reading unit count exceeds limit' using errcode = '22023';
  end if;

  if p_section_count not between 1 and 1500 or p_section_count > p_unit_count then
    raise exception 'Section count exceeds limit' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  delete from public.private_library_works
  where owner_user_id = v_user_id
    and import_status = 'uploading'
    and updated_at < now() - interval '6 hours';

  select count(*), coalesce(sum(source_char_count), 0)
  into v_existing_works, v_existing_chars
  from public.private_library_works
  where owner_user_id = v_user_id;

  if v_existing_works >= 20 then
    raise exception 'Private library work limit reached' using errcode = '54000';
  end if;

  if v_existing_chars + p_source_char_count > 5000000 then
    raise exception 'Private library text limit reached' using errcode = '54000';
  end if;

  insert into public.private_library_works (
    owner_user_id,
    title,
    author_name,
    source_type,
    source_language,
    original_file_name,
    source_char_count,
    chapter_count,
    section_count,
    import_status
  ) values (
    v_user_id,
    btrim(p_title),
    nullif(btrim(coalesce(p_author_name, '')), ''),
    p_source_type,
    p_source_language,
    nullif(btrim(coalesce(p_original_file_name, '')), ''),
    p_source_char_count,
    p_unit_count,
    p_section_count,
    'uploading'
  )
  returning id into v_work_id;

  return v_work_id;
end;
$$;

create or replace function public.append_private_library_import_units(
  p_work_id uuid,
  p_start_unit_number integer,
  p_units jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_expected_units integer;
  v_expected_sections integer;
  v_batch_count integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select chapter_count, section_count
  into v_expected_units, v_expected_sections
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
$$;

create or replace function public.complete_private_library_import(p_work_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
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

create or replace function public.abort_private_library_import(p_work_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_deleted integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  delete from public.private_library_works
  where id = p_work_id
    and owner_user_id = v_user_id
    and import_status = 'uploading';

  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end;
$$;

create or replace function public.list_private_library_sections(
  p_work_id uuid,
  p_offset integer default 0,
  p_limit integer default 100
)
returns table (
  section_number integer,
  section_title text,
  first_unit_number integer,
  part_count integer,
  source_char_count bigint
)
language sql
security definer
set search_path = public
as $$
  select
    chapter.section_number,
    min(chapter.section_title) as section_title,
    min(chapter.chapter_number) as first_unit_number,
    max(chapter.part_count) as part_count,
    sum(chapter.source_char_count)::bigint as source_char_count
  from public.private_library_chapters as chapter
  join public.private_library_works as work on work.id = chapter.work_id
  where chapter.work_id = p_work_id
    and work.owner_user_id = auth.uid()
    and work.import_status = 'ready'
    and p_offset >= 0
    and p_limit between 1 and 100
  group by chapter.section_number
  order by chapter.section_number
  offset p_offset
  limit p_limit;
$$;

revoke all on function public.begin_private_library_import(
  text, text, text, text, text, integer, integer, integer
) from public;
grant execute on function public.begin_private_library_import(
  text, text, text, text, text, integer, integer, integer
) to authenticated;

revoke all on function public.append_private_library_import_units(uuid, integer, jsonb) from public;
grant execute on function public.append_private_library_import_units(uuid, integer, jsonb) to authenticated;

revoke all on function public.complete_private_library_import(uuid) from public;
grant execute on function public.complete_private_library_import(uuid) to authenticated;

revoke all on function public.abort_private_library_import(uuid) from public;
grant execute on function public.abort_private_library_import(uuid) to authenticated;

revoke all on function public.list_private_library_sections(uuid, integer, integer) from public;
grant execute on function public.list_private_library_sections(uuid, integer, integer) to authenticated;
