-- Free users share one daily five-action bucket between story generation and
-- translation generation. Subscribers keep the existing per-action limits.
-- Counts reset at midnight in Asia/Tokyo and existing logs are counted as-is.

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
  v_quota_scope text;
  v_shared_free_quota boolean;
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
    and p_action_type in ('story_generation', 'translation_generation');
  v_quota_scope := case
    when v_shared_free_quota then 'free_story_and_translation'
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
      (v_shared_free_quota and log.action_type in ('story_generation', 'translation_generation'))
      or
      (not v_shared_free_quota and log.action_type = p_action_type)
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
      ('translation_generation'::text, p_free_story_limit, p_subscriber_translation_limit),
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
    on log.is_counted = true
   and (
     (
       v_plan_type = 'free'
       and actions.action_name in ('story_generation', 'translation_generation')
       and log.action_type in ('story_generation', 'translation_generation')
     )
     or
     (
       not (
         v_plan_type = 'free'
         and actions.action_name in ('story_generation', 'translation_generation')
       )
       and log.action_type = actions.action_name
     )
   )
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
revoke all on function public.get_libread_daily_ai_usage(uuid, text, integer, integer, integer, integer, integer, integer) from public;
grant execute on function public.reserve_libread_daily_ai_action(uuid, uuid, text, text, integer, integer) to service_role;
grant execute on function public.get_libread_daily_ai_usage(uuid, text, integer, integer, integer, integer, integer, integer) to service_role;
