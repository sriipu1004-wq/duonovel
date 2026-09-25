-- Retire story generation from the active quota model.
-- Historical story_generation rows stay valid for audit/billing history and are
-- counted only as legacy members of the current day's shared Free bucket.
begin;

-- AI creative-writing generation has been removed from the product. Purge
-- persisted works created by that first-party generator as well. Foreign-key
-- cascades remove their episodes, bookmarks, translations, recordings and
-- other work-scoped rows. Generation audit logs retain their event history and
-- lose the series reference via the existing ON DELETE SET NULL relationship.
delete from public.series
where effect_settings @> '{"source":"time_fit_ai_story"}'::jsonb;

alter table public.libread_daily_ai_action_logs
  drop constraint if exists libread_daily_ai_action_logs_action_type_check;

alter table public.libread_daily_ai_action_logs
  add constraint libread_daily_ai_action_logs_action_type_check
  check (action_type in (
    'story_generation',
    'library_import',
    'translation_generation',
    'word_explanation'
  ));

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
$$;

-- Keep the existing RPC signature during rollout because clients call named
-- parameters. The two *_story_limit parameters now carry the shared
-- library-import/public-translation Free limit and the library-import
-- subscriber display limit respectively.
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
      ('library_import'::text, p_free_story_limit, p_subscriber_story_limit),
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
       and actions.action_name in ('library_import', 'translation_generation')
       and log.action_type in (
         'library_import',
         'translation_generation',
         'story_generation'
       )
     )
     or
     (
       not (
         v_plan_type = 'free'
         and actions.action_name in ('library_import', 'translation_generation')
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

create or replace function public.count_private_library_import_usage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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
$$;

revoke all on function public.reserve_libread_daily_ai_action(uuid, uuid, text, text, integer, integer) from public;
revoke all on function public.get_libread_daily_ai_usage(uuid, text, integer, integer, integer, integer, integer, integer) from public;
grant execute on function public.reserve_libread_daily_ai_action(uuid, uuid, text, text, integer, integer) to service_role;
grant execute on function public.get_libread_daily_ai_usage(uuid, text, integer, integer, integer, integer, integer, integer) to service_role;

commit;
