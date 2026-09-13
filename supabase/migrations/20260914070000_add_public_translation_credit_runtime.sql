-- Runtime support for public translation entitlements and one-time credit purchases.
-- Existing translation assets, unlock identity, and append-only credit_ledger remain intact.
-- Daily allowance continues to use action_type=translation_generation for rollout-day
-- compatibility; usage_reason distinguishes new entitlement consumption from legacy generation.

alter table public.libread_daily_ai_action_logs
  add column if not exists usage_reason text;

comment on column public.libread_daily_ai_action_logs.usage_reason is
  'Optional semantic reason for the daily usage row. public_translation_unlock marks entitlement consumption while preserving the legacy translation_generation quota bucket.';

create table if not exists public.credit_purchase_lots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  pack_id text not null,
  stripe_checkout_session_id text not null unique,
  stripe_payment_intent_id text,
  credits_granted integer not null check (credits_granted > 0),
  expires_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (length(btrim(pack_id)) between 1 and 80),
  check (length(btrim(stripe_checkout_session_id)) between 1 and 255),
  check (jsonb_typeof(metadata) = 'object')
);

create index if not exists idx_credit_purchase_lots_user_expiry
  on public.credit_purchase_lots (user_id, expires_at asc, created_at asc);
create index if not exists idx_credit_purchase_lots_payment_intent
  on public.credit_purchase_lots (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

create table if not exists public.credit_purchase_reversals (
  id uuid primary key default gen_random_uuid(),
  purchase_lot_id uuid not null references public.credit_purchase_lots(id) on delete restrict,
  stripe_event_key text not null unique,
  reversal_type text not null check (reversal_type in ('refund', 'dispute')),
  credits_reversed integer not null check (credits_reversed > 0),
  created_at timestamptz not null default now()
);

alter table public.credit_purchase_lots enable row level security;
alter table public.credit_purchase_reversals enable row level security;
revoke all on table public.credit_purchase_lots from anon, authenticated;
revoke all on table public.credit_purchase_reversals from anon, authenticated;
grant select on table public.credit_purchase_lots to authenticated;
grant all on table public.credit_purchase_lots to service_role;
grant all on table public.credit_purchase_reversals to service_role;

create policy credit_purchase_lots_select_own
on public.credit_purchase_lots
for select
to authenticated
using (auth.uid() = user_id);

-- Atomically consume the existing daily translation bucket and create an unlock.
-- The legacy translation_generation bucket is deliberately retained so usage before
-- and after enabling the feature flag counts toward the same Free/Premium limit.
create or replace function public.unlock_public_episode_translation_included(
  p_user_id uuid,
  p_episode_id uuid,
  p_source_language text,
  p_target_language text,
  p_request_id uuid,
  p_free_daily_limit integer,
  p_subscriber_daily_limit integer
)
returns table (
  allowed boolean,
  result_type text,
  unlock_id uuid,
  used_count integer,
  limit_count integer,
  plan_type text,
  reset_at timestamptz,
  consumed_allowance boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_language text := btrim(coalesce(p_target_language, ''));
  v_source_language text := btrim(coalesce(p_source_language, ''));
  v_day_start timestamptz;
  v_reset_at timestamptz;
  v_plan_type text := 'free';
  v_limit integer;
  v_used integer;
  v_unlock public.public_episode_translation_unlocks%rowtype;
  v_log_id uuid;
  v_quota_scope text;
begin
  if p_user_id is null or not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'Unknown user' using errcode = '22023';
  end if;
  if p_episode_id is null or not exists (select 1 from public.episodes where id = p_episode_id) then
    raise exception 'Unknown episode' using errcode = '22023';
  end if;
  if p_request_id is null then
    raise exception 'Request ID is required' using errcode = '22023';
  end if;
  if p_free_daily_limit < 0 or p_subscriber_daily_limit < 0 then
    raise exception 'Invalid action limit' using errcode = '22023';
  end if;
  if v_source_language = '' or length(v_source_language) > 35 or v_source_language !~* '^[a-z]{2,3}(-[a-z0-9]{2,8})*$' then
    raise exception 'Invalid source language' using errcode = '22023';
  end if;
  if v_target_language = '' or length(v_target_language) > 35 or v_target_language !~* '^[a-z]{2,3}(-[a-z0-9]{2,8})*$' then
    raise exception 'Invalid target language' using errcode = '22023';
  end if;
  if lower(v_source_language) = lower(v_target_language) then
    raise exception 'Source and target languages must differ' using errcode = '22023';
  end if;

  v_day_start := date_trunc('day', now() at time zone 'Asia/Tokyo') at time zone 'Asia/Tokyo';
  v_reset_at := v_day_start + interval '1 day';

  if exists (
    select 1 from public.libread_user_entitlements entitlement
    where entitlement.user_id = p_user_id
      and entitlement.plan_type = 'subscriber'
      and (entitlement.subscriber_until is null or entitlement.subscriber_until > now())
  ) then
    v_plan_type := 'subscriber';
  end if;

  v_limit := case when v_plan_type = 'subscriber' then p_subscriber_daily_limit else p_free_daily_limit end;
  v_quota_scope := case when v_plan_type = 'subscriber' then 'translation_generation' else 'free_story_and_translation' end;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || v_quota_scope, 0));
  perform pg_advisory_xact_lock(hashtextextended(
    'translation-unlock:' || p_user_id::text || ':' || p_episode_id::text || ':' || lower(v_target_language), 0
  ));

  select * into v_unlock
  from public.public_episode_translation_unlocks unlock_row
  where unlock_row.user_id = p_user_id
    and unlock_row.episode_id = p_episode_id
    and lower(unlock_row.target_language) = lower(v_target_language)
  limit 1;

  select count(*)::integer into v_used
  from public.libread_daily_ai_action_logs log
  where log.is_counted = true
    and log.created_at >= v_day_start
    and log.created_at < v_reset_at
    and log.user_id = p_user_id
    and (
      (v_plan_type = 'free' and log.action_type in ('story_generation', 'translation_generation'))
      or
      (v_plan_type = 'subscriber' and log.action_type = 'translation_generation')
    );

  if v_unlock.id is not null then
    return query select true, 'already_unlocked'::text, v_unlock.id, v_used, v_limit, v_plan_type, v_reset_at, false;
    return;
  end if;

  select log.id into v_log_id
  from public.libread_daily_ai_action_logs log
  where log.request_id = p_request_id and log.is_counted = true;

  if v_log_id is not null then
    return query select false, 'request_already_used'::text, null::uuid, v_used, v_limit, v_plan_type, v_reset_at, false;
    return;
  end if;

  if v_limit = 0 or v_used >= v_limit then
    return query select false, 'daily_limit'::text, null::uuid, v_used, v_limit, v_plan_type, v_reset_at, false;
    return;
  end if;

  insert into public.libread_daily_ai_action_logs (
    request_id, user_id, anonymous_key, action_type, usage_reason
  ) values (
    p_request_id, p_user_id, null, 'translation_generation', 'public_translation_unlock'
  );

  insert into public.public_episode_translation_unlocks (
    user_id, episode_id, target_language, unlock_source, credit_cost
  ) values (
    p_user_id,
    p_episode_id,
    v_target_language,
    case when v_plan_type = 'subscriber' then 'included_premium' else 'included_free' end,
    0
  ) returning * into v_unlock;

  return query select true, 'unlocked'::text, v_unlock.id, v_used + 1, v_limit, v_plan_type, v_reset_at, true;
end;
$$;

-- Stripe grants are accepted only through the service-role webhook path. The
-- expiration timestamp is mandatory; Live checkout stays disabled until an expiry
-- policy is approved and represented by the server-side catalog.
create or replace function public.grant_credit_purchase(
  p_user_id uuid,
  p_pack_id text,
  p_checkout_session_id text,
  p_payment_intent_id text,
  p_credits integer,
  p_expires_at timestamptz,
  p_idempotency_key text,
  p_metadata jsonb default '{}'::jsonb
)
returns table (
  granted boolean,
  purchase_lot_id uuid,
  ledger_entry_id uuid,
  balance_after bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lot public.credit_purchase_lots%rowtype;
  v_ledger_id uuid;
  v_balance bigint;
begin
  if p_user_id is null or not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'Unknown user' using errcode = '22023';
  end if;
  if p_credits <= 0 or p_expires_at is null or p_expires_at <= now() then
    raise exception 'Invalid purchase grant' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_pack_id, '')), '') is null
    or nullif(btrim(coalesce(p_checkout_session_id, '')), '') is null
    or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null then
    raise exception 'Missing purchase identity' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('credit-balance:' || p_user_id::text, 0));

  select * into v_lot from public.credit_purchase_lots
  where stripe_checkout_session_id = btrim(p_checkout_session_id)
  limit 1;

  if v_lot.id is not null then
    select id into v_ledger_id from public.credit_ledger
    where user_id = p_user_id and idempotency_key = btrim(p_idempotency_key)
    limit 1;
    select coalesce(sum(amount), 0)::bigint into v_balance from public.credit_ledger where user_id = p_user_id;
    return query select false, v_lot.id, v_ledger_id, v_balance;
    return;
  end if;

  insert into public.credit_purchase_lots (
    user_id, pack_id, stripe_checkout_session_id, stripe_payment_intent_id,
    credits_granted, expires_at, metadata
  ) values (
    p_user_id, btrim(p_pack_id), btrim(p_checkout_session_id), nullif(btrim(coalesce(p_payment_intent_id, '')), ''),
    p_credits, p_expires_at, coalesce(p_metadata, '{}'::jsonb)
  ) returning * into v_lot;

  insert into public.credit_ledger (
    user_id, amount, entry_type, idempotency_key, metadata
  ) values (
    p_user_id,
    p_credits,
    'purchase',
    btrim(p_idempotency_key),
    jsonb_build_object(
      'purchase_lot_id', v_lot.id,
      'pack_id', v_lot.pack_id,
      'stripe_checkout_session_id', v_lot.stripe_checkout_session_id,
      'expires_at', v_lot.expires_at
    ) || coalesce(p_metadata, '{}'::jsonb)
  ) returning id into v_ledger_id;

  select coalesce(sum(amount), 0)::bigint into v_balance from public.credit_ledger where user_id = p_user_id;
  return query select true, v_lot.id, v_ledger_id, v_balance;
end;
$$;

-- Full refund/dispute reversal. Partial refunds are intentionally not guessed at;
-- the webhook records them for manual policy handling until a partial-refund rule is approved.
create or replace function public.reverse_credit_purchase_full(
  p_payment_intent_id text,
  p_stripe_event_key text,
  p_reversal_type text
)
returns table (
  reversed boolean,
  user_id uuid,
  credits_reversed integer,
  balance_after bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lot public.credit_purchase_lots%rowtype;
  v_already integer := 0;
  v_reverse integer := 0;
  v_balance bigint := 0;
begin
  if p_reversal_type not in ('refund', 'dispute') then
    raise exception 'Invalid reversal type' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_payment_intent_id, '')), '') is null
    or nullif(btrim(coalesce(p_stripe_event_key, '')), '') is null then
    raise exception 'Missing reversal identity' using errcode = '22023';
  end if;

  select * into v_lot from public.credit_purchase_lots
  where stripe_payment_intent_id = btrim(p_payment_intent_id)
  order by created_at desc limit 1;
  if v_lot.id is null then
    return query select false, null::uuid, 0, 0::bigint;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('credit-balance:' || v_lot.user_id::text, 0));

  if exists (select 1 from public.credit_purchase_reversals where stripe_event_key = btrim(p_stripe_event_key)) then
    select coalesce(sum(amount), 0)::bigint into v_balance from public.credit_ledger where credit_ledger.user_id = v_lot.user_id;
    return query select false, v_lot.user_id, 0, v_balance;
    return;
  end if;

  select coalesce(sum(credits_reversed), 0)::integer into v_already
  from public.credit_purchase_reversals where purchase_lot_id = v_lot.id;
  v_reverse := greatest(0, v_lot.credits_granted - v_already);

  if v_reverse = 0 then
    select coalesce(sum(amount), 0)::bigint into v_balance from public.credit_ledger where credit_ledger.user_id = v_lot.user_id;
    return query select false, v_lot.user_id, 0, v_balance;
    return;
  end if;

  insert into public.credit_purchase_reversals (
    purchase_lot_id, stripe_event_key, reversal_type, credits_reversed
  ) values (v_lot.id, btrim(p_stripe_event_key), p_reversal_type, v_reverse);

  insert into public.credit_ledger (
    user_id, amount, entry_type, idempotency_key, metadata
  ) values (
    v_lot.user_id,
    -v_reverse,
    p_reversal_type,
    'stripe_reversal:' || btrim(p_stripe_event_key),
    jsonb_build_object(
      'purchase_lot_id', v_lot.id,
      'stripe_payment_intent_id', v_lot.stripe_payment_intent_id,
      'reversal_type', p_reversal_type
    )
  );

  select coalesce(sum(amount), 0)::bigint into v_balance from public.credit_ledger where credit_ledger.user_id = v_lot.user_id;
  return query select true, v_lot.user_id, v_reverse, v_balance;
end;
$$;

revoke all on function public.unlock_public_episode_translation_included(uuid, uuid, text, text, uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.unlock_public_episode_translation_included(uuid, uuid, text, text, uuid, integer, integer) to service_role;
revoke all on function public.grant_credit_purchase(uuid, text, text, text, integer, timestamptz, text, jsonb) from public, anon, authenticated;
grant execute on function public.grant_credit_purchase(uuid, text, text, text, integer, timestamptz, text, jsonb) to service_role;
revoke all on function public.reverse_credit_purchase_full(text, text, text) from public, anon, authenticated;
grant execute on function public.reverse_credit_purchase_full(text, text, text) to service_role;
