-- Read-only verification for 20260912153000_add_series_source_language.sql.
-- Run after applying the migration to the shared Supabase project.

select
  table_schema,
  table_name,
  column_name,
  data_type,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'series'
  and column_name = 'source_language';

select
  conname,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.series'::regclass
  and conname = 'series_source_language_supported_check';

select
  count(*) as total_series,
  count(*) filter (where source_language is null) as unconfirmed_series,
  count(*) filter (where source_language is not null) as confirmed_series,
  count(*) filter (
    where source_language is not null
      and source_language not in (
        'ja', 'en', 'ko', 'fr', 'de', 'es', 'zh-Hans', 'zh-Hant'
      )
  ) as unsupported_series
from public.series;
