-- Durable per-reading-unit progress for the owner-only private library.

create table if not exists public.private_library_reading_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  work_id uuid not null references public.private_library_works(id) on delete cascade,
  chapter_id uuid not null references public.private_library_chapters(id) on delete cascade,
  max_progress_ratio numeric(6, 5) not null default 0
    check (max_progress_ratio between 0 and 1),
  last_segment_index integer,
  completed boolean not null default false,
  first_opened_at timestamptz not null default now(),
  last_opened_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, chapter_id)
);

create index if not exists idx_private_library_reading_progress_work
  on public.private_library_reading_progress (user_id, work_id, updated_at desc);

alter table public.private_library_reading_progress enable row level security;
revoke all on table public.private_library_reading_progress from anon, authenticated;
grant all on table public.private_library_reading_progress to service_role;

create or replace function public.update_private_library_reading_progress(
  p_chapter_id uuid,
  p_progress_ratio numeric,
  p_segment_index integer default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_work_id uuid;
  v_chapter_number integer;
  v_ratio numeric;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  v_ratio := least(1, greatest(0, coalesce(p_progress_ratio, 0)));

  select chapter.work_id, chapter.chapter_number
  into v_work_id, v_chapter_number
  from public.private_library_chapters as chapter
  join public.private_library_works as work on work.id = chapter.work_id
  where chapter.id = p_chapter_id
    and work.owner_user_id = v_user_id
    and work.import_status = 'ready';

  if not found then
    raise exception 'Private library chapter not accessible' using errcode = '42501';
  end if;

  insert into public.private_library_reading_progress (
    user_id,
    work_id,
    chapter_id,
    max_progress_ratio,
    last_segment_index,
    completed,
    first_opened_at,
    last_opened_at,
    updated_at
  ) values (
    v_user_id,
    v_work_id,
    p_chapter_id,
    v_ratio,
    p_segment_index,
    v_ratio >= 0.92,
    now(),
    now(),
    now()
  )
  on conflict (user_id, chapter_id)
  do update set
    max_progress_ratio = greatest(
      public.private_library_reading_progress.max_progress_ratio,
      excluded.max_progress_ratio
    ),
    last_segment_index = coalesce(
      excluded.last_segment_index,
      public.private_library_reading_progress.last_segment_index
    ),
    completed = public.private_library_reading_progress.completed
      or excluded.completed,
    last_opened_at = now(),
    updated_at = now();

  update public.private_library_works
  set
    last_opened_chapter_number = v_chapter_number,
    last_opened_at = now(),
    updated_at = now()
  where id = v_work_id
    and owner_user_id = v_user_id;

  return true;
end;
$$;

revoke all on function public.update_private_library_reading_progress(uuid, numeric, integer) from public;
grant execute on function public.update_private_library_reading_progress(uuid, numeric, integer) to authenticated;

drop function if exists public.list_private_library_sections(uuid, integer, integer);

create function public.list_private_library_sections(
  p_work_id uuid,
  p_offset integer default 0,
  p_limit integer default 100
)
returns table (
  section_number integer,
  section_title text,
  first_unit_number integer,
  part_count integer,
  source_char_count bigint,
  progress_ratio numeric,
  is_completed boolean,
  has_ready_translation boolean
)
language sql
security definer
set search_path = public
as $$
  with accessible_units as (
    select chapter.*
    from public.private_library_chapters as chapter
    join public.private_library_works as work on work.id = chapter.work_id
    where chapter.work_id = p_work_id
      and work.owner_user_id = auth.uid()
      and work.import_status = 'ready'
      and p_offset >= 0
      and p_limit between 1 and 100
  )
  select
    unit.section_number,
    min(unit.section_title) as section_title,
    min(unit.chapter_number) as first_unit_number,
    max(unit.part_count) as part_count,
    sum(unit.source_char_count)::bigint as source_char_count,
    least(
      1::numeric,
      coalesce(
        sum(
          case
            when progress.completed then 1::numeric
            else coalesce(progress.max_progress_ratio, 0::numeric)
          end
        ) / nullif(count(*), 0),
        0::numeric
      )
    ) as progress_ratio,
    bool_and(coalesce(progress.completed, false)) as is_completed,
    bool_or(coalesce(translation.has_ready, false)) as has_ready_translation
  from accessible_units as unit
  left join public.private_library_reading_progress as progress
    on progress.chapter_id = unit.id
   and progress.user_id = auth.uid()
  left join lateral (
    select true as has_ready
    from public.private_library_chapter_translations as cached
    where cached.chapter_id = unit.id
      and cached.status = 'ready'
    limit 1
  ) as translation on true
  group by unit.section_number
  order by unit.section_number
  offset p_offset
  limit p_limit;
$$;

revoke all on function public.list_private_library_sections(uuid, integer, integer) from public;
grant execute on function public.list_private_library_sections(uuid, integer, integer) to authenticated;
