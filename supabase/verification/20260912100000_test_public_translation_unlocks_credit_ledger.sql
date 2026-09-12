-- Transactional integration checks for the shared translation unlock/credit foundation.
--
-- Prerequisites:
-- 1. Apply 20260912100000_add_public_translation_unlocks_credit_ledger.sql first.
-- 2. Use a dedicated test user and a real public episode ID.
-- 3. Choose an episode/language pair the test user has never unlocked before.
-- 4. Replace the two REPLACE_* values below.
--
-- Everything created by this script is rolled back at the end.

begin;

select set_config(
  'libread.test_user_id',
  'REPLACE_TEST_USER_UUID',
  true
);
select set_config(
  'libread.test_episode_id',
  'REPLACE_PUBLIC_EPISODE_UUID',
  true
);

-- Abort early when placeholders were not replaced or IDs are not real.
do $$
declare
  v_user_id uuid;
  v_episode_id uuid;
begin
  begin
    v_user_id := current_setting('libread.test_user_id')::uuid;
    v_episode_id := current_setting('libread.test_episode_id')::uuid;
  exception when invalid_text_representation then
    raise exception 'Replace REPLACE_TEST_USER_UUID and REPLACE_PUBLIC_EPISODE_UUID first';
  end;

  if not exists (select 1 from auth.users where id = v_user_id) then
    raise exception 'Test user does not exist: %', v_user_id;
  end if;
  if not exists (select 1 from public.episodes where id = v_episode_id) then
    raise exception 'Test episode does not exist: %', v_episode_id;
  end if;
  if exists (
    select 1
    from public.public_episode_translation_unlocks
    where user_id = v_user_id
      and episode_id = v_episode_id
      and lower(target_language) in ('en', 'ko')
  ) then
    raise exception 'Test user already has en/ko unlock for this episode; choose another episode';
  end if;
end;
$$;

-- Capture baseline and grant exactly two temporary credits inside this transaction.
select set_config(
  'libread.test_balance_before',
  coalesce((
    select sum(amount)::text
    from public.credit_ledger
    where user_id = current_setting('libread.test_user_id')::uuid
  ), '0'),
  true
);

insert into public.credit_ledger (
  user_id,
  amount,
  entry_type,
  idempotency_key,
  metadata
) values (
  current_setting('libread.test_user_id')::uuid,
  2,
  'grant',
  'test-grant-' || gen_random_uuid()::text,
  jsonb_build_object('test', true, 'rollback', true)
);

-- First English unlock: one row + one debit.
do $$
declare
  v_result record;
  v_before bigint := current_setting('libread.test_balance_before')::bigint;
begin
  select * into v_result
  from public.unlock_public_episode_translation(
    current_setting('libread.test_user_id')::uuid,
    current_setting('libread.test_episode_id')::uuid,
    'ja',
    'en',
    'test-unlock-en-first'
  );

  if not v_result.allowed
    or v_result.result_type <> 'unlocked'
    or v_result.charged is not true
    or v_result.credit_cost <> 1
    or v_result.balance_after <> v_before + 1 then
    raise exception 'First unlock result unexpected: %', row_to_json(v_result);
  end if;
end;
$$;

-- Exact network retry: must not debit again.
do $$
declare
  v_result record;
  v_expected bigint := current_setting('libread.test_balance_before')::bigint + 1;
begin
  select * into v_result
  from public.unlock_public_episode_translation(
    current_setting('libread.test_user_id')::uuid,
    current_setting('libread.test_episode_id')::uuid,
    'ja',
    'en',
    'test-unlock-en-first'
  );

  if not v_result.allowed
    or v_result.result_type <> 'already_unlocked'
    or v_result.charged is not false
    or v_result.balance_after <> v_expected then
    raise exception 'Idempotent retry result unexpected: %', row_to_json(v_result);
  end if;
end;
$$;

-- Different retry key, same entitlement: uniqueness must still prevent a debit.
do $$
declare
  v_result record;
  v_expected bigint := current_setting('libread.test_balance_before')::bigint + 1;
begin
  select * into v_result
  from public.unlock_public_episode_translation(
    current_setting('libread.test_user_id')::uuid,
    current_setting('libread.test_episode_id')::uuid,
    'ja',
    'en',
    'test-unlock-en-second-key'
  );

  if not v_result.allowed
    or v_result.result_type <> 'already_unlocked'
    or v_result.charged is not false
    or v_result.balance_after <> v_expected then
    raise exception 'Duplicate entitlement result unexpected: %', row_to_json(v_result);
  end if;
end;
$$;

-- Korean is a separate entitlement and consumes the second temporary credit.
do $$
declare
  v_result record;
  v_before bigint := current_setting('libread.test_balance_before')::bigint;
begin
  select * into v_result
  from public.unlock_public_episode_translation(
    current_setting('libread.test_user_id')::uuid,
    current_setting('libread.test_episode_id')::uuid,
    'ja',
    'ko',
    'test-unlock-ko-first'
  );

  if not v_result.allowed
    or v_result.result_type <> 'unlocked'
    or v_result.charged is not true
    or v_result.balance_after <> v_before then
    raise exception 'Korean unlock result unexpected: %', row_to_json(v_result);
  end if;
end;
$$;

-- There must be exactly one English and one Korean entitlement for this test pair.
do $$
declare
  v_unlock_count integer;
  v_unlock_debit_count integer;
begin
  select count(*) into v_unlock_count
  from public.public_episode_translation_unlocks
  where user_id = current_setting('libread.test_user_id')::uuid
    and episode_id = current_setting('libread.test_episode_id')::uuid
    and lower(target_language) in ('en', 'ko');

  select count(*) into v_unlock_debit_count
  from public.credit_ledger
  where user_id = current_setting('libread.test_user_id')::uuid
    and entry_type = 'unlock'
    and idempotency_key in ('test-unlock-en-first', 'test-unlock-ko-first');

  if v_unlock_count <> 2 then
    raise exception 'Expected 2 unlock rows, found %', v_unlock_count;
  end if;
  if v_unlock_debit_count <> 2 then
    raise exception 'Expected 2 unlock debit rows, found %', v_unlock_debit_count;
  end if;
end;
$$;

-- Source language == target language must never create an unlock.
do $$
begin
  begin
    perform *
    from public.unlock_public_episode_translation(
      current_setting('libread.test_user_id')::uuid,
      current_setting('libread.test_episode_id')::uuid,
      'en',
      'en',
      'test-invalid-source-target'
    );
    raise exception 'Expected source==target rejection';
  exception
    when sqlstate '22023' then null;
  end;
end;
$$;

-- Ledger UPDATE must be blocked; corrections are append-only compensating rows.
do $$
begin
  begin
    update public.credit_ledger
    set amount = amount + 1000
    where user_id = current_setting('libread.test_user_id')::uuid
      and idempotency_key like 'test-grant-%';
    raise exception 'Expected append-only UPDATE rejection';
  exception
    when sqlstate '55000' then null;
  end;
end;
$$;

-- The test grant (+2) and two unlocks (-1, -1) must return to the baseline.
do $$
declare
  v_after bigint;
  v_before bigint := current_setting('libread.test_balance_before')::bigint;
begin
  select coalesce(sum(amount), 0)::bigint into v_after
  from public.credit_ledger
  where user_id = current_setting('libread.test_user_id')::uuid;

  if v_after <> v_before then
    raise exception 'Balance mismatch: before %, after %', v_before, v_after;
  end if;
end;
$$;

-- Concurrent-balance safety is implemented by a user-level transaction advisory
-- lock (`credit-balance:<user_id>`). To exercise it under real concurrency, run
-- two service/server requests for the same one-credit user against two different
-- episodes at the same time: exactly one may return `unlocked`; the other must
-- observe the post-debit balance and return `insufficient_balance`.

rollback;
