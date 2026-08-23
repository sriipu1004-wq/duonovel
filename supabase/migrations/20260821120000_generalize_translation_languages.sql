-- Generalize translation reservations and cache identity without rewriting existing v1 data.
-- Existing ja -> en rows remain valid and keep their current source hashes.

alter table public.episode_translation_logs
  add column if not exists source_language text;

update public.episode_translation_logs
set source_language = 'ja'
where source_language is null;

alter table public.episode_translation_logs
  alter column source_language set default 'ja',
  alter column source_language set not null;

alter table public.generated_story_translation_logs
  add column if not exists source_language text;

update public.generated_story_translation_logs
set source_language = 'ja'
where source_language is null;

alter table public.generated_story_translation_logs
  alter column source_language set default 'ja',
  alter column source_language set not null;

alter table public.episode_translations
  drop constraint if exists episode_translations_episode_id_target_language_source_hash_key;

alter table public.episode_translations
  add constraint episode_translations_episode_source_target_hash_key
  unique (episode_id, source_language, target_language, source_hash);

alter table public.generated_story_translations
  drop constraint if exists generated_story_translations_story_id_target_language_source_hash_key;

alter table public.generated_story_translations
  add constraint generated_story_translations_story_source_target_hash_key
  unique (story_id, source_language, target_language, source_hash);

create index if not exists idx_episode_translations_episode_source_target_updated
  on public.episode_translations (
    episode_id,
    source_language,
    target_language,
    updated_at desc
  );

create index if not exists idx_generated_story_translations_story_source_target_updated
  on public.generated_story_translations (
    story_id,
    source_language,
    target_language,
    updated_at desc
  );

create or replace function public.reserve_episode_translation_v2(
  p_request_id uuid,
  p_episode_id uuid,
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
  v_translation public.episode_translations%rowtype;
  v_log_id uuid;
begin
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
      p_episode_id::text || ':' || p_source_language || ':' ||
        p_target_language || ':' || p_source_hash,
      0
    )
  );

  update public.episode_translations
  set
    status = 'failed',
    error_code = coalesce(error_code, 'translation_reservation_expired'),
    updated_at = now()
  where episode_id = p_episode_id
    and source_language = p_source_language
    and target_language = p_target_language
    and source_hash = p_source_hash
    and status = 'translating'
    and started_at < now() - interval '15 minutes';

  select *
  into v_translation
  from public.episode_translations
  where episode_id = p_episode_id
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
    insert into public.episode_translation_logs (
      request_id, episode_id, source_hash, source_language, target_language,
      user_id, model, status, success, is_counted, source_chars,
      estimated_input_tokens, estimated_output_tokens, cost_estimate_jpy,
      error_code, error_message
    ) values (
      p_request_id, p_episode_id, p_source_hash, p_source_language,
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
    insert into public.episode_translation_logs (
      request_id, episode_id, source_hash, source_language, target_language,
      user_id, model, status, success, is_counted, source_chars,
      estimated_input_tokens, estimated_output_tokens, cost_estimate_jpy,
      error_code, error_message
    ) values (
      p_request_id, p_episode_id, p_source_hash, p_source_language,
      p_target_language, p_user_id, p_model, 'rate_limited', false, false,
      p_source_chars, p_estimated_input_tokens, p_estimated_output_tokens,
      p_cost_estimate_jpy, 'translation_daily_cost_limit',
      'Daily translation cost limit reached'
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
  on conflict (episode_id, source_language, target_language, source_hash)
  do update set
    status = 'translating',
    segments = null,
    segment_version = excluded.segment_version,
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
    p_episode_id,
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

create or replace function public.reserve_generated_story_translation_v2(
  p_request_id uuid,
  p_story_id text,
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
  v_translation public.generated_story_translations%rowtype;
  v_log_id uuid;
begin
  if p_story_id is null or length(trim(p_story_id)) < 8 then
    raise exception 'Invalid story id' using errcode = '22023';
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
      p_story_id || ':' || p_source_language || ':' ||
        p_target_language || ':' || p_source_hash,
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
    and source_language = p_source_language
    and target_language = p_target_language
    and source_hash = p_source_hash
    and status = 'translating'
    and started_at < now() - interval '15 minutes';

  select *
  into v_translation
  from public.generated_story_translations
  where story_id = p_story_id
    and source_language = p_source_language
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
      request_id, story_id, source_hash, source_language, target_language,
      user_id, model, status, success, is_counted, source_chars,
      estimated_input_tokens, estimated_output_tokens, cost_estimate_jpy,
      error_code, error_message
    ) values (
      p_request_id, p_story_id, p_source_hash, p_source_language,
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
    insert into public.generated_story_translation_logs (
      request_id, story_id, source_hash, source_language, target_language,
      user_id, model, status, success, is_counted, source_chars,
      estimated_input_tokens, estimated_output_tokens, cost_estimate_jpy,
      error_code, error_message
    ) values (
      p_request_id, p_story_id, p_source_hash, p_source_language,
      p_target_language, p_user_id, p_model, 'rate_limited', false, false,
      p_source_chars, p_estimated_input_tokens, p_estimated_output_tokens,
      p_cost_estimate_jpy, 'translation_daily_cost_limit',
      'Daily translation cost limit reached'
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
    now() + interval '48 hours',
    now()
  )
  on conflict (story_id, source_language, target_language, source_hash)
  do update set
    status = 'translating',
    segments = null,
    segment_version = excluded.segment_version,
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
    p_story_id,
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

-- Keep the legacy signatures available during deployment. They now delegate to
-- the generic reservations instead of enforcing target_language = 'en'.
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
language sql
security definer
set search_path = public
as $$
  select *
  from public.reserve_episode_translation_v2(
    p_request_id,
    p_episode_id,
    p_source_hash,
    'ja',
    p_target_language,
    p_user_id,
    p_model,
    p_source_chars,
    p_estimated_input_tokens,
    p_estimated_output_tokens,
    p_cost_estimate_jpy,
    p_daily_max_requests,
    p_daily_max_estimated_cost_jpy
  );
$$;

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
language sql
security definer
set search_path = public
as $$
  select *
  from public.reserve_generated_story_translation_v2(
    p_request_id,
    p_story_id,
    p_source_hash,
    'ja',
    p_target_language,
    p_user_id,
    p_model,
    p_source_chars,
    p_estimated_input_tokens,
    p_estimated_output_tokens,
    p_cost_estimate_jpy,
    p_daily_max_requests,
    p_daily_max_estimated_cost_jpy
  );
$$;

revoke all on function public.reserve_episode_translation_v2(
  uuid, uuid, text, text, text, uuid, text, integer, integer, integer,
  numeric, integer, numeric
) from public;

grant execute on function public.reserve_episode_translation_v2(
  uuid, uuid, text, text, text, uuid, text, integer, integer, integer,
  numeric, integer, numeric
) to service_role;

revoke all on function public.reserve_generated_story_translation_v2(
  uuid, text, text, text, text, uuid, text, integer, integer, integer,
  numeric, integer, numeric
) from public;

grant execute on function public.reserve_generated_story_translation_v2(
  uuid, text, text, text, text, uuid, text, integer, integer, integer,
  numeric, integer, numeric
) to service_role;

revoke all on function public.reserve_episode_translation(
  uuid, uuid, text, text, uuid, text, integer, integer, integer,
  numeric, integer, numeric
) from public;

grant execute on function public.reserve_episode_translation(
  uuid, uuid, text, text, uuid, text, integer, integer, integer,
  numeric, integer, numeric
) to service_role;

revoke all on function public.reserve_generated_story_translation(
  uuid, text, text, text, uuid, text, integer, integer, integer,
  numeric, integer, numeric
) from public;

grant execute on function public.reserve_generated_story_translation(
  uuid, text, text, text, uuid, text, integer, integer, integer,
  numeric, integer, numeric
) to service_role;
