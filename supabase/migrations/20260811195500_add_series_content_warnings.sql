-- Extensible system-managed content warnings for series.
-- Depends on 20260811193000_add_r18_content_controls.sql.

alter table public.series
  add column if not exists content_warnings text[] not null default '{}'::text[];

alter table public.series
  add column if not exists content_warning_locks text[] not null default '{}'::text[];

update public.series
set content_warnings = array_append(content_warnings, 'sexual_r18')
where content_rating = 'r18'
  and not ('sexual_r18' = any(content_warnings));

alter table public.series
  drop constraint if exists series_content_warnings_check;

alter table public.series
  add constraint series_content_warnings_check
  check (content_warnings <@ array['sexual_r18', 'violence']::text[]);

alter table public.series
  drop constraint if exists series_content_warning_locks_check;

alter table public.series
  add constraint series_content_warning_locks_check
  check (
    content_warning_locks <@ array['sexual_r18', 'violence']::text[]
    and content_warning_locks <@ content_warnings
  );

create index if not exists idx_series_content_warnings
  on public.series using gin (content_warnings);
