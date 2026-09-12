-- Shared public translation entitlement and credit-ledger foundation.
--
-- Important rollout properties:
-- - Existing public episode translation assets remain in episode_translations.
-- - Existing Free/Premium quota behavior is untouched.
-- - No credits are seeded and no application path enforces credits yet.
-- - Private-library translations remain completely separate.
-- - Unlock identity intentionally excludes source_hash so an episode edit never
--   charges the same user again for the same target language.

comment on table public.episode_translations is
  'Shared public episode translation asset cache. Rows are not user-owned; requested_by_user_id is audit metadata only. Access must continue through the existing publication, R18, and translation-permission checks.';

comment on column public.episode_translations.requested_by_user_id is
  'Audit metadata for the request that created/refreshed the shared asset; not an ownership or access-control field.';

comment on column public.episode_translations.source_hash is
  'Current translation cache identity hash. Legacy/current application code may include a work-level learning-preference variant in this hash; do not treat it as a user entitlement key.';

create table if not exists public.public_episode_translation_unlocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  episode_id uuid not null references public.episodes(id) on delete cascade,
  target_language text not null,
  unlocked_at timestamptz not null default now(),
  unlock_source text not null default 'credit',
  credit_cost integer not null default 0 check (credit_cost >= 0),
  created_at timestamptz not null default now(),
  check (
    target_language = btrim(target_language)
    and length(target_language) between 2 and 35
    and target_language ~* '^[a-z]{2,3}(-[a-z0-9]{2,8})*$'
  )
);

-- BCP-47 tags are case-insensitive for entitlement identity. Keep the original
-- canonical tag for display/audit, while preventing duplicate EN/en unlocks.
create unique index if not exists public_episode_translation_unlocks_identity_key
  on public.public_episode_translation_unlocks (
    user_id,
    episode_id,
    lower(target_language)
  );

create index if not exists idx_public_episode_translation_unlocks_user_created
  on public.public_episode_translation_unlocks (user_id, created_at desc);

comment on table public.public_episode_translation_unlocks is
  'Per-user entitlement to use a target-language translation for an otherwise accessible public episode. This is not content-access permission and does not bypass publication, R18, or translation-permission checks.';

comment on column public.public_episode_translation_unlocks.target_language is
  'Entitlement language. source_hash is deliberately absent from unlock identity so source edits do not charge again.';

-- Ledger user/related IDs are immutable audit references rather than cascading
-- foreign keys. This avoids an account/content deletion silently rewriting or
-- deleting financial history. Any future privacy-retention policy must use an
-- explicit compensating/anonymization procedure rather than ordinary row edits.
create table if not exists public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  amount integer not null check (amount <> 0),
  entry_type text not null,
  idempotency_key text not null,
  related_unlock_id uuid,
  related_episode_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key),
  check (length(btrim(entry_type)) between 1 and 64),
  check (length(btrim(idempotency_key)) between 1 and 200),
  check (jsonb_typeof(metadata) = 'object')
);

create index if not exists idx_credit_ledger_user_created
  on public.credit_ledger (user_id, created_at desc);

create index if not exists idx_credit_ledger_related_unlock
  on public.credit_ledger (related_unlock_id)
  where related_unlock_id is not null;

comment on table public.credit_ledger is
  'Append-only source of truth for translation credits. Corrections/refunds are new compensating rows; balance is SUM(amount).';

comment on column public.credit_ledger.amount is
  'Signed credit delta: grants/purchases are positive, unlocks are negative, refunds/adjustments are compensating entries.';

-- Enforce append-only semantics at the database layer, including service-role
-- callers. Test cleanup and corrections must use compensating ledger entries.
create or replace function public.block_credit_ledger_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'credit_ledger is append-only; use a compensating entry'
    using errcode = '55000';
end;
$$;

revoke all on function public.block_credit_ledger_mutation() from public;

create trigger credit_ledger_append_only
before update or delete on public.credit_ledger
for each row execute function public.block_credit_ledger_mutation();

alter table public.public_episode_translation_unlocks enable row level security;
alter table public.credit_ledger enable row level security;

revoke all on table public.public_episode_translation_unlocks from anon, authenticated;
revoke all on table public.credit_ledger from anon, authenticated;

grant select on table public.public_episode_translation_unlocks to authenticated;
grant select on table public.credit_ledger to authenticated;
grant all on table public.public_episode_translation_unlocks to service_role;
grant all on table public.credit_ledger to service_role;

create policy public_episode_translation_unlocks_select_own
on public.public_episode_translation_unlocks
for select
to authenticated
using (auth.uid() = user_id);

create policy credit_ledger_select_own
on public.credit_ledger
for select
to authenticated
using (auth.uid() = user_id);

-- Self-service read helper. No user_id parameter means callers cannot inspect a
-- different user's balance through this RPC.
create or replace function public.get_credit_balance()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(ledger.amount), 0)::bigint
  from public.credit_ledger as ledger
  where ledger.user_id = auth.uid();
$$;

revoke all on function public.get_credit_balance() from public;
grant execute on function public.get_credit_balance() to authenticated;

-- Self-service entitlement check. This only answers whether the entitlement row
-- exists; callers must still pass normal content-access/R18/translation checks.
create or replace function public.has_public_episode_translation_unlock(
  p_episode_id uuid,
  p_target_language text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.public_episode_translation_unlocks as unlock_row
    where unlock_row.user_id = auth.uid()
      and unlock_row.episode_id = p_episode_id
      and lower(unlock_row.target_language) = lower(btrim(p_target_language))
  );
$$;

revoke all on function public.has_public_episode_translation_unlock(uuid, text) from public;
grant execute on function public.has_public_episode_translation_unlock(uuid, text) to authenticated;

-- Atomic credit-backed entitlement mutation for future server integration.
-- This function is service-role only. The application server must resolve the
-- authenticated session and normal episode access first, then pass that user ID.
-- Production does not call this function in the current rollout.
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
begin
  if p_user_id is null then
    raise exception 'User ID is required' using errcode = '22023';
  end if;

  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'Unknown user' using errcode = '22023';
  end if;

  if p_episode_id is null
    or not exists (select 1 from public.episodes where id = p_episode_id) then
    raise exception 'Unknown episode' using errcode = '22023';
  end if;

  if v_source_language = ''
    or length(v_source_language) > 35
    or v_source_language !~* '^[a-z]{2,3}(-[a-z0-9]{2,8})*$' then
    raise exception 'Invalid source language: %', p_source_language using errcode = '22023';
  end if;

  if v_target_language = ''
    or length(v_target_language) > 35
    or v_target_language !~* '^[a-z]{2,3}(-[a-z0-9]{2,8})*$' then
    raise exception 'Invalid target language: %', p_target_language using errcode = '22023';
  end if;

  if lower(v_source_language) = lower(v_target_language) then
    raise exception 'Source and target languages must differ' using errcode = '22023';
  end if;

  if v_idempotency_key = '' or length(v_idempotency_key) > 200 then
    raise exception 'Invalid idempotency key' using errcode = '22023';
  end if;

  -- Every balance-consuming operation must serialize on the user-level credit
  -- namespace before reading SUM(amount). This prevents two simultaneous unlocks
  -- for different episodes from both spending the same last credit.
  perform pg_advisory_xact_lock(
    hashtextextended('credit-balance:' || p_user_id::text, 0)
  );

  -- Keep an entitlement-specific lock as a second line of defense for duplicate
  -- taps/retries. The lock order is always user balance first, entitlement second.
  perform pg_advisory_xact_lock(
    hashtextextended(
      'translation-unlock:' || p_user_id::text || ':' || p_episode_id::text || ':' ||
        lower(v_target_language),
      0
    )
  );

  select *
  into v_unlock
  from public.public_episode_translation_unlocks as unlock_row
  where unlock_row.user_id = p_user_id
    and unlock_row.episode_id = p_episode_id
    and lower(unlock_row.target_language) = lower(v_target_language)
  limit 1;

  select coalesce(sum(ledger.amount), 0)::bigint
  into v_balance
  from public.credit_ledger as ledger
  where ledger.user_id = p_user_id;

  if v_unlock.id is not null then
    select ledger.id
    into v_ledger_id
    from public.credit_ledger as ledger
    where ledger.user_id = p_user_id
      and ledger.entry_type = 'unlock'
      and ledger.related_unlock_id = v_unlock.id
    order by ledger.created_at asc
    limit 1;

    return query select
      true,
      'already_unlocked'::text,
      v_unlock.id,
      v_ledger_id,
      v_unlock.credit_cost,
      v_balance,
      false;
    return;
  end if;

  if exists (
    select 1
    from public.credit_ledger as ledger
    where ledger.user_id = p_user_id
      and ledger.idempotency_key = v_idempotency_key
  ) then
    raise exception 'Idempotency key already used for another ledger operation'
      using errcode = '23505';
  end if;

  if v_balance < v_credit_cost then
    return query select
      false,
      'insufficient_balance'::text,
      null::uuid,
      null::uuid,
      v_credit_cost,
      v_balance,
      false;
    return;
  end if;

  insert into public.public_episode_translation_unlocks (
    user_id,
    episode_id,
    target_language,
    unlock_source,
    credit_cost
  ) values (
    p_user_id,
    p_episode_id,
    v_target_language,
    'credit',
    v_credit_cost
  )
  returning * into v_unlock;

  insert into public.credit_ledger (
    user_id,
    amount,
    entry_type,
    idempotency_key,
    related_unlock_id,
    related_episode_id,
    metadata
  ) values (
    p_user_id,
    -v_credit_cost,
    'unlock',
    v_idempotency_key,
    v_unlock.id,
    p_episode_id,
    jsonb_build_object(
      'target_language', v_target_language,
      'source_language_at_unlock', v_source_language
    )
  )
  returning id into v_ledger_id;

  return query select
    true,
    'unlocked'::text,
    v_unlock.id,
    v_ledger_id,
    v_credit_cost,
    v_balance - v_credit_cost,
    true;
end;
$$;

revoke all on function public.unlock_public_episode_translation(
  uuid, uuid, text, text, text
) from public;
grant execute on function public.unlock_public_episode_translation(
  uuid, uuid, text, text, text
) to service_role;
