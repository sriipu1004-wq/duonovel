alter table if exists public.series
add column if not exists bgm_settings jsonb;

alter table if exists public.episodes
add column if not exists bgm_settings jsonb;

comment on column public.series.bgm_settings is
'BGM演出設定JSON。fadeInSeconds / fadeOutSeconds / sceneCues を保持する最小土台。';

comment on column public.episodes.bgm_settings is
'話単位のBGM演出設定JSON。未指定値は series 側設定へフォールバックする。';