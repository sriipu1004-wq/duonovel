-- Private, user-owned human translations for public/owned episodes.
-- These rows never replace the shared AI cache and are visible only to their creator.

alter table public.series
  alter column translation_permission_mode set default 'open';

-- Generated works are created with both author permissions open by default.
update public.series
set
  translation_permission_mode = 'open',
  recording_permission_mode = 'open'
where
  'AI生成' = any(coalesce(tags, array[]::text[]))
  or coalesce(effect_settings->>'source', '') = 'time_fit_ai_story'
  or coalesce(effect_settings->>'aiGenerated', 'false') = 'true'
  or coalesce(effect_settings->>'authorName', '') = 'AI生成';

-- Rights-reviewed official Public Domain imports are explicitly open for both
-- translation and narration. Legacy rows without rights metadata are not
-- broadened by this migration.
update public.series
set
  translation_permission_mode = 'open',
  recording_permission_mode = 'open'
where coalesce(effect_settings->'publicDomain'->>'rightsChecked', 'false') = 'true';

create table if not exists public.user_episode_translations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  episode_id uuid not null references public.episodes(id) on delete cascade,
  source_language text not null,
  target_language text not null,
  source_hash text not null,
  segment_version integer not null default 2,
  segments jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_episode_translations_languages_differ
    check (source_language <> target_language),
  constraint user_episode_translations_source_hash_check
    check (length(source_hash) >= 32),
  unique (user_id, episode_id, source_language, target_language, source_hash)
);

comment on table public.user_episode_translations is
  'Private human translations created by a reader for their own Reader. Never shared as the canonical public translation cache.';

create index if not exists idx_user_episode_translations_lookup
  on public.user_episode_translations
  (user_id, episode_id, source_language, target_language, updated_at desc);

alter table public.user_episode_translations enable row level security;

revoke all on table public.user_episode_translations from anon, authenticated;
grant select, insert, update, delete on table public.user_episode_translations to authenticated;
grant all on table public.user_episode_translations to service_role;

drop policy if exists "user_episode_translations_select_own"
  on public.user_episode_translations;
create policy "user_episode_translations_select_own"
  on public.user_episode_translations
  for select
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "user_episode_translations_insert_own"
  on public.user_episode_translations;
create policy "user_episode_translations_insert_own"
  on public.user_episode_translations
  for insert
  to authenticated
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "user_episode_translations_update_own"
  on public.user_episode_translations;
create policy "user_episode_translations_update_own"
  on public.user_episode_translations
  for update
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "user_episode_translations_delete_own"
  on public.user_episode_translations;
create policy "user_episode_translations_delete_own"
  on public.user_episode_translations
  for delete
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);
