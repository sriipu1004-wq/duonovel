-- Issue #138 A/B/anon isolated GoTrue+PostgREST fixture: NO hosted DB use.
-- Function bodies below are EXACT pg_get_functiondef excerpts from the live
-- public schema, retrieved READ-ONLY on 2026-11-02/03, explicitly frozen here.
-- Surrounding minimal DDL models verified live table RLS/grants/trigger behavior.
-- NOT full prod schema, not a data migration, not production proof.
create table public.private_library_works(
 id uuid primary key default gen_random_uuid(),
 owner_user_id uuid not null references auth.users(id) on delete cascade,
 title text not null, author_name text, source_type text not null default 'txt',
 source_language text not null default 'ja', original_file_name text,
 source_char_count integer not null check(source_char_count between 1 and 5000000),
 chapter_count integer not null check(chapter_count between 1 and 4000),
 section_count integer not null default 1 check(section_count between 1 and 1500),
 import_status text not null default 'uploading'
  check(import_status in ('uploading','ready')),
 updated_at timestamptz not null default now(),
 last_opened_at timestamptz, last_opened_chapter_number integer
);
create table public.private_library_chapters(
 id uuid primary key default gen_random_uuid(),
 work_id uuid not null references public.private_library_works(id) on delete cascade,
 chapter_number integer not null check(chapter_number between 1 and 4000),
 title text not null, body text not null check(char_length(body) between 1 and 7500),
 source_char_count integer not null check(source_char_count between 1 and 7500),
 section_number integer not null default 1 check(section_number between 1 and 1500),
 section_title text not null default 'SECTION',
 part_number integer not null default 1 check(part_number between 1 and 1000),
 part_count integer not null default 1 check(part_count between 1 and 1000),
 unique(work_id,chapter_number),check(part_number<=part_count)
);
create table public.libread_user_entitlements(
 user_id uuid primary key references auth.users(id),
 plan_type text not null,subscriber_until timestamptz
);
create table public.libread_daily_ai_action_logs(
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null, user_id uuid, anonymous_key text,
 action_type text not null, is_counted boolean not null default true,
 created_at timestamptz not null default now()
);
create index issue138_usage_idx on public.libread_daily_ai_action_logs(user_id,created_at);
alter table public.private_library_works enable row level security;
alter table public.private_library_chapters enable row level security;
alter table public.libread_user_entitlements enable row level security;
alter table public.libread_daily_ai_action_logs enable row level security;
-- Explicit grants match the AUTHENTICATED effective broad TABLE privileges
-- observed in hosted pg_catalog. All destructive operations in this fixture
-- affect fresh synthetic users, with no hosted DB connection or credentials.
revoke all on table public.private_library_works,public.private_library_chapters,
 public.libread_user_entitlements,public.libread_daily_ai_action_logs
 from public,anon,authenticated;
grant select,insert,update,delete on public.private_library_works,
 public.private_library_chapters to authenticated;
grant all on public.private_library_works,public.private_library_chapters,
 public.libread_user_entitlements,public.libread_daily_ai_action_logs to service_role;
create policy works_self_select on public.private_library_works
 for select to authenticated using(owner_user_id=auth.uid());
create policy works_self_insert on public.private_library_works
 for insert to authenticated with check(owner_user_id=auth.uid());
create policy works_self_update on public.private_library_works
 for update to authenticated using(owner_user_id=auth.uid())
 with check(owner_user_id=auth.uid());
create policy works_self_delete on public.private_library_works
 for delete to authenticated using(owner_user_id=auth.uid());
create policy chapter_self_select on public.private_library_chapters
 for select to authenticated using(exists(select 1 from public.private_library_works
 where id=work_id and owner_user_id=auth.uid()));
create policy chapter_self_insert on public.private_library_chapters
 for insert to authenticated with check(exists(select 1 from public.private_library_works
 where id=work_id and owner_user_id=auth.uid()));
create policy chapter_self_update on public.private_library_chapters
 for update to authenticated using(exists(select 1 from public.private_library_works
 where id=work_id and owner_user_id=auth.uid()))
 with check(exists(select 1 from public.private_library_works
 where id=work_id and owner_user_id=auth.uid()));
create policy chapter_self_delete on public.private_library_chapters
 for delete to authenticated using(exists(select 1 from public.private_library_works
 where id=work_id and owner_user_id=auth.uid()));

CREATE OR REPLACE FUNCTION public.reserve_libread_daily_ai_action(p_request_id uuid, p_user_id uuid, p_anonymous_key text, p_action_type text, p_free_limit integer, p_subscriber_limit integer)
 RETURNS TABLE(allowed boolean, used_count integer, limit_count integer, plan_type text, reset_at timestamp with time zone, log_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_day_start timestamptz;
  v_reset_at timestamptz;
  v_plan_type text := 'free';
  v_limit integer;
  v_used integer;
  v_log_id uuid;
  v_identity text;
  v_quota_scope text;
  v_shared_free_quota boolean;
begin
  if p_action_type not in ('library_import', 'translation_generation', 'word_explanation') then
    raise exception 'Invalid action type' using errcode = '22023';
  end if;
  if p_free_limit < 0 or p_subscriber_limit < 0 then
    raise exception 'Invalid action limit' using errcode = '22023';
  end if;
  if p_user_id is null and nullif(btrim(coalesce(p_anonymous_key, '')), '') is null then
    raise exception 'Missing quota identity' using errcode = '22023';
  end if;

  v_day_start := date_trunc('day', now() at time zone 'Asia/Tokyo') at time zone 'Asia/Tokyo';
  v_reset_at := v_day_start + interval '1 day';
  v_identity := coalesce(p_user_id::text, 'anon:' || btrim(p_anonymous_key));

  if p_user_id is not null and exists (
    select 1
    from public.libread_user_entitlements entitlement
    where entitlement.user_id = p_user_id
      and entitlement.plan_type = 'subscriber'
      and (entitlement.subscriber_until is null or entitlement.subscriber_until > now())
  ) then
    v_plan_type := 'subscriber';
  end if;

  v_shared_free_quota :=
    v_plan_type = 'free'
    and p_action_type in ('library_import', 'translation_generation');
  v_quota_scope := case
    when v_shared_free_quota then 'free_translation_and_library_import'
    else p_action_type
  end;
  perform pg_advisory_xact_lock(hashtextextended(v_identity || ':' || v_quota_scope, 0));

  v_limit := case when v_plan_type = 'subscriber' then p_subscriber_limit else p_free_limit end;

  select log.id into v_log_id
  from public.libread_daily_ai_action_logs log
  where log.request_id = p_request_id
    and log.is_counted = true;

  select count(*)::integer into v_used
  from public.libread_daily_ai_action_logs log
  where log.is_counted = true
    and (
      (
        v_shared_free_quota
        and log.action_type in (
          'library_import',
          'translation_generation',
          'story_generation'
        )
      )
      or
      (
        not v_shared_free_quota
        and log.action_type = p_action_type
      )
    )
    and log.created_at >= v_day_start
    and log.created_at < v_reset_at
    and (
      (p_user_id is not null and log.user_id = p_user_id)
      or
      (p_user_id is null and log.user_id is null and log.anonymous_key = btrim(p_anonymous_key))
    );

  if v_log_id is not null then
    return query select true, v_used, v_limit, v_plan_type, v_reset_at, v_log_id;
    return;
  end if;

  if v_limit = 0 or v_used >= v_limit then
    return query select false, v_used, v_limit, v_plan_type, v_reset_at, null::uuid;
    return;
  end if;

  insert into public.libread_daily_ai_action_logs (
    request_id, user_id, anonymous_key, action_type
  ) values (
    p_request_id,
    p_user_id,
    case when p_user_id is null then btrim(p_anonymous_key) else null end,
    p_action_type
  ) returning id into v_log_id;

  return query select true, v_used + 1, v_limit, v_plan_type, v_reset_at, v_log_id;
end;
$function$

CREATE OR REPLACE FUNCTION public.enforce_private_library_work_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$

CREATE OR REPLACE FUNCTION public.enforce_private_library_unit_cost_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if char_length(new.body) > 6000 or new.source_char_count > 6000 then
    raise exception 'Translation-safe reading unit limit exceeded'
      using errcode = '54000';
  end if;

  return new;
end;
$function$

CREATE OR REPLACE FUNCTION public.count_private_library_import_usage()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_allowed boolean;
begin
  if new.import_status <> 'ready' then return new; end if;
  if tg_op = 'UPDATE' and old.import_status = 'ready' then return new; end if;

  if exists (
    select 1 from public.libread_user_entitlements
    where user_id = new.owner_user_id
      and plan_type = 'subscriber'
      and (subscriber_until is null or subscriber_until > now())
  ) then
    return new;
  end if;

  select allowed into v_allowed
  from public.reserve_libread_daily_ai_action(
    new.id,
    new.owner_user_id,
    null,
    'library_import',
    3,
    0
  );

  if v_allowed is distinct from true then
    raise exception 'Free library import daily action limit' using errcode = 'P0001';
  end if;
  return new;
end;
$function$

CREATE OR REPLACE FUNCTION public.abort_private_library_import(p_work_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$

CREATE OR REPLACE FUNCTION public.begin_private_library_import(p_title text, p_author_name text, p_source_type text, p_source_language text, p_original_file_name text, p_source_char_count integer, p_unit_count integer, p_section_count integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$

CREATE OR REPLACE FUNCTION public.append_private_library_import_units(p_work_id uuid, p_start_unit_number integer, p_units jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$

CREATE OR REPLACE FUNCTION public.complete_private_library_import(p_work_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;

  select chapter_count, section_count, source_char_count, import_status
  into v_expected_units, v_expected_sections, v_expected_chars, v_status
  from public.private_library_works
  where id = p_work_id
    and owner_user_id = v_user_id
  for update;

  if not found then
    raise exception 'Import session not accessible'
      using errcode = '42501';
  end if;

  if v_status = 'ready' then
    return p_work_id;
  end if;

  if v_status <> 'uploading' then
    raise exception 'Import session not accessible'
      using errcode = '42501';
  end if;

  select
    count(*),
    count(distinct section_number),
    coalesce(sum(source_char_count), 0)
  into v_actual_units, v_actual_sections, v_actual_chars
  from public.private_library_chapters
  where work_id = p_work_id;

  if v_actual_units <> v_expected_units
    or v_actual_sections <> v_expected_sections
    or v_actual_chars <> v_expected_chars then
    raise exception 'Import is incomplete'
      using errcode = '22023';
  end if;

  update public.private_library_works
  set import_status = 'ready', updated_at = now()
  where id = p_work_id;

  return p_work_id;
end;
$function$


-- Exact observed trigger attachments: count runs AFTER INSERT or UPDATE OF
-- import_status (not total-size/chapters completeness). Limiter BEFORE INSERT.
create trigger issue138_limit_work before insert on public.private_library_works
 for each row execute function public.enforce_private_library_work_limit();
create trigger issue138_charge_ready after insert or update of import_status
 on public.private_library_works for each row
 execute function public.count_private_library_import_usage();
create trigger issue138_unit_limit before insert on public.private_library_chapters
 for each row execute function public.enforce_private_library_unit_cost_limit();
-- Authenticated clients cannot call the nested quota-reserver directly.
revoke execute on function public.reserve_libread_daily_ai_action(uuid,uuid,text,text,integer,integer)
 from public,anon,authenticated;
grant execute on function public.reserve_libread_daily_ai_action(uuid,uuid,text,text,integer,integer)
 to service_role;
revoke execute on function public.enforce_private_library_work_limit()
 from public,anon,authenticated;
revoke execute on function public.enforce_private_library_unit_cost_limit()
 from public,anon,authenticated;
revoke execute on function public.count_private_library_import_usage()
 from public,anon;
grant execute on function public.count_private_library_import_usage() to authenticated,service_role;
revoke execute on function public.abort_private_library_import(uuid)
 from public,anon;
grant execute on function public.abort_private_library_import(uuid) to authenticated,service_role;
revoke execute on function public.begin_private_library_import(text,text,text,text,text,integer,integer,integer)
 from public,anon;
grant execute on function public.begin_private_library_import(text,text,text,text,text,integer,integer,integer)
 to authenticated,service_role;
revoke execute on function public.append_private_library_import_units(uuid,integer,jsonb)
 from public,anon;
grant execute on function public.append_private_library_import_units(uuid,integer,jsonb)
 to authenticated,service_role;
revoke execute on function public.complete_private_library_import(uuid) from public,anon;
grant execute on function public.complete_private_library_import(uuid) to authenticated,service_role;
notify pgrst,'reload schema';
