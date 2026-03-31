alter table public.series
  add column if not exists reviews_enabled boolean;

alter table public.series
  add column if not exists episode_comments_enabled boolean;

update public.series
set
  reviews_enabled = coalesce(reviews_enabled, true),
  episode_comments_enabled = coalesce(episode_comments_enabled, true)
where reviews_enabled is null
   or episode_comments_enabled is null;

alter table public.series
  alter column reviews_enabled set default true;

alter table public.series
  alter column episode_comments_enabled set default true;

alter table public.series
  alter column reviews_enabled set not null;

alter table public.series
  alter column episode_comments_enabled set not null;