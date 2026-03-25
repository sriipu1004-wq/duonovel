-- =========================================
-- manage RLS for series / episodes
-- ownership source: public.series.author_id
-- =========================================

alter table public.series enable row level security;
alter table public.episodes enable row level security;

-- --------------------------------------------------
-- series: SELECT
-- 公開作品は誰でも読める
-- owner は自分の作品を読める
-- --------------------------------------------------
drop policy if exists series_public_or_owner_select on public.series;

create policy series_public_or_owner_select
on public.series
for select
to public
using (
  coalesce(is_public, true) = true
  or auth.uid() = author_id
);

-- --------------------------------------------------
-- series: UPDATE
-- owner のみ更新可能
-- --------------------------------------------------
drop policy if exists series_owner_update on public.series;

create policy series_owner_update
on public.series
for update
to authenticated
using (
  auth.uid() = author_id
)
with check (
  auth.uid() = author_id
);

-- --------------------------------------------------
-- episodes: SELECT
-- 公開シリーズの話は誰でも読める
-- owner は自分の話を読める
-- --------------------------------------------------
drop policy if exists episodes_public_or_owner_select on public.episodes;

create policy episodes_public_or_owner_select
on public.episodes
for select
to public
using (
  exists (
    select 1
    from public.series s
    where s.id = episodes.series_id
      and (
        s.author_id = auth.uid()
        or coalesce(s.is_public, true) = true
      )
  )
);

-- --------------------------------------------------
-- episodes: UPDATE
-- 親 series の owner のみ更新可能
-- --------------------------------------------------
drop policy if exists episodes_owner_update on public.episodes;

create policy episodes_owner_update
on public.episodes
for update
to authenticated
using (
  exists (
    select 1
    from public.series s
    where s.id = episodes.series_id
      and s.author_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.series s
    where s.id = episodes.series_id
      and s.author_id = auth.uid()
  )
);