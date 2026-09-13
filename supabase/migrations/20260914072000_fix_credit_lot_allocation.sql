-- Fix purchased-credit lot allocation without mutating the append-only credit_ledger.
-- The purchase lot is selected before the unlock ledger INSERT so metadata is immutable.

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

  -- Allocate an expiring purchased credit first. If none is available, the debit
  -- is backed by a non-expiring grant/adjustment already represented in the ledger.
  select lot.id into v_lot_id
  from public.credit_purchase_lots lot
  where lot.user_id = p_user_id
    and lot.remaining_credits > 0
    and lot.expires_at > now()
  order by lot.expires_at asc, lot.created_at asc
  limit 1
  for update;

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
    ) || case
      when v_lot_id is not null then jsonb_build_object('purchase_lot_id', v_lot_id)
      else '{}'::jsonb
    end
  ) returning id into v_ledger_id;

  if v_lot_id is not null then
    update public.credit_purchase_lots
    set remaining_credits = remaining_credits - 1
    where id = v_lot_id;
  end if;

  return query select true, 'unlocked'::text, v_unlock.id, v_ledger_id,
    v_credit_cost, v_balance - v_credit_cost, true;
end;
$$;

revoke all on function public.unlock_public_episode_translation(uuid, uuid, text, text, text)
from public, anon, authenticated;
grant execute on function public.unlock_public_episode_translation(uuid, uuid, text, text, text)
to service_role;
