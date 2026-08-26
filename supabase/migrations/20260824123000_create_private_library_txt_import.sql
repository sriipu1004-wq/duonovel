-- Private text library foundation.
-- Imported works are owner-only and intentionally separate from public series/episodes.

create table if not exists public.private_library_works (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  author_name text check (author_name is null or char_length(author_name) <= 200),
  source_type text not null default 'txt' check (source_type in ('txt')),
  source_language text not null check (
    source_language in ('ja', 'en', 'ko', 'fr', 'de', 'es', 'zh-Hans', 'zh-Hant')
  ),
  original_file_name text check (
    original_file_name is null or char_length(original_file_name) <= 255
  ),
  source_char_count integer not null check (source_char_count between 1 and 1000000),
  chapter_count integer not null check (chapter_count between 1 and 500),
  last_opened_chapter_number integer,
  last_opened_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    last_opened_chapter_number is null
    or last_opened_chapter_number between 1 and chapter_count
  )
);

create index if not exists idx_private_library_works_owner_recent
  on public.private_library_works (
    owner_user_id,
    last_opened_at desc nulls last,
    created_at desc
  );

create table if not exists public.private_library_chapters (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references public.private_library_works(id) on delete cascade,
  chapter_number integer not null check (chapter_number between 1 and 500),
  title text not null check (char_length(title) between 1 and 200),
  body text not null check (char_length(body) between 1 and 7500),
  source_char_count integer not null check (source_char_count between 1 and 7500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (work_id, chapter_number)
);

create index if not exists idx_private_library_chapters_work_number
  on public.private_library_chapters (work_id, chapter_number);

alter table public.private_library_works enable row level security;
alter table public.private_library_chapters enable row level security;

drop policy if exists "private_library_works_owner_select" on public.private_library_works;
create policy "private_library_works_owner_select"
on public.private_library_works
for select
to authenticated
using (owner_user_id = auth.uid());

drop policy if exists "private_library_works_owner_insert" on public.private_library_works;
create policy "private_library_works_owner_insert"
on public.private_library_works
for insert
to authenticated
with check (owner_user_id = auth.uid());

drop policy if exists "private_library_works_owner_update" on public.private_library_works;
create policy "private_library_works_owner_update"
on public.private_library_works
for update
to authenticated
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

drop policy if exists "private_library_works_owner_delete" on public.private_library_works;
create policy "private_library_works_owner_delete"
on public.private_library_works
for delete
to authenticated
using (owner_user_id = auth.uid());

drop policy if exists "private_library_chapters_owner_select" on public.private_library_chapters;
create policy "private_library_chapters_owner_select"
on public.private_library_chapters
for select
to authenticated
using (
  exists (
    select 1
    from public.private_library_works
    where private_library_works.id = private_library_chapters.work_id
      and private_library_works.owner_user_id = auth.uid()
  )
);

drop policy if exists "private_library_chapters_owner_insert" on public.private_library_chapters;
create policy "private_library_chapters_owner_insert"
on public.private_library_chapters
for insert
to authenticated
with check (
  exists (
    select 1
    from public.private_library_works
    where private_library_works.id = private_library_chapters.work_id
      and private_library_works.owner_user_id = auth.uid()
  )
);

drop policy if exists "private_library_chapters_owner_update" on public.private_library_chapters;
create policy "private_library_chapters_owner_update"
on public.private_library_chapters
for update
to authenticated
using (
  exists (
    select 1
    from public.private_library_works
    where private_library_works.id = private_library_chapters.work_id
      and private_library_works.owner_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.private_library_works
    where private_library_works.id = private_library_chapters.work_id
      and private_library_works.owner_user_id = auth.uid()
  )
);

drop policy if exists "private_library_chapters_owner_delete" on public.private_library_chapters;
create policy "private_library_chapters_owner_delete"
on public.private_library_chapters
for delete
to authenticated
using (
  exists (
    select 1
    from public.private_library_works
    where private_library_works.id = private_library_chapters.work_id
      and private_library_works.owner_user_id = auth.uid()
  )
);

revoke all on table public.private_library_works from anon;
revoke all on table public.private_library_chapters from anon;
grant select, insert, update, delete on table public.private_library_works to authenticated;
grant select, insert, update, delete on table public.private_library_chapters to authenticated;
grant all on table public.private_library_works to service_role;
grant all on table public.private_library_chapters to service_role;

create or replace function public.import_private_library_txt(
  p_title text,
  p_author_name text,
  p_source_language text,
  p_original_file_name text,
  p_chapters jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_work_id uuid;
  v_chapter_count integer;
  v_total_chars integer;
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

  if p_source_language not in ('ja', 'en', 'ko', 'fr', 'de', 'es', 'zh-Hans', 'zh-Hant') then
    raise exception 'Unsupported source language' using errcode = '22023';
  end if;

  if p_original_file_name is not null and char_length(p_original_file_name) > 255 then
    raise exception 'Invalid file name' using errcode = '22023';
  end if;

  if p_chapters is null or jsonb_typeof(p_chapters) <> 'array' then
    raise exception 'Invalid chapters' using errcode = '22023';
  end if;

  v_chapter_count := jsonb_array_length(p_chapters);
  if v_chapter_count not between 1 and 500 then
    raise exception 'Chapter count exceeds limit' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_chapters) as chapter(value)
    where jsonb_typeof(chapter.value) <> 'object'
      or char_length(btrim(coalesce(chapter.value ->> 'title', ''))) not between 1 and 200
      or char_length(btrim(coalesce(chapter.value ->> 'body', ''))) not between 1 and 7500
  ) then
    raise exception 'Invalid chapter content' using errcode = '22023';
  end if;

  select coalesce(sum(char_length(btrim(chapter.value ->> 'body'))), 0)::integer
  into v_total_chars
  from jsonb_array_elements(p_chapters) as chapter(value);

  if v_total_chars not between 1 and 1000000 then
    raise exception 'Text size exceeds limit' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  select count(*), coalesce(sum(source_char_count), 0)
  into v_existing_works, v_existing_chars
  from public.private_library_works
  where owner_user_id = v_user_id;

  if v_existing_works >= 20 then
    raise exception 'Private library work limit reached' using errcode = '54000';
  end if;

  if v_existing_chars + v_total_chars > 5000000 then
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
    chapter_count
  ) values (
    v_user_id,
    btrim(p_title),
    nullif(btrim(coalesce(p_author_name, '')), ''),
    'txt',
    p_source_language,
    nullif(btrim(coalesce(p_original_file_name, '')), ''),
    v_total_chars,
    v_chapter_count
  )
  returning id into v_work_id;

  insert into public.private_library_chapters (
    work_id,
    chapter_number,
    title,
    body,
    source_char_count
  )
  select
    v_work_id,
    ordinality::integer,
    btrim(chapter.value ->> 'title'),
    btrim(chapter.value ->> 'body'),
    char_length(btrim(chapter.value ->> 'body'))
  from jsonb_array_elements(p_chapters) with ordinality as chapter(value, ordinality);

  return v_work_id;
end;
$$;

revoke all on function public.import_private_library_txt(text, text, text, text, jsonb) from public;
grant execute on function public.import_private_library_txt(text, text, text, text, jsonb) to authenticated;
