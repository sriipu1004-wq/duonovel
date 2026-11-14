-- Issue #138: owner isolation of the authenticated SECURITY DEFINER RPCs that
-- the private-library E2E does not cover. Disposable PostgreSQL 17 only.
-- Function bodies are verbatim pg_get_functiondef output from hosted
-- (read-only, 2026-11-14). Tables are minimal shapes with the referenced columns.
\set ON_ERROR_STOP on
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create schema auth;
-- Same expression as hosted auth.uid() (claim.sub, then request.jwt.claims JSON).
create function auth.uid() returns uuid language sql stable as
$$ select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

create table public.credit_ledger(user_id uuid not null, amount bigint not null);
create table public.public_episode_translation_unlocks(
  user_id uuid not null, episode_id uuid not null, target_language text not null);
create table public.ai_narration_official_writers(user_id uuid primary key);
create table public.private_library_works(
  id uuid primary key, owner_user_id uuid not null, import_status text not null,
  last_opened_chapter_number int, last_opened_at timestamptz, updated_at timestamptz);
create table public.private_library_chapters(
  id uuid primary key, work_id uuid not null references public.private_library_works(id),
  chapter_number int not null, section_number int not null, section_title text not null,
  part_count int not null, source_char_count int not null);
create table public.private_library_reading_progress(
  user_id uuid not null, work_id uuid not null, chapter_id uuid not null,
  max_progress_ratio numeric, last_segment_index int, completed boolean,
  first_opened_at timestamptz, last_opened_at timestamptz, updated_at timestamptz,
  primary key (user_id, chapter_id));
create table public.private_library_chapter_translations(chapter_id uuid not null, status text not null);
-- Hosted table state (read-only, 2026-11-14): RLS on every table; anon has no
-- table grants; authenticated has SELECT only on the four tables below, each
-- with an owner-only SELECT policy. The other three have no grant and no policy.
alter table public.credit_ledger enable row level security;
alter table public.public_episode_translation_unlocks enable row level security;
alter table public.ai_narration_official_writers enable row level security;
alter table public.private_library_works enable row level security;
alter table public.private_library_chapters enable row level security;
alter table public.private_library_reading_progress enable row level security;
alter table public.private_library_chapter_translations enable row level security;
grant select on public.credit_ledger, public.public_episode_translation_unlocks,
  public.private_library_works, public.private_library_chapters to authenticated;
create policy credit_ledger_select_own on public.credit_ledger
  for select to authenticated using (auth.uid() = user_id);
create policy public_episode_translation_unlocks_select_own on public.public_episode_translation_unlocks
  for select to authenticated using (auth.uid() = user_id);
create policy private_library_works_owner_select on public.private_library_works
  for select to authenticated using (owner_user_id = auth.uid());
create policy private_library_chapters_owner_select on public.private_library_chapters
  for select to authenticated using (exists (select 1 from public.private_library_works
    where private_library_works.id = private_library_chapters.work_id
      and private_library_works.owner_user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.get_credit_balance()
 RETURNS bigint
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(sum(ledger.amount), 0)::bigint
  from public.credit_ledger as ledger
  where ledger.user_id = auth.uid();
$function$;

CREATE OR REPLACE FUNCTION public.has_public_episode_translation_unlock(p_episode_id uuid, p_target_language text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.public_episode_translation_unlocks as unlock_row
    where unlock_row.user_id = auth.uid()
      and unlock_row.episode_id = p_episode_id
      and lower(unlock_row.target_language) = lower(btrim(p_target_language))
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_ai_narration_official_writer()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.ai_narration_official_writers w
    where w.user_id = auth.uid()
  );
$function$;

CREATE OR REPLACE FUNCTION public.list_private_library_sections(p_work_id uuid, p_offset integer DEFAULT 0, p_limit integer DEFAULT 100)
 RETURNS TABLE(section_number integer, section_title text, first_unit_number integer, part_count integer, source_char_count bigint, progress_ratio numeric, is_completed boolean, has_ready_translation boolean)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.update_private_library_reading_progress(p_chapter_id uuid, p_progress_ratio numeric, p_segment_index integer DEFAULT NULL::integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

-- Hosted ACL (2026-11-14): authenticated and service_role only, not anon/PUBLIC.
revoke all on function public.get_credit_balance() from public;
revoke all on function public.has_public_episode_translation_unlock(uuid,text) from public;
revoke all on function public.is_ai_narration_official_writer() from public;
revoke all on function public.list_private_library_sections(uuid,integer,integer) from public;
revoke all on function public.update_private_library_reading_progress(uuid,numeric,integer) from public;
grant execute on function public.get_credit_balance() to authenticated, service_role;
grant execute on function public.has_public_episode_translation_unlock(uuid,text) to authenticated, service_role;
grant execute on function public.is_ai_narration_official_writer() to authenticated, service_role;
grant execute on function public.list_private_library_sections(uuid,integer,integer) to authenticated, service_role;
grant execute on function public.update_private_library_reading_progress(uuid,numeric,integer) to authenticated, service_role;

-- Fixture: user A and user B, each with own rows.
insert into public.credit_ledger values
  ('aaaaaaaa-0000-0000-0000-000000000001', 100),
  ('bbbbbbbb-0000-0000-0000-000000000002', 7000);
insert into public.public_episode_translation_unlocks values
  ('bbbbbbbb-0000-0000-0000-000000000002', 'eeeeeeee-0000-0000-0000-00000000000b', 'en');
insert into public.ai_narration_official_writers values ('bbbbbbbb-0000-0000-0000-000000000002');
insert into public.private_library_works(id, owner_user_id, import_status) values
  ('11111111-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001', 'ready'),
  ('22222222-0000-0000-0000-00000000000b', 'bbbbbbbb-0000-0000-0000-000000000002', 'ready');
insert into public.private_library_chapters values
  ('33333333-0000-0000-0000-00000000000a', '11111111-0000-0000-0000-00000000000a', 1, 1, 'A section', 1, 10),
  ('44444444-0000-0000-0000-00000000000b', '22222222-0000-0000-0000-00000000000b', 1, 1, 'B section', 1, 10);
-- A foreign progress row on A's chapter: must never count toward A's progress.
insert into public.private_library_reading_progress(user_id, work_id, chapter_id, max_progress_ratio, completed) values
  ('bbbbbbbb-0000-0000-0000-000000000002', '11111111-0000-0000-0000-00000000000a',
   '33333333-0000-0000-0000-00000000000a', 1, true);

-- Signed in as A: none of B's data, own data works.
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);
do $$ begin
  if public.get_credit_balance() <> 100 then
    raise exception 'FAIL: A sees a balance other than own (100)';
  end if;
  if public.has_public_episode_translation_unlock('eeeeeeee-0000-0000-0000-00000000000b', 'en') then
    raise exception 'FAIL: A sees B translation unlock';
  end if;
  if public.is_ai_narration_official_writer() then
    raise exception 'FAIL: A gets B official-writer status';
  end if;
  if (select count(*) from public.list_private_library_sections('22222222-0000-0000-0000-00000000000b')) <> 0 then
    raise exception 'FAIL: A can list B private sections';
  end if;
  if (select count(*) from public.list_private_library_sections('11111111-0000-0000-0000-00000000000a')) <> 1 then
    raise exception 'FAIL: A cannot list own sections';
  end if;
  if (select progress_ratio from public.list_private_library_sections('11111111-0000-0000-0000-00000000000a')) <> 0
    or (select is_completed from public.list_private_library_sections('11111111-0000-0000-0000-00000000000a')) then
    raise exception 'FAIL: B progress counted toward A sections';
  end if;
  begin
    perform public.update_private_library_reading_progress('44444444-0000-0000-0000-00000000000b', 0.5);
    raise exception 'FAIL: A wrote progress on B chapter';
  exception when insufficient_privilege then null;
  end;
  if not public.update_private_library_reading_progress('33333333-0000-0000-0000-00000000000a', 0.5) then
    raise exception 'FAIL: A cannot write own progress';
  end if;
  -- Direct reads follow the hosted owner-only policies.
  if (select count(*) from public.credit_ledger
      where user_id <> 'aaaaaaaa-0000-0000-0000-000000000001') <> 0 then
    raise exception 'FAIL: A reads another user credit_ledger row directly';
  end if;
  if (select count(*) from public.private_library_chapters) <> 1 then
    raise exception 'FAIL: A direct chapter read is not owner-only';
  end if;
end $$;
reset role;
do $$ begin
  if has_function_privilege('anon', 'public.update_private_library_reading_progress(uuid,numeric,integer)', 'EXECUTE')
    or has_function_privilege('anon', 'public.get_credit_balance()', 'EXECUTE')
    or has_function_privilege('anon', 'public.has_public_episode_translation_unlock(uuid,text)', 'EXECUTE')
    or has_function_privilege('anon', 'public.is_ai_narration_official_writer()', 'EXECUTE')
    or has_function_privilege('anon', 'public.list_private_library_sections(uuid,integer,integer)', 'EXECUTE') then
    raise exception 'FAIL: anon holds EXECUTE on a definer RPC';
  end if;
  if (select count(*) from public.private_library_reading_progress
      where chapter_id = '44444444-0000-0000-0000-00000000000b') <> 0 then
    raise exception 'FAIL: progress row created on B chapter';
  end if;
  if not exists (select 1 from public.private_library_reading_progress
      where chapter_id = '33333333-0000-0000-0000-00000000000a'
        and user_id = 'aaaaaaaa-0000-0000-0000-000000000001' and max_progress_ratio = 0.5) then
    raise exception 'FAIL: own progress not attributed to A';
  end if;
  if not exists (select 1 from public.private_library_reading_progress
      where chapter_id = '33333333-0000-0000-0000-00000000000a'
        and user_id = 'bbbbbbbb-0000-0000-0000-000000000002' and max_progress_ratio = 1) then
    raise exception 'FAIL: A write changed another user progress row';
  end if;
end $$;

-- Signed in as B: own data is visible.
set role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false);
do $$ begin
  if public.get_credit_balance() <> 7000 then raise exception 'FAIL: B balance'; end if;
  if not public.has_public_episode_translation_unlock('eeeeeeee-0000-0000-0000-00000000000b', ' EN ') then
    raise exception 'FAIL: B unlock';
  end if;
  if not public.is_ai_narration_official_writer() then raise exception 'FAIL: B official writer'; end if;
end $$;
reset role;

-- Anonymous: no EXECUTE on any of the five RPCs.
set role anon;
select set_config('request.jwt.claim.sub', '', false);
do $$
declare
  stmt text;
begin
  foreach stmt in array array[
    'select public.get_credit_balance()',
    'select public.has_public_episode_translation_unlock(''eeeeeeee-0000-0000-0000-00000000000b'',''en'')',
    'select public.is_ai_narration_official_writer()',
    'select * from public.list_private_library_sections(''22222222-0000-0000-0000-00000000000b'')',
    'select public.update_private_library_reading_progress(''44444444-0000-0000-0000-00000000000b'',0.5)'
  ] loop
    begin
      execute stmt;
      raise exception 'FAIL: anon executed: %', stmt;
    exception when insufficient_privilege then null;
    end;
  end loop;
end $$;
reset role;

-- Authenticated role without a subject claim: nothing leaks, writes rejected.
set role authenticated;
select set_config('request.jwt.claim.sub', '', false);
do $$ begin
  if public.get_credit_balance() <> 0 then raise exception 'FAIL: no-sub balance leak'; end if;
  if public.has_public_episode_translation_unlock('eeeeeeee-0000-0000-0000-00000000000b', 'en') then
    raise exception 'FAIL: no-sub unlock leak';
  end if;
  if public.is_ai_narration_official_writer() then raise exception 'FAIL: no-sub official writer'; end if;
  if (select count(*) from public.list_private_library_sections('11111111-0000-0000-0000-00000000000a')) <> 0 then
    raise exception 'FAIL: no-sub sections leak';
  end if;
  begin
    perform public.update_private_library_reading_progress('33333333-0000-0000-0000-00000000000a', 0.5);
    raise exception 'FAIL: no-sub progress write';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
-- Same subject via the request.jwt.claims JSON path (current PostgREST).
set role authenticated;
select set_config('request.jwt.claim.sub', '', false);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', false);
do $$ begin
  if public.get_credit_balance() <> 100 then raise exception 'FAIL: claims-JSON path balance'; end if;
  if public.is_ai_narration_official_writer() then raise exception 'FAIL: claims-JSON path official writer'; end if;
end $$;
reset role;
-- Limit: function bodies are a 2026-11-14 snapshot; a later hosted change is
-- not detected by this job.
\echo PASS: five authenticated SECURITY DEFINER RPCs are owner-isolated (A/B/anon/no-sub/claims)
