-- Additive expiration/allocation layer for purchased credit lots.
-- credit_ledger remains append-only and authoritative; expiration is represented
-- by a compensating negative ledger row and purchased credits are consumed from
-- the earliest-expiring active lot first.

alter table public.credit_purchase_lots
  add column if not exists remaining_credits integer,
  add column if not exists expired_credits integer not null default 0,
  add column if not exists expired_at timestamptz;

update public.credit_purchase_lots
set remaining_credits = credits_granted
where remaining_credits is null;

alter table public.credit_purchase_lots
  alter column remaining_credits set not null;

alter table public.credit_purchase_lots
  add constraint credit_purchase_lots_remaining_nonnegative
  check (remaining_credits >= 0),
  add constraint credit_purchase_lots_expired_nonnegative
  check (expired_credits >= 0 and expired_credits <= credits_granted);

create or replace function public.refresh_credit_expirations(p_user_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lot public.credit_purchase_lots%rowtype;
  v_expiring integer;
  v_balance bigint;
begin
  if p_user_id is null then
    raise exception 'User ID is required' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('credit-balance:' || p_user_id::text, 0));

  for v_lot in
    select * from public.credit_purchase_lots
    where user_id = p_user_id
      and expires_at <= now()
      and remaining_credits > 0
    order by expires_at asc, created_at asc
    for update
  loop
    v_expiring := v_lot.remaining_credits;
    insert into public.credit_ledger (
      user_id, amount, entry_type, idempotency_key, metadata
    ) values (
      p_user_id,
      -v_expiring,
      'expiration',
      'credit_expiry:' || v_lot.id::text,
      jsonb_build_object(
        'purchase_lot_id', v_lot.id,
        'expired_credits', v_expiring,
        'expires_at', v_lot.expires_at
      )
    ) on conflict (user_id, idempotency_key) do nothing;

    update public.credit_purchase_lots
    set remaining_credits = 0,
        expired_credits = expired_credits + v_expiring,
        expired_at = coalesce(expired_at, now())
    where id = v_lot.id;
  end loop;

  select coalesce(sum(amount), 0)::bigint
  into v_balance
  from public.credit_ledger
  where user_id = p_user_id;

  return v_balance;
end;
$$;

-- Replace the child59 atomic credit unlock without changing its signature.
-- New behavior only adds lazy expiration and earliest-expiry lot allocation.
create or replace function public.unlock_public_episode_translation(
  p_user_id uuid,
  p_episode_id uuid,
  p_source_language text,
  p_target_language text,
  p_idempotency_key text
)
returns table (
  allowed boolean,
  result_type text,
  unlock_id uuid,
  ledger_entry_id uuid,
  credit_cost integer,
  balance_after bigint,
  charged boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_language text := btrim(coalesce(p_target_language, ''));
  v_source_language text := btrim(coalesce(p_source_language, ''));
  v_idempotency_key text := btrim(coalesce(p_idempotency_key, ''));
  v_credit_cost integer := 1;
  v_balance bigint := 0;
  v_unlock public.public_episode_translation_unlocks%rowtype;
  v_ledger_id uuid;
  v_lot_id uuid;
begin
  if p_user_id is null then
    raise exception 'User ID is required' using errcode = '22023';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'Unknown user' using errcode = '22023';
  end if;
  if p_episode_id is null or not exists (select 1 from public.episodes where id = p_episode_id) then
    raise exception 'Unknown episode' using errcode = '22023';
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
  if v_idempotency_key = '' or length(v_idempotency_key) > 200 then
    raise exception 'Invalid idempotency key' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('credit-balance:' || p_user_id::text, 0));
  v_balance := public.refresh_credit_expirations(p_user_id);
  perform pg_advisory_xact_lock(hashtextextended(
    'translation-unlock:' || p_user_id::text || ':' || p_episode_id::text || ':' || lower(v_target_language), 0
  ));

  select * into v_unlock
  from public.public_episode_translation_unlocks unlock_row
  where unlock_row.user_id = p_user_id
    and unlock_row.episode_id = p_episode_id
    and lower(unlock_row.target_language) = lower(v_target_language)
  limit 1;

  if v_unlock.id is not null then
    select ledger.id into v_ledger_id
    from public.credit_ledger ledger
    where ledger.user_id = p_user_id
      and ledger.entry_type = 'unlock'
      and ledger.related_unlock_id = v_unlock.id
    order by ledger.created_at asc limit 1;
    return query select true, 'already_unlocked'::text, v_unlock.id, v_ledger_id,
      v_unlock.credit_cost, v_balance, false;
    return;
  end if;

  if exists (
    select 1 from public.credit_ledger ledger
    where ledger.user_id = p_user_id and ledger.idempotency_key = v_idempotency_key
  ) then
    raise exception 'Idempotency key already used for another ledger operation' using errcode = '23505';
  end if;

  if v_balance < v_credit_cost then
    return query select false, 'insufficient_balance'::text, null::uuid, null::uuid,
      v_credit_cost, v_balance, false;
    return;
  end if;

  insert into public.public_episode_translation_unlocks (
    user_id, episode_id, target_language, unlock_source, credit_cost
  ) values (
    p_user_id, p_episode_id, v_target_language, 'credit', v_credit_cost
  ) returning * into v_unlock;

  insert into public.credit_ledger (
    user_id, amount, entry_type, idempotency_key, related_unlock_id,
    related_episode_id, metadata
  ) values (
    p_user_id, -v_credit_cost, 'unlock', v_idempotency_key, v_unlock.id,
    p_episode_id,
    jsonb_build_object(
      'target_language', v_target_language,
      'source_language_at_unlock', v_source_language
    )
  ) returning id into v_ledger_id;

  -- Consume purchased credits that expire soonest before non-expiring grants.
  select lot.id into v_lot_id
  from public.credit_purchase_lots lot
  where lot.user_id = p_user_id
    and lot.remaining_credits > 0
    and lot.expires_at > now()
  order by lot.expires_at asc, lot.created_at asc
  limit 1
  for update;

  if v_lot_id is not null then
    update public.credit_purchase_lots
    set remaining_credits = remaining_credits - 1
    where id = v_lot_id;
    update public.credit_ledger
    set metadata = metadata || jsonb_build_object('purchase_lot_id', v_lot_id)
    where id = v_ledger_id;
  end if;

  return query select true, 'unlocked'::text, v_unlock.id, v_ledger_id,
    v_credit_cost, v_balance - v_credit_cost, true;
end;
$$;

-- Recreate the grant RPC so new lots start with their full remaining balance.
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
  perform public.refresh_credit_expirations(p_user_id);

  select * into v_lot from public.credit_purchase_lots
  where stripe_checkout_session_id = btrim(p_checkout_session_id) limit 1;
  if v_lot.id is not null then
    select id into v_ledger_id from public.credit_ledger
    where user_id = p_user_id and idempotency_key = btrim(p_idempotency_key) limit 1;
    select coalesce(sum(amount), 0)::bigint into v_balance from public.credit_ledger where user_id = p_user_id;
    return query select false, v_lot.id, v_ledger_id, v_balance;
    return;
  end if;

  insert into public.credit_purchase_lots (
    user_id, pack_id, stripe_checkout_session_id, stripe_payment_intent_id,
    credits_granted, remaining_credits, expires_at, metadata
  ) values (
    p_user_id, btrim(p_pack_id), btrim(p_checkout_session_id),
    nullif(btrim(coalesce(p_payment_intent_id, '')), ''), p_credits, p_credits,
    p_expires_at, coalesce(p_metadata, '{}'::jsonb)
  ) returning * into v_lot;

  insert into public.credit_ledger (
    user_id, amount, entry_type, idempotency_key, metadata
  ) values (
    p_user_id, p_credits, 'purchase', btrim(p_idempotency_key),
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

-- Reversal subtracts only grant credits that were not already removed by expiry.
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
  perform public.refresh_credit_expirations(v_lot.user_id);
  select * into v_lot from public.credit_purchase_lots where id = v_lot.id for update;

  if exists (select 1 from public.credit_purchase_reversals where stripe_event_key = btrim(p_stripe_event_key)) then
    select coalesce(sum(amount), 0)::bigint into v_balance from public.credit_ledger where credit_ledger.user_id = v_lot.user_id;
    return query select false, v_lot.user_id, 0, v_balance;
    return;
  end if;

  select coalesce(sum(credits_reversed), 0)::integer into v_already
  from public.credit_purchase_reversals where purchase_lot_id = v_lot.id;
  v_reverse := greatest(0, v_lot.credits_granted - v_lot.expired_credits - v_already);

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
    v_lot.user_id, -v_reverse, p_reversal_type,
    'stripe_reversal:' || btrim(p_stripe_event_key),
    jsonb_build_object(
      'purchase_lot_id', v_lot.id,
      'stripe_payment_intent_id', v_lot.stripe_payment_intent_id,
      'reversal_type', p_reversal_type
    )
  );

  update public.credit_purchase_lots
  set remaining_credits = 0
  where id = v_lot.id;

  select coalesce(sum(amount), 0)::bigint into v_balance from public.credit_ledger where credit_ledger.user_id = v_lot.user_id;
  return query select true, v_lot.user_id, v_reverse, v_balance;
end;
$$;

revoke all on function public.refresh_credit_expirations(uuid) from public, anon, authenticated;
grant execute on function public.refresh_credit_expirations(uuid) to service_role;
revoke all on function public.unlock_public_episode_translation(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.unlock_public_episode_translation(uuid, uuid, text, text, text) to service_role;
revoke all on function public.grant_credit_purchase(uuid, text, text, text, integer, timestamptz, text, jsonb) from public, anon, authenticated;
grant execute on function public.grant_credit_purchase(uuid, text, text, text, integer, timestamptz, text, jsonb) to service_role;
revoke all on function public.reverse_credit_purchase_full(text, text, text) from public, anon, authenticated;
grant execute on function public.reverse_credit_purchase_full(text, text, text) to service_role;
