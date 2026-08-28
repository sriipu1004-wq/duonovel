-- Shared contextual word-explanation cache for every bilingual reader.

create table if not exists public.bilingual_word_explanations (
  id uuid primary key default gen_random_uuid(),
  content_type text not null
    check (content_type in ('private_library', 'episode', 'generated_story')),
  content_id text not null check (char_length(content_id) between 1 and 120),
  owner_user_id uuid references auth.users(id) on delete set null,
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
  actual_cost_jpy numeric(12, 6),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (
    content_type,
    content_id,
    source_hash,
    source_language,
    target_language,
    segment_id,
    selected_side,
    selected_text_key
  )
);

create index if not exists idx_bilingual_word_explanations_content
  on public.bilingual_word_explanations (
    content_type,
    content_id,
    source_language,
    target_language,
    updated_at desc
  );

create index if not exists idx_bilingual_word_explanations_owner
  on public.bilingual_word_explanations (owner_user_id, updated_at desc)
  where owner_user_id is not null;

alter table public.bilingual_word_explanations enable row level security;
revoke all on table public.bilingual_word_explanations from anon, authenticated;
grant all on table public.bilingual_word_explanations to service_role;

insert into public.bilingual_word_explanations (
  content_type,
  content_id,
  owner_user_id,
  source_hash,
  source_language,
  target_language,
  segment_id,
  selected_side,
  selected_text,
  selected_text_key,
  opposite_text,
  part_of_speech,
  note,
  model,
  input_tokens,
  output_tokens,
  actual_cost_jpy,
  created_at,
  updated_at
)
select
  'private_library',
  chapter_id::text,
  owner_user_id,
  source_hash,
  source_language,
  target_language,
  segment_id,
  selected_side,
  selected_text,
  selected_text_key,
  opposite_text,
  part_of_speech,
  note,
  model,
  input_tokens,
  output_tokens,
  actual_cost_jpy,
  created_at,
  updated_at
from public.private_library_word_explanations
on conflict (
  content_type,
  content_id,
  source_hash,
  source_language,
  target_language,
  segment_id,
  selected_side,
  selected_text_key
)
do nothing;
