-- User-facing daily AI action counts and a payment-provider-independent entitlement gate.
-- Counts reset at midnight in Asia/Tokyo. Existing global cost guardrails remain active.

create table if not exists public.libread_user_entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan_type text not null default 'free'
    check (plan_type in ('free', 'subscriber')),
  subscriber_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.libread_user_entitlements enable row level security;
revoke all on table public.libread_user_entitlements from anon, authenticated;
grant all on table public.libread_user_entitlements to service_role;

create table if not exists public.libread_daily_ai_action_logs (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  user_id uuid references auth.users(id) on delete cascade,
  anonymous_key text,
  action_type text not null
    check (action_type in ('story_generation', 'translation_generation', 'word_explanation')),
  is_counted boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (user_id is not null or nullif(btrim(anonymous_key), '') is not null)
);

create index if not exists idx_libread_daily_ai_action_user
  on public.libread_daily_ai_action_logs (user_id, action_type, created_at desc)
  where is_counted = true and user_id is not null;

create index if not exists idx_libread_daily_ai_action_anonymous
  on public.libread_daily_ai_action_logs (anonymous_key, action_type, created_at desc)
  where is_counted = true and user_id is null;

alter table public.libread_daily_ai_action_logs enable row level security;
revoke all on table public.libread_daily_ai_action_logs from anon, authenticated;
grant all on table public.libread_daily_ai_action_logs to service_role;

create or replace function public.reserve_libread_daily_ai_action(
  p_request_id uuid,
  p_user_id uuid,
  p_anonymous_key text,
  p_action_type text,
  p_free_limit integer,
  p_subscriber_limit integer
)
returns table (
  allowed boolean,
  used_count integer,
  limit_count integer,
  plan_type text,
  reset_at timestamptz,
  log_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day_start timestamptz;
  v_reset_at timestamptz;
  v_plan_type text := 'free';
  v_limit integer;
  v_used integer;
  v_log_id uuid;
  v_identity text;
begin
  if p_action_type not in ('story_generation', 'translation_generation', 'word_explanation') then
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
  perform pg_advisory_xact_lock(hashtextextended(v_identity || ':' || p_action_type, 0));

  if p_user_id is not null and exists (
    select 1
    from public.libread_user_entitlements entitlement
    where entitlement.user_id = p_user_id
      and entitlement.plan_type = 'subscriber'
      and (entitlement.subscriber_until is null or entitlement.subscriber_until > now())
  ) then
    v_plan_type := 'subscriber';
  end if;

  v_limit := case when v_plan_type = 'subscriber' then p_subscriber_limit else p_free_limit end;

  select log.id into v_log_id
  from public.libread_daily_ai_action_logs log
  where log.request_id = p_request_id
    and log.is_counted = true;

  select count(*)::integer into v_used
  from public.libread_daily_ai_action_logs log
  where log.is_counted = true
    and log.action_type = p_action_type
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
$$;

create or replace function public.release_libread_daily_ai_action(p_request_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.libread_daily_ai_action_logs
  set is_counted = false, updated_at = now()
  where request_id = p_request_id and is_counted = true;
$$;

create or replace function public.get_libread_daily_ai_usage(
  p_user_id uuid,
  p_anonymous_key text,
  p_free_story_limit integer,
  p_subscriber_story_limit integer,
  p_free_translation_limit integer,
  p_subscriber_translation_limit integer,
  p_free_word_limit integer,
  p_subscriber_word_limit integer
)
returns table (
  action_type text,
  used_count integer,
  limit_count integer,
  plan_type text,
  reset_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day_start timestamptz;
  v_reset_at timestamptz;
  v_plan_type text := 'free';
begin
  if p_user_id is null and nullif(btrim(coalesce(p_anonymous_key, '')), '') is null then
    raise exception 'Missing quota identity' using errcode = '22023';
  end if;

  v_day_start := date_trunc('day', now() at time zone 'Asia/Tokyo') at time zone 'Asia/Tokyo';
  v_reset_at := v_day_start + interval '1 day';

  if p_user_id is not null and exists (
    select 1
    from public.libread_user_entitlements entitlement
    where entitlement.user_id = p_user_id
      and entitlement.plan_type = 'subscriber'
      and (entitlement.subscriber_until is null or entitlement.subscriber_until > now())
  ) then
    v_plan_type := 'subscriber';
  end if;

  return query
  with actions(action_name, free_limit, subscriber_limit) as (
    values
      ('story_generation'::text, p_free_story_limit, p_subscriber_story_limit),
      ('translation_generation'::text, p_free_translation_limit, p_subscriber_translation_limit),
      ('word_explanation'::text, p_free_word_limit, p_subscriber_word_limit)
  )
  select
    actions.action_name,
    count(log.id)::integer,
    case when v_plan_type = 'subscriber' then actions.subscriber_limit else actions.free_limit end,
    v_plan_type,
    v_reset_at
  from actions
  left join public.libread_daily_ai_action_logs log
    on log.action_type = actions.action_name
   and log.is_counted = true
   and log.created_at >= v_day_start
   and log.created_at < v_reset_at
   and (
     (p_user_id is not null and log.user_id = p_user_id)
     or
     (p_user_id is null and log.user_id is null and log.anonymous_key = btrim(p_anonymous_key))
   )
  group by actions.action_name, actions.free_limit, actions.subscriber_limit;
end;
$$;

revoke all on function public.reserve_libread_daily_ai_action(uuid, uuid, text, text, integer, integer) from public;
revoke all on function public.release_libread_daily_ai_action(uuid) from public;
revoke all on function public.get_libread_daily_ai_usage(uuid, text, integer, integer, integer, integer, integer, integer) from public;
grant execute on function public.reserve_libread_daily_ai_action(uuid, uuid, text, text, integer, integer) to service_role;
grant execute on function public.release_libread_daily_ai_action(uuid) to service_role;
grant execute on function public.get_libread_daily_ai_usage(uuid, text, integer, integer, integer, integer, integer, integer) to service_role;
