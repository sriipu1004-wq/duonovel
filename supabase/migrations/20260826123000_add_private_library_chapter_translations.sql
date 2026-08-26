-- Persistent multilingual translation cache for owner-only private library chapters.
-- Additive to the existing private library schema. Existing Production code does not
-- reference these objects until the matching application branch is deployed.

create table if not exists public.private_library_chapter_translations (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.private_library_chapters(id) on delete cascade,
  source_language text not null,
  target_language text not null,
  source_hash text not null,
  segment_version integer not null default 2,
  status text not null check (status in ('translating', 'ready', 'failed')),
  segments jsonb,
  translation_model text,
  requested_by_user_id uuid,
  estimated_cost_jpy numeric(12, 4),
  error_code text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (chapter_id, source_language, target_language, source_hash)
);

create index if not exists idx_private_library_chapter_translations_lookup
  on public.private_library_chapter_translations (
    chapter_id,
    source_language,
    target_language,
    updated_at desc
  );

create table if not exists public.private_library_chapter_translation_logs (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  translation_id uuid references public.private_library_chapter_translations(id) on delete set null,
  chapter_id uuid not null references public.private_library_chapters(id) on delete cascade,
  source_hash text not null,
  source_language text not null,
  target_language text not null,
  user_id uuid,
  model text,
  status text not null,
  success boolean,
  is_counted boolean not null default false,
  source_chars integer,
  estimated_input_tokens integer,
  estimated_output_tokens integer,
  cost_estimate_jpy numeric(12, 4),
  actual_input_tokens integer,
  actual_output_tokens integer,
  actual_cost_jpy numeric(12, 4),
  retry_count integer not null default 0,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_private_library_chapter_translation_logs_daily_counted
  on public.private_library_chapter_translation_logs (created_at desc)
  where is_counted = true;

alter table public.private_library_chapter_translations enable row level security;
alter table public.private_library_chapter_translation_logs enable row level security;

revoke all on table public.private_library_chapter_translations from anon, authenticated;
revoke all on table public.private_library_chapter_translation_logs from anon, authenticated;
grant all on table public.private_library_chapter_translations to service_role;
grant all on table public.private_library_chapter_translation_logs to service_role;

-- Add private-library translations to the same shared daily translation budget used
-- by saved episodes and unsaved generated stories.
create or replace function public.translation_budget_snapshot(
  p_day_start timestamptz,
  p_day_end timestamptz
)
returns table (
  request_count bigint,
  estimated_cost numeric
)
language sql
security definer
set search_path = public
as $$
  select
    (
      select count(*)::bigint
      from public.episode_translation_logs
      where is_counted = true
        and created_at >= p_day_start
        and created_at < p_day_end
    ) + (
      select count(*)::bigint
      from public.generated_story_translation_logs
      where is_counted = true
        and created_at >= p_day_start
        and created_at < p_day_end
    ) + (
      select count(*)::bigint
      from public.private_library_chapter_translation_logs
      where is_counted = true
        and created_at >= p_day_start
        and created_at < p_day_end
    ) as request_count,
    (
      select coalesce(sum(coalesce(cost_estimate_jpy, 0)), 0::numeric)
      from public.episode_translation_logs
      where is_counted = true
        and created_at >= p_day_start
        and created_at < p_day_end
    ) + (
      select coalesce(sum(coalesce(cost_estimate_jpy, 0)), 0::numeric)
      from public.generated_story_translation_logs
      where is_counted = true
        and created_at >= p_day_start
        and created_at < p_day_end
    ) + (
      select coalesce(sum(coalesce(cost_estimate_jpy, 0)), 0::numeric)
      from public.private_library_chapter_translation_logs
      where is_counted = true
        and created_at >= p_day_start
        and created_at < p_day_end
    ) as estimated_cost;
$$;

revoke all on function public.translation_budget_snapshot(timestamptz, timestamptz) from public;
grant execute on function public.translation_budget_snapshot(timestamptz, timestamptz) to service_role;

create or replace function public.reserve_private_library_chapter_translation(
  p_request_id uuid,
  p_chapter_id uuid,
  p_source_hash text,
  p_source_language text,
  p_target_language text,
  p_user_id uuid,
  p_model text,
  p_source_chars integer,
  p_estimated_input_tokens integer,
  p_estimated_output_tokens integer,
  p_cost_estimate_jpy numeric,
  p_daily_max_requests integer,
  p_daily_max_estimated_cost_jpy numeric
)
returns table (
  allowed boolean,
  result_type text,
  translation_id uuid,
  log_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day_start timestamptz;
  v_day_end timestamptz;
  v_request_count bigint;
  v_estimated_cost numeric;
  v_translation public.private_library_chapter_translations%rowtype;
  v_log_id uuid;
begin
  if p_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.private_library_chapters as chapter_row
    join public.private_library_works as work_row
      on work_row.id = chapter_row.work_id
    where chapter_row.id = p_chapter_id
      and work_row.owner_user_id = p_user_id
  ) then
    raise exception 'Private library chapter not accessible' using errcode = '42501';
  end if;

  if p_source_hash is null or length(p_source_hash) < 32 then
    raise exception 'Invalid source hash' using errcode = '22023';
  end if;

  if p_source_language is null
    or p_source_language <> trim(p_source_language)
    or length(p_source_language) > 35
    or p_source_language !~* '^[a-z]{2,3}(-[a-z0-9]{2,8})*$' then
    raise exception 'Invalid source language tag: %', p_source_language using errcode = '22023';
  end if;

  if p_target_language is null
    or p_target_language <> trim(p_target_language)
    or length(p_target_language) > 35
    or p_target_language !~* '^[a-z]{2,3}(-[a-z0-9]{2,8})*$' then
    raise exception 'Invalid target language tag: %', p_target_language using errcode = '22023';
  end if;

  if lower(p_source_language) = lower(p_target_language) then
    raise exception 'Source and target languages must differ' using errcode = '22023';
  end if;

  if p_source_chars <= 0
    or p_estimated_input_tokens <= 0
    or p_estimated_output_tokens <= 0
    or p_cost_estimate_jpy < 0
    or p_daily_max_requests < 0
    or p_daily_max_estimated_cost_jpy < 0 then
    raise exception 'Invalid translation budget configuration' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_chapter_id::text || ':' || p_source_language || ':' ||
        p_target_language || ':' || p_source_hash,
      0
    )
  );

  update public.private_library_chapter_translations
  set
    status = 'failed',
    error_code = coalesce(error_code, 'translation_reservation_expired'),
    completed_at = now(),
    updated_at = now()
  where chapter_id = p_chapter_id
    and source_language = p_source_language
    and target_language = p_target_language
    and source_hash = p_source_hash
    and status = 'translating'
    and started_at < now() - interval '15 minutes';

  select *
  into v_translation
  from public.private_library_chapter_translations
  where chapter_id = p_chapter_id
    and source_language = p_source_language
    and target_language = p_target_language
    and source_hash = p_source_hash
  limit 1;

  if found and v_translation.status = 'ready' then
    return query select false, 'ready'::text, v_translation.id, null::uuid;
    return;
  end if;

  if found and v_translation.status = 'translating' then
    return query select false, 'in_progress'::text, v_translation.id, null::uuid;
    return;
  end if;

  v_day_start :=
    date_trunc('day', now() at time zone 'Asia/Tokyo')
    at time zone 'Asia/Tokyo';
  v_day_end := v_day_start + interval '1 day';

  select snapshot.request_count, snapshot.estimated_cost
  into v_request_count, v_estimated_cost
  from public.translation_budget_snapshot(v_day_start, v_day_end) as snapshot;

  if p_daily_max_requests = 0 or v_request_count + 1 > p_daily_max_requests then
    insert into public.private_library_chapter_translation_logs (
      request_id, chapter_id, source_hash, source_language, target_language,
      user_id, model, status, success, is_counted, source_chars,
      estimated_input_tokens, estimated_output_tokens, cost_estimate_jpy,
      error_code, error_message
    ) values (
      p_request_id, p_chapter_id, p_source_hash, p_source_language,
      p_target_language, p_user_id, p_model, 'rate_limited', false, false,
      p_source_chars, p_estimated_input_tokens, p_estimated_output_tokens,
      p_cost_estimate_jpy, 'translation_daily_request_limit',
      'Daily translation request limit reached'
    ) returning id into v_log_id;

    return query select false, 'daily_request_limit'::text, null::uuid, v_log_id;
    return;
  end if;

  if p_daily_max_estimated_cost_jpy = 0
    or v_estimated_cost + p_cost_estimate_jpy > p_daily_max_estimated_cost_jpy then
    insert into public.private_library_chapter_translation_logs (
      request_id, chapter_id, source_hash, source_language, target_language,
      user_id, model, status, success, is_counted, source_chars,
      estimated_input_tokens, estimated_output_tokens, cost_estimate_jpy,
      error_code, error_message
    ) values (
      p_request_id, p_chapter_id, p_source_hash, p_source_language,
      p_target_language, p_user_id, p_model, 'rate_limited', false, false,
      p_source_chars, p_estimated_input_tokens, p_estimated_output_tokens,
      p_cost_estimate_jpy, 'translation_daily_cost_limit',
      'Daily translation cost limit reached'
    ) returning id into v_log_id;

    return query select false, 'daily_cost_limit'::text, null::uuid, v_log_id;
    return;
  end if;

  insert into public.private_library_chapter_translations (
    chapter_id,
    source_language,
    target_language,
    source_hash,
    segment_version,
    status,
    segments,
    translation_model,
    requested_by_user_id,
    estimated_cost_jpy,
    error_code,
    started_at,
    completed_at,
    updated_at
  ) values (
    p_chapter_id,
    p_source_language,
    p_target_language,
    p_source_hash,
    2,
    'translating',
    null,
    p_model,
    p_user_id,
    p_cost_estimate_jpy,
    null,
    now(),
    null,
    now()
  )
  on conflict (chapter_id, source_language, target_language, source_hash)
  do update set
    status = 'translating',
    segments = null,
    translation_model = excluded.translation_model,
    requested_by_user_id = excluded.requested_by_user_id,
    estimated_cost_jpy = excluded.estimated_cost_jpy,
    error_code = null,
    started_at = now(),
    completed_at = null,
    updated_at = now()
  returning * into v_translation;

  insert into public.private_library_chapter_translation_logs (
    request_id,
    translation_id,
    chapter_id,
    source_hash,
    source_language,
    target_language,
    user_id,
    model,
    status,
    success,
    is_counted,
    source_chars,
    estimated_input_tokens,
    estimated_output_tokens,
    cost_estimate_jpy
  ) values (
    p_request_id,
    v_translation.id,
    p_chapter_id,
    p_source_hash,
    p_source_language,
    p_target_language,
    p_user_id,
    p_model,
    'started',
    null,
    true,
    p_source_chars,
    p_estimated_input_tokens,
    p_estimated_output_tokens,
    p_cost_estimate_jpy
  ) returning id into v_log_id;

  return query select true, 'reserved'::text, v_translation.id, v_log_id;
end;
$$;

revoke all on function public.reserve_private_library_chapter_translation(
  uuid, uuid, text, text, text, uuid, text, integer, integer, integer,
  numeric, integer, numeric
) from public;

grant execute on function public.reserve_private_library_chapter_translation(
  uuid, uuid, text, text, text, uuid, text, integer, integer, integer,
  numeric, integer, numeric
) to service_role;
