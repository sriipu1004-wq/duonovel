-- Work-level terminology memory for consistent long-form translations.

create table if not exists public.private_library_glossary_terms (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references public.private_library_works(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  source_language text not null,
  target_language text not null,
  source_term text not null check (char_length(source_term) between 1 and 120),
  target_term text not null check (char_length(target_term) between 1 and 200),
  is_locked boolean not null default false,
  last_seen_chapter_number integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (work_id, source_language, target_language, source_term),
  check (source_language <> target_language)
);

create index if not exists idx_private_library_glossary_work_languages
  on public.private_library_glossary_terms (
    work_id,
    source_language,
    target_language,
    is_locked desc,
    updated_at desc
  );

alter table public.private_library_glossary_terms enable row level security;

drop policy if exists "private_library_glossary_owner_select"
  on public.private_library_glossary_terms;
create policy "private_library_glossary_owner_select"
on public.private_library_glossary_terms
for select
to authenticated
using (
  owner_user_id = auth.uid()
  and exists (
    select 1 from public.private_library_works as work
    where work.id = private_library_glossary_terms.work_id
      and work.owner_user_id = auth.uid()
  )
);

drop policy if exists "private_library_glossary_owner_insert"
  on public.private_library_glossary_terms;
create policy "private_library_glossary_owner_insert"
on public.private_library_glossary_terms
for insert
to authenticated
with check (
  owner_user_id = auth.uid()
  and is_locked = true
  and exists (
    select 1 from public.private_library_works as work
    where work.id = private_library_glossary_terms.work_id
      and work.owner_user_id = auth.uid()
      and work.source_language = private_library_glossary_terms.source_language
  )
);

drop policy if exists "private_library_glossary_owner_update"
  on public.private_library_glossary_terms;
create policy "private_library_glossary_owner_update"
on public.private_library_glossary_terms
for update
to authenticated
using (owner_user_id = auth.uid())
with check (
  owner_user_id = auth.uid()
  and is_locked = true
  and exists (
    select 1 from public.private_library_works as work
    where work.id = private_library_glossary_terms.work_id
      and work.owner_user_id = auth.uid()
      and work.source_language = private_library_glossary_terms.source_language
  )
);

drop policy if exists "private_library_glossary_owner_delete"
  on public.private_library_glossary_terms;
create policy "private_library_glossary_owner_delete"
on public.private_library_glossary_terms
for delete
to authenticated
using (owner_user_id = auth.uid());

revoke all on table public.private_library_glossary_terms from anon;
grant select, insert, update, delete on table public.private_library_glossary_terms to authenticated;
grant all on table public.private_library_glossary_terms to service_role;
