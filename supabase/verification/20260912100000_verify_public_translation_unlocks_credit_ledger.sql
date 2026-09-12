-- Run in Supabase SQL Editor after applying
-- 20260912100000_add_public_translation_unlocks_credit_ledger.sql.
-- Read-only verification: this file does not grant credits or create unlocks.

-- 1) Tables, RLS, and append-only trigger.
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'episode_translations',
    'public_episode_translation_unlocks',
    'credit_ledger'
  )
order by c.relname;

select
  event_object_table as table_name,
  trigger_name,
  event_manipulation
from information_schema.triggers
where trigger_schema = 'public'
  and event_object_table = 'credit_ledger'
order by trigger_name, event_manipulation;

-- 2) Unlock identity must be user + episode + target language only.
-- source_hash must not exist on the unlock table.
select
  column_name,
  data_type,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'public_episode_translation_unlocks'
order by ordinal_position;

select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'public_episode_translation_unlocks'
order by indexname;

-- 3) Existing shared translation asset identity remains untouched.
-- Expected unique identity after the multilingual migration:
-- episode_id + source_language + target_language + source_hash.
select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'episode_translations'
  and indexdef ilike '%unique%'
order by indexname;

-- 4) RLS policies: authenticated users should only have own-row SELECT policies.
select
  tablename,
  policyname,
  cmd,
  roles,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('public_episode_translation_unlocks', 'credit_ledger')
order by tablename, policyname;

-- 5) Client mutation privileges must be absent.
select
  has_table_privilege('authenticated', 'public.public_episode_translation_unlocks', 'SELECT') as unlock_select,
  has_table_privilege('authenticated', 'public.public_episode_translation_unlocks', 'INSERT') as unlock_insert,
  has_table_privilege('authenticated', 'public.public_episode_translation_unlocks', 'UPDATE') as unlock_update,
  has_table_privilege('authenticated', 'public.public_episode_translation_unlocks', 'DELETE') as unlock_delete,
  has_table_privilege('authenticated', 'public.credit_ledger', 'SELECT') as ledger_select,
  has_table_privilege('authenticated', 'public.credit_ledger', 'INSERT') as ledger_insert,
  has_table_privilege('authenticated', 'public.credit_ledger', 'UPDATE') as ledger_update,
  has_table_privilege('authenticated', 'public.credit_ledger', 'DELETE') as ledger_delete;

-- Expected: SELECT=true for both tables, every mutation privilege=false.

-- 6) RPC execution surface.
select
  has_function_privilege('authenticated', 'public.get_credit_balance()', 'EXECUTE') as authenticated_balance,
  has_function_privilege('authenticated', 'public.has_public_episode_translation_unlock(uuid,text)', 'EXECUTE') as authenticated_unlock_check,
  has_function_privilege('authenticated', 'public.unlock_public_episode_translation(uuid,uuid,text,text,text)', 'EXECUTE') as authenticated_atomic_unlock,
  has_function_privilege('service_role', 'public.unlock_public_episode_translation(uuid,uuid,text,text,text)', 'EXECUTE') as service_role_atomic_unlock;

-- Expected:
-- authenticated_balance=true
-- authenticated_unlock_check=true
-- authenticated_atomic_unlock=false
-- service_role_atomic_unlock=true

-- 7) No production credits are seeded by the migration.
select count(*) as credit_ledger_rows
from public.credit_ledger;

select count(*) as unlock_rows
from public.public_episode_translation_unlocks;

-- On a database with no later test/admin entries, both counts should be 0.
