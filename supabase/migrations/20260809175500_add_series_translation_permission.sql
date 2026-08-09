-- Explicit author opt-in for English bilingual translation on normal works.
-- Existing rows default to closed so no work becomes translatable without consent.

alter table public.series
  add column if not exists translation_permission_mode text not null default 'closed';

update public.series
set translation_permission_mode = 'closed'
where translation_permission_mode is null
   or translation_permission_mode not in ('open', 'closed');

alter table public.series
  drop constraint if exists series_translation_permission_mode_check;

alter table public.series
  add constraint series_translation_permission_mode_check
  check (translation_permission_mode in ('open', 'closed'));
