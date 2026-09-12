-- Canonical original/source language for public works.
--
-- Rollout properties:
-- - additive only; no existing series/episode rows are duplicated or rewritten,
-- - existing rows intentionally remain NULL and continue through application fallback detection,
-- - no blanket Japanese backfill is performed,
-- - values match the application's SupportedLanguageTag registry.

alter table public.series
  add column if not exists source_language text;

alter table public.series
  drop constraint if exists series_source_language_supported_check;

alter table public.series
  add constraint series_source_language_supported_check
  check (
    source_language is null
    or source_language in (
      'ja',
      'en',
      'ko',
      'fr',
      'de',
      'es',
      'zh-Hans',
      'zh-Hant'
    )
  );

comment on column public.series.source_language is
  'Canonical original/source language for the work. NULL means legacy/unconfirmed and must use the application fallback resolver; NULL must never be interpreted as Japanese by default.';
