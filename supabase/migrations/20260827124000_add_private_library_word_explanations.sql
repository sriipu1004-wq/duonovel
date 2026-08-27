-- Cached word-level meaning and part-of-speech explanations for private bilingual reading.

create table if not exists public.private_library_word_explanations (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  chapter_id uuid not null references public.private_library_chapters(id) on delete cascade,
  source_hash text not null,
  source_language text not null,
  target_language text not null,
  segment_id text not null,
  selected_side text not null check (selected_side in ('source', 'target')),
  selected_text text not null,
  selected_text_key text not null,
  opposite_text text not null,
  part_of_speech text not null,
  note text not null default '',
  model text,
  input_tokens integer,
  output_tokens integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (
    chapter_id,
    source_hash,
    source_language,
    target_language,
    segment_id,
    selected_side,
    selected_text_key
  )
);

create index if not exists idx_private_library_word_explanations_owner
  on public.private_library_word_explanations (owner_user_id, updated_at desc);

alter table public.private_library_word_explanations enable row level security;
revoke all on table public.private_library_word_explanations from anon, authenticated;
grant all on table public.private_library_word_explanations to service_role;
