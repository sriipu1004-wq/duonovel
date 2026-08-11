-- Explicit content-rating support for user-submitted works.
-- Existing works remain general by default. AI generation continues to use the general-audience path.

alter table public.series
  add column if not exists content_rating text not null default 'general';

alter table public.series
  drop constraint if exists series_content_rating_check;

alter table public.series
  add constraint series_content_rating_check
  check (content_rating in ('general', 'r18'));

create index if not exists idx_series_publication_content_rating
  on public.series (publication_status, content_rating, created_at desc);

alter table public.users
  add column if not exists show_r18_content boolean not null default false;

alter table public.users
  add column if not exists r18_confirmed_at timestamptz;
