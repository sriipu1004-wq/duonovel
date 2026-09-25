-- Child80: Human translation foundation. AI translation remains separate.
begin;

alter table public.series
  add column if not exists human_translation_permission_mode text not null default 'closed';

update public.series
set human_translation_permission_mode = 'closed'
where human_translation_permission_mode is null
   or human_translation_permission_mode not in ('open', 'closed');

alter table public.series
  alter column human_translation_permission_mode set default 'closed',
  alter column human_translation_permission_mode set not null;

alter table public.series
  drop constraint if exists series_human_translation_permission_mode_check;

alter table public.series
  add constraint series_human_translation_permission_mode_check
  check (human_translation_permission_mode in ('open', 'closed'));

-- Safe backfill: existing works remain closed except provenance-checked PD.
-- Official ownership alone is intentionally NOT a condition.
update public.series
set human_translation_permission_mode = 'open'
where jsonb_typeof(effect_settings -> 'publicDomain') = 'object'
  and lower(coalesce(effect_settings #>> '{publicDomain,rightsChecked}', '')) = 'true';

comment on column public.series.human_translation_permission_mode is
  'Author permission for user-created Human translations; separate from AI translation_permission_mode.';

create table if not exists public.episode_human_translations (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references public.series(id) on delete cascade,
  episode_id uuid not null references public.episodes(id) on delete cascade,
  translator_user_id uuid not null references auth.users(id) on delete cascade,
  source_language text not null,
  target_language text not null,
  source_hash text not null,
  published_source_hash text,
  segment_version integer not null default 3 check (segment_version > 0),
  status text not null default 'draft' check (status in ('draft', 'published', 'withdrawn')),
  draft_payload jsonb not null default '{"version":3,"segments":[]}'::jsonb,
  published_payload jsonb,
  rights_confirmed_at timestamptz,
  published_at timestamptz,
  withdrawn_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint episode_human_translations_language_pair_check check (source_language <> target_language),
  constraint episode_human_translations_translator_unique unique (episode_id, target_language, translator_user_id),
  constraint episode_human_translations_published_payload_check check (
    status <> 'published'
    or (
      published_payload is not null
      and published_source_hash is not null
      and published_at is not null
      and rights_confirmed_at is not null
    )
  )
);

create index if not exists idx_episode_human_translations_reader
  on public.episode_human_translations
    (episode_id, target_language, status, published_source_hash, updated_at desc);

create index if not exists idx_episode_human_translations_translator
  on public.episode_human_translations (translator_user_id, updated_at desc);

alter table public.episode_human_translations enable row level security;

revoke all on table public.episode_human_translations from anon, authenticated;
grant select on table public.episode_human_translations to anon, authenticated;
grant all on table public.episode_human_translations to service_role;

drop policy if exists episode_human_translations_select on public.episode_human_translations;
create policy episode_human_translations_select
on public.episode_human_translations
for select
to public
using (
  (auth.uid() is not null and translator_user_id = auth.uid())
  or (
    status = 'published'
    and exists (
      select 1 from public.series s
      where s.id = episode_human_translations.series_id
        and s.publication_status = 'public'
    )
    and exists (
      select 1 from public.episodes e
      where e.id = episode_human_translations.episode_id
        and e.series_id = episode_human_translations.series_id
        and e.posting_status = 'posted'
        and e.is_published = true
    )
  )
);

-- Mutations are server-only by grants. Ownership policies are defense-in-depth.
drop policy if exists episode_human_translations_insert_owner on public.episode_human_translations;
create policy episode_human_translations_insert_owner
on public.episode_human_translations
for insert
to authenticated
with check (
  auth.uid() is not null
  and translator_user_id = auth.uid()
  and status = 'draft'
  and exists (
    select 1
    from public.series s
    join public.episodes e on e.series_id = s.id
    where s.id = episode_human_translations.series_id
      and e.id = episode_human_translations.episode_id
      and s.publication_status = 'public'
      and s.human_translation_permission_mode = 'open'
      and e.posting_status = 'posted'
      and e.is_published = true
  )
);

drop policy if exists episode_human_translations_update_owner on public.episode_human_translations;
create policy episode_human_translations_update_owner
on public.episode_human_translations
for update
to authenticated
using (auth.uid() is not null and translator_user_id = auth.uid())
with check (auth.uid() is not null and translator_user_id = auth.uid());

comment on table public.episode_human_translations is
  'User-authored Human translation UGC. Never populated by AI generation.';

commit;
