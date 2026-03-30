alter table public.series
  add column if not exists effect_settings jsonb;

alter table public.episodes
  add column if not exists effect_settings jsonb;

comment on column public.series.effect_settings is
  'LIB read series-level effect foundation settings';

comment on column public.episodes.effect_settings is
  'LIB read episode-level effect foundation settings';