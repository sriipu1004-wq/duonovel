-- Series-level translation consistency memory for public works.
-- Additive only: existing episode_translations rows and cache identity stay untouched.

create table if not exists public.series_translation_glossary_entries (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references public.series(id) on delete cascade,
  source_language text not null,
  source_term text not null,
  term_type text not null default 'other'
    check (term_type in (
      'character', 'person', 'place', 'organization', 'item',
      'skill', 'magic', 'concept', 'title', 'other'
    )),
  source_note text,
  first_seen_episode_id uuid references public.episodes(id) on delete set null,
  effective_from_episode_number integer not null default 1
    check (effective_from_episode_number >= 1),
  origin text not null default 'author'
    check (origin in ('ai', 'author', 'editor', 'system')),
  status text not null default 'confirmed'
    check (status in ('suggested', 'confirmed', 'disabled')),
  is_locked boolean not null default false,
  is_global boolean not null default false,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (source_term = btrim(source_term)),
  check (char_length(source_term) between 1 and 120),
  check (source_note is null or char_length(source_note) <= 1000),
  check (
    not is_global
    or (is_locked and origin in ('author', 'editor'))
  ),
  unique (series_id, source_language, source_term)
);

create table if not exists public.series_translation_glossary_targets (
  id uuid primary key default gen_random_uuid(),
  glossary_entry_id uuid not null
    references public.series_translation_glossary_entries(id) on delete cascade,
  target_language text not null,
  target_term text not null,
  translation_note text,
  origin text not null default 'author'
    check (origin in ('ai', 'author', 'editor', 'system')),
  status text not null default 'confirmed'
    check (status in ('suggested', 'confirmed', 'disabled')),
  is_locked boolean not null default false,
  first_seen_episode_id uuid references public.episodes(id) on delete set null,
  effective_from_episode_number integer not null default 1
    check (effective_from_episode_number >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (target_term = btrim(target_term)),
  check (char_length(target_term) between 1 and 200),
  check (translation_note is null or char_length(translation_note) <= 1000),
  unique (glossary_entry_id, target_language)
);

create table if not exists public.series_translation_profiles (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references public.series(id) on delete cascade,
  target_language text not null,
  style_notes text,
  honorific_policy text,
  formatting_notes text,
  origin text not null default 'author'
    check (origin in ('author', 'editor', 'system')),
  updated_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (style_notes is null or char_length(style_notes) <= 2000),
  check (honorific_policy is null or char_length(honorific_policy) <= 2000),
  check (formatting_notes is null or char_length(formatting_notes) <= 2000),
  unique (series_id, target_language)
);

create index if not exists idx_series_translation_glossary_entries_resolver
  on public.series_translation_glossary_entries (
    series_id,
    source_language,
    status,
    effective_from_episode_number,
    is_locked desc
  );

create index if not exists idx_series_translation_glossary_entries_source_term
  on public.series_translation_glossary_entries (
    series_id,
    source_language,
    source_term
  );

create index if not exists idx_series_translation_glossary_targets_resolver
  on public.series_translation_glossary_targets (
    target_language,
    glossary_entry_id,
    status,
    effective_from_episode_number,
    is_locked desc
  );

create index if not exists idx_series_translation_profiles_lookup
  on public.series_translation_profiles (series_id, target_language);

alter table public.series_translation_glossary_entries enable row level security;
alter table public.series_translation_glossary_targets enable row level security;
alter table public.series_translation_profiles enable row level security;

-- Glossary data is internal authoring/translation memory. General readers never
-- receive direct table access. The translation generator uses service_role.
revoke all on table public.series_translation_glossary_entries from anon;
revoke all on table public.series_translation_glossary_targets from anon;
revoke all on table public.series_translation_profiles from anon;

grant select, insert, update, delete
  on table public.series_translation_glossary_entries to authenticated;
grant select, insert, update, delete
  on table public.series_translation_glossary_targets to authenticated;
grant select, insert, update, delete
  on table public.series_translation_profiles to authenticated;
grant all on table public.series_translation_glossary_entries to service_role;
grant all on table public.series_translation_glossary_targets to service_role;
grant all on table public.series_translation_profiles to service_role;

create policy "series_translation_glossary_owner_select"
on public.series_translation_glossary_entries
for select
to authenticated
using (
  exists (
    select 1
    from public.series as owned_series
    where owned_series.id = series_translation_glossary_entries.series_id
      and owned_series.author_id = auth.uid()
  )
);

create policy "series_translation_glossary_owner_insert"
on public.series_translation_glossary_entries
for insert
to authenticated
with check (
  created_by_user_id = auth.uid()
  and origin = 'author'
  and exists (
    select 1
    from public.series as owned_series
    where owned_series.id = series_translation_glossary_entries.series_id
      and owned_series.author_id = auth.uid()
      and owned_series.source_language = series_translation_glossary_entries.source_language
  )
);

create policy "series_translation_glossary_owner_update"
on public.series_translation_glossary_entries
for update
to authenticated
using (
  exists (
    select 1
    from public.series as owned_series
    where owned_series.id = series_translation_glossary_entries.series_id
      and owned_series.author_id = auth.uid()
  )
)
with check (
  origin = 'author'
  and exists (
    select 1
    from public.series as owned_series
    where owned_series.id = series_translation_glossary_entries.series_id
      and owned_series.author_id = auth.uid()
      and owned_series.source_language = series_translation_glossary_entries.source_language
  )
);

create policy "series_translation_glossary_owner_delete"
on public.series_translation_glossary_entries
for delete
to authenticated
using (
  exists (
    select 1
    from public.series as owned_series
    where owned_series.id = series_translation_glossary_entries.series_id
      and owned_series.author_id = auth.uid()
  )
);

create policy "series_translation_glossary_target_owner_select"
on public.series_translation_glossary_targets
for select
to authenticated
using (
  exists (
    select 1
    from public.series_translation_glossary_entries as entry
    join public.series as owned_series on owned_series.id = entry.series_id
    where entry.id = series_translation_glossary_targets.glossary_entry_id
      and owned_series.author_id = auth.uid()
  )
);

create policy "series_translation_glossary_target_owner_insert"
on public.series_translation_glossary_targets
for insert
to authenticated
with check (
  origin = 'author'
  and exists (
    select 1
    from public.series_translation_glossary_entries as entry
    join public.series as owned_series on owned_series.id = entry.series_id
    where entry.id = series_translation_glossary_targets.glossary_entry_id
      and owned_series.author_id = auth.uid()
      and entry.source_language <> series_translation_glossary_targets.target_language
  )
);

create policy "series_translation_glossary_target_owner_update"
on public.series_translation_glossary_targets
for update
to authenticated
using (
  exists (
    select 1
    from public.series_translation_glossary_entries as entry
    join public.series as owned_series on owned_series.id = entry.series_id
    where entry.id = series_translation_glossary_targets.glossary_entry_id
      and owned_series.author_id = auth.uid()
  )
)
with check (
  origin = 'author'
  and exists (
    select 1
    from public.series_translation_glossary_entries as entry
    join public.series as owned_series on owned_series.id = entry.series_id
    where entry.id = series_translation_glossary_targets.glossary_entry_id
      and owned_series.author_id = auth.uid()
      and entry.source_language <> series_translation_glossary_targets.target_language
  )
);

create policy "series_translation_glossary_target_owner_delete"
on public.series_translation_glossary_targets
for delete
to authenticated
using (
  exists (
    select 1
    from public.series_translation_glossary_entries as entry
    join public.series as owned_series on owned_series.id = entry.series_id
    where entry.id = series_translation_glossary_targets.glossary_entry_id
      and owned_series.author_id = auth.uid()
  )
);

create policy "series_translation_profile_owner_select"
on public.series_translation_profiles
for select
to authenticated
using (
  exists (
    select 1
    from public.series as owned_series
    where owned_series.id = series_translation_profiles.series_id
      and owned_series.author_id = auth.uid()
  )
);

create policy "series_translation_profile_owner_insert"
on public.series_translation_profiles
for insert
to authenticated
with check (
  updated_by_user_id = auth.uid()
  and origin = 'author'
  and exists (
    select 1
    from public.series as owned_series
    where owned_series.id = series_translation_profiles.series_id
      and owned_series.author_id = auth.uid()
      and owned_series.source_language <> series_translation_profiles.target_language
  )
);

create policy "series_translation_profile_owner_update"
on public.series_translation_profiles
for update
to authenticated
using (
  exists (
    select 1
    from public.series as owned_series
    where owned_series.id = series_translation_profiles.series_id
      and owned_series.author_id = auth.uid()
  )
)
with check (
  updated_by_user_id = auth.uid()
  and origin = 'author'
  and exists (
    select 1
    from public.series as owned_series
    where owned_series.id = series_translation_profiles.series_id
      and owned_series.author_id = auth.uid()
      and owned_series.source_language <> series_translation_profiles.target_language
  )
);

create policy "series_translation_profile_owner_delete"
on public.series_translation_profiles
for delete
to authenticated
using (
  exists (
    select 1
    from public.series as owned_series
    where owned_series.id = series_translation_profiles.series_id
      and owned_series.author_id = auth.uid()
  )
);
