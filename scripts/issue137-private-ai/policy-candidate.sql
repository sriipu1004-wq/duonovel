-- Issue #137 1-2 — NONPRODUCTION candidate. NOT a migration; never apply to the
-- hosted project without separate owner approval and independent review.
--
-- Goal: AI narration audio bytes are written by the requesting official
-- narration account's own session JWT (RLS-checked), not by service_role.
-- Uses only provider-supported Storage RLS policies on storage.objects (no
-- triggers on the managed storage schema).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ai-narration-private',
  'ai-narration-private',
  false,
  104857600,
  array['audio/wav', 'audio/x-wav', 'application/json']
)
on conflict (id) do nothing;

-- Only the official narration account may INSERT, only under nemo/ or aivis/,
-- and only as the object owner. Mirrors src/lib/auth/officialNarrationAccount.ts.
drop policy if exists "ai_narration_private_official_insert" on storage.objects;
create policy "ai_narration_private_official_insert"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'ai-narration-private'
    and lower(coalesce(auth.jwt() ->> 'email', '')) = 'libread08@gmail.com'
    and (storage.foldername(name))[1] in ('nemo', 'aivis')
    and owner_id = (select auth.uid())::text
  );

-- Deliberately NO select / update / delete policy for anon or authenticated:
-- objects are immutable from user roles (no overwrite, no removal), and
-- playback goes through the server-side, access-checked proxy.
