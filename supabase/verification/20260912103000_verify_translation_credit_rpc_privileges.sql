-- Run after 20260912103000_harden_translation_credit_rpc_privileges.sql.
-- Expected: every *_cannot_* column = true, authenticated read helpers = true,
-- service_role_can_atomic_unlock = true.

select
  not has_function_privilege(
    'anon',
    'public.get_credit_balance()',
    'EXECUTE'
  ) as anon_cannot_read_balance,

  has_function_privilege(
    'authenticated',
    'public.get_credit_balance()',
    'EXECUTE'
  ) as authenticated_can_read_balance,

  not has_function_privilege(
    'anon',
    'public.has_public_episode_translation_unlock(uuid,text)',
    'EXECUTE'
  ) as anon_cannot_check_unlock,

  has_function_privilege(
    'authenticated',
    'public.has_public_episode_translation_unlock(uuid,text)',
    'EXECUTE'
  ) as authenticated_can_check_unlock,

  not has_function_privilege(
    'anon',
    'public.unlock_public_episode_translation(uuid,uuid,text,text,text)',
    'EXECUTE'
  ) as anon_cannot_atomic_unlock,

  not has_function_privilege(
    'authenticated',
    'public.unlock_public_episode_translation(uuid,uuid,text,text,text)',
    'EXECUTE'
  ) as authenticated_cannot_atomic_unlock,

  has_function_privilege(
    'service_role',
    'public.unlock_public_episode_translation(uuid,uuid,text,text,text)',
    'EXECUTE'
  ) as service_role_can_atomic_unlock;
