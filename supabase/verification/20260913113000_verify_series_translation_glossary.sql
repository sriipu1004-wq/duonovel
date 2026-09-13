-- Verification only. No test rows are inserted.

select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'series_translation_glossary_entries',
    'series_translation_glossary_targets',
    'series_translation_profiles'
  )
order by table_name;

select
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'series_translation_glossary_entries',
    'series_translation_glossary_targets',
    'series_translation_profiles'
  )
order by table_name, ordinal_position;

select
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type
from information_schema.table_constraints as tc
where tc.table_schema = 'public'
  and tc.table_name in (
    'series_translation_glossary_entries',
    'series_translation_glossary_targets',
    'series_translation_profiles'
  )
order by tc.table_name, tc.constraint_type, tc.constraint_name;

select
  schemaname,
  tablename,
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in (
    'series_translation_glossary_entries',
    'series_translation_glossary_targets',
    'series_translation_profiles'
  )
order by tablename, indexname;

select
  schemaname,
  tablename,
  policyname,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'series_translation_glossary_entries',
    'series_translation_glossary_targets',
    'series_translation_profiles'
  )
order by tablename, policyname;

select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class as c
join pg_namespace as n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'series_translation_glossary_entries',
    'series_translation_glossary_targets',
    'series_translation_profiles'
  )
order by c.relname;

-- Existing public translation cache identity must remain unchanged.
select
  conname,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.episode_translations'::regclass
  and contype = 'u'
order by conname;
