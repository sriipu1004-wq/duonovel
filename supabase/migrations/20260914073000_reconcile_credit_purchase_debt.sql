-- Keep expiring purchase-lot balances consistent when a prior refund/dispute has
-- made the user's aggregate credit balance negative. A new purchase first offsets
-- that negative balance; only the remainder is a future-spendable/expirable lot.

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
  v_balance_before bigint;
  v_balance_after bigint;
  v_remaining integer;
  v_debt_offset integer;
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
  v_balance_before := public.refresh_credit_expirations(p_user_id);

  select * into v_lot from public.credit_purchase_lots
  where stripe_checkout_session_id = btrim(p_checkout_session_id) limit 1;
  if v_lot.id is not null then
    select id into v_ledger_id from public.credit_ledger
    where user_id = p_user_id and idempotency_key = btrim(p_idempotency_key) limit 1;
    select coalesce(sum(amount), 0)::bigint into v_balance_after
    from public.credit_ledger where user_id = p_user_id;
    return query select false, v_lot.id, v_ledger_id, v_balance_after;
    return;
  end if;

  v_debt_offset := least(
    p_credits,
    greatest(0::bigint, -least(v_balance_before, 0::bigint))::integer
  );
  v_remaining := p_credits - v_debt_offset;

  insert into public.credit_purchase_lots (
    user_id, pack_id, stripe_checkout_session_id, stripe_payment_intent_id,
    credits_granted, remaining_credits, expires_at, metadata
  ) values (
    p_user_id, btrim(p_pack_id), btrim(p_checkout_session_id),
    nullif(btrim(coalesce(p_payment_intent_id, '')), ''),
    p_credits, v_remaining, p_expires_at,
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'credits_applied_to_negative_balance', v_debt_offset
    )
  ) returning * into v_lot;

  insert into public.credit_ledger (
    user_id, amount, entry_type, idempotency_key, metadata
  ) values (
    p_user_id, p_credits, 'purchase', btrim(p_idempotency_key),
    jsonb_build_object(
      'purchase_lot_id', v_lot.id,
      'pack_id', v_lot.pack_id,
      'stripe_checkout_session_id', v_lot.stripe_checkout_session_id,
      'expires_at', v_lot.expires_at,
      'credits_applied_to_negative_balance', v_debt_offset
    ) || coalesce(p_metadata, '{}'::jsonb)
  ) returning id into v_ledger_id;

  v_balance_after := v_balance_before + p_credits;
  return query select true, v_lot.id, v_ledger_id, v_balance_after;
end;
$$;

revoke all on function public.grant_credit_purchase(uuid, text, text, text, integer, timestamptz, text, jsonb)
from public, anon, authenticated;
grant execute on function public.grant_credit_purchase(uuid, text, text, text, integer, timestamptz, text, jsonb)
to service_role;
