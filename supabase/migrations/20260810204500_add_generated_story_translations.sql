-- Temporary bilingual translation cache for AI stories that have not been saved as episodes.
-- Keeps generated story rows out of series/episodes while sharing the existing translation budget.

create table if not exists public.generated_story_translations (
  id uuid primary key default gen_random_uuid(),
  story_id text not null,
  source_language text not null default 'ja',
  target_language text not null,
  source_hash text not null,
  segment_version integer not null default 1,
  status text not null check (status in ('translating', 'ready', 'failed')),
  segments jsonb,
  translation_model text,
  requested_by_user_id uuid,
  estimated_cost_jpy numeric(12, 4),
  error_code text,
  started_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz not null default (now() + interval '48 hours'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (story_id, target_language, source_hash)
);

create index if not exists idx_generated_story_translations_story_target_updated
  on public.generated_story_translations (story_id, target_language, updated_at desc);

create index if not exists idx_generated_story_translations_expires
  on public.generated_story_translations (expires_at);

create table if not exists public.generated_story_translation_logs (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  translation_id uuid references public.generated_story_translations(id) on delete set null,
  story_id text not null,
  source_hash text not null,
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
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_generated_story_translation_logs_daily_counted
  on public.generated_story_translation_logs (created_at desc)
  where is_counted = true;

alter table public.generated_story_translations enable row level security;
alter table public.generated_story_translation_logs enable row level security;

revoke all on table public.generated_story_translations from anon, authenticated;
revoke all on table public.generated_story_translation_logs from anon, authenticated;
grant all on table public.generated_story_translations to service_role;
grant all on table public.generated_story_translation_logs to service_role;

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
    ) as estimated_cost;
$$;

revoke all on function public.translation_budget_snapshot(timestamptz, timestamptz) from public;
grant execute on function public.translation_budget_snapshot(timestamptz, timestamptz) to service_role;

-- Recreate the episode reservation RPC so saved and unsaved translations consume one shared budget.
create or replace function public.reserve_episode_translation(
  p_request_id uuid,
  p_episode_id uuid,
  p_source_hash text,
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
  v_translation public.episode_translations%rowtype;
  v_log_id uuid;
begin
  if p_source_hash is null or length(p_source_hash) < 32 then
    raise exception 'Invalid source hash' using errcode = '22023';
  end if;

  if p_target_language <> 'en' then
    raise exception 'Unsupported target language: %', p_target_language using errcode = '22023';
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
      p_episode_id::text || ':' || p_target_language || ':' || p_source_hash,
      0
    )
  );

  update public.episode_translations
  set
    status = 'failed',
    error_code = coalesce(error_code, 'translation_reservation_expired'),
    updated_at = now()
  where episode_id = p_episode_id
    and target_language = p_target_language
    and source_hash = p_source_hash
    and status = 'translating'
    and started_at < now() - interval '15 minutes';

  select *
  into v_translation
  from public.episode_translations
  where episode_id = p_episode_id
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
    insert into public.episode_translation_logs (
      request_id, episode_id, source_hash, target_language, user_id, model,
      status, success, is_counted, source_chars, estimated_input_tokens,
      estimated_output_tokens, cost_estimate_jpy, error_code, error_message
    ) values (
      p_request_id, p_episode_id, p_source_hash, p_target_language, p_user_id, p_model,
      'rate_limited', false, false, p_source_chars, p_estimated_input_tokens,
      p_estimated_output_tokens, p_cost_estimate_jpy,
      'translation_daily_request_limit', 'Daily translation request limit reached'
    ) returning id into v_log_id;

    return query select false, 'daily_request_limit'::text, null::uuid, v_log_id;
    return;
  end if;

  if p_daily_max_estimated_cost_jpy = 0
    or v_estimated_cost + p_cost_estimate_jpy > p_daily_max_estimated_cost_jpy then
    insert into public.episode_translation_logs (
      request_id, episode_id, source_hash, target_language, user_id, model,
      status, success, is_counted, source_chars, estimated_input_tokens,
      estimated_output_tokens, cost_estimate_jpy, error_code, error_message
    ) values (
      p_request_id, p_episode_id, p_source_hash, p_target_language, p_user_id, p_model,
      'rate_limited', false, false, p_source_chars, p_estimated_input_tokens,
      p_estimated_output_tokens, p_cost_estimate_jpy,
      'translation_daily_cost_limit', 'Daily translation cost limit reached'
    ) returning id into v_log_id;

    return query select false, 'daily_cost_limit'::text, null::uuid, v_log_id;
    return;
  end if;

  insert into public.episode_translations (
    episode_id,
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
    p_episode_id,
    'ja',
    p_target_language,
    p_source_hash,
    1,
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
  on conflict (episode_id, target_language, source_hash)
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

  insert into public.episode_translation_logs (
    request_id,
    translation_id,
    episode_id,
    source_hash,
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
    p_episode_id,
    p_source_hash,
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

revoke all on function public.reserve_episode_translation(
  uuid, uuid, text, text, uuid, text, integer, integer, integer, numeric, integer, numeric
) from public;

grant execute on function public.reserve_episode_translation(
  uuid, uuid, text, text, uuid, text, integer, integer, integer, numeric, integer, numeric
) to service_role;

create or replace function public.reserve_generated_story_translation(
  p_request_id uuid,
  p_story_id text,
  p_source_hash text,
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
  v_translation public.generated_story_translations%rowtype;
  v_log_id uuid;
begin
  if p_story_id is null or length(trim(p_story_id)) < 8 then
    raise exception 'Invalid story id' using errcode = '22023';
  end if;

  if p_source_hash is null or length(p_source_hash) < 32 then
    raise exception 'Invalid source hash' using errcode = '22023';
  end if;

  if p_target_language <> 'en' then
    raise exception 'Unsupported target language: %', p_target_language using errcode = '22023';
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
      p_story_id || ':' || p_target_language || ':' || p_source_hash,
      0
    )
  );

  delete from public.generated_story_translations
  where expires_at < now();

  update public.generated_story_translations
  set
    status = 'failed',
    error_code = coalesce(error_code, 'translation_reservation_expired'),
    updated_at = now()
  where story_id = p_story_id
    and target_language = p_target_language
    and source_hash = p_source_hash
    and status = 'translating'
    and started_at < now() - interval '15 minutes';

  select *
  into v_translation
  from public.generated_story_translations
  where story_id = p_story_id
    and target_language = p_target_language
    and source_hash = p_source_hash
    and expires_at >= now()
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
    insert into public.generated_story_translation_logs (
      request_id, story_id, source_hash, target_language, user_id, model,
      status, success, is_counted, source_chars, estimated_input_tokens,
      estimated_output_tokens, cost_estimate_jpy, error_code, error_message
    ) values (
      p_request_id, p_story_id, p_source_hash, p_target_language, p_user_id, p_model,
      'rate_limited', false, false, p_source_chars, p_estimated_input_tokens,
      p_estimated_output_tokens, p_cost_estimate_jpy,
      'translation_daily_request_limit', 'Daily translation request limit reached'
    ) returning id into v_log_id;

    return query select false, 'daily_request_limit'::text, null::uuid, v_log_id;
    return;
  end if;

  if p_daily_max_estimated_cost_jpy = 0
    or v_estimated_cost + p_cost_estimate_jpy > p_daily_max_estimated_cost_jpy then
    insert into public.generated_story_translation_logs (
      request_id, story_id, source_hash, target_language, user_id, model,
      status, success, is_counted, source_chars, estimated_input_tokens,
      estimated_output_tokens, cost_estimate_jpy, error_code, error_message
    ) values (
      p_request_id, p_story_id, p_source_hash, p_target_language, p_user_id, p_model,
      'rate_limited', false, false, p_source_chars, p_estimated_input_tokens,
      p_estimated_output_tokens, p_cost_estimate_jpy,
      'translation_daily_cost_limit', 'Daily translation cost limit reached'
    ) returning id into v_log_id;

    return query select false, 'daily_cost_limit'::text, null::uuid, v_log_id;
    return;
  end if;

  insert into public.generated_story_translations (
    story_id,
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
    expires_at,
    updated_at
  ) values (
    p_story_id,
    'ja',
    p_target_language,
    p_source_hash,
    1,
    'translating',
    null,
    p_model,
    p_user_id,
    p_cost_estimate_jpy,
    null,
    now(),
    null,
    now() + interval '48 hours',
    now()
  )
  on conflict (story_id, target_language, source_hash)
  do update set
    status = 'translating',
    segments = null,
    translation_model = excluded.translation_model,
    requested_by_user_id = excluded.requested_by_user_id,
    estimated_cost_jpy = excluded.estimated_cost_jpy,
    error_code = null,
    started_at = now(),
    completed_at = null,
    expires_at = now() + interval '48 hours',
    updated_at = now()
  returning * into v_translation;

  insert into public.generated_story_translation_logs (
    request_id,
    translation_id,
    story_id,
    source_hash,
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
    p_story_id,
    p_source_hash,
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

revoke all on function public.reserve_generated_story_translation(
  uuid, text, text, text, uuid, text, integer, integer, integer, numeric, integer, numeric
) from public;

grant execute on function public.reserve_generated_story_translation(
  uuid, text, text, text, uuid, text, integer, integer, integer, numeric, integer, numeric
) to service_role;
