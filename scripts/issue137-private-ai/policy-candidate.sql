-- Issue #137 1-2 — NONPRODUCTION candidate. NOT a migration; never apply to the
-- hosted project without separate owner approval and independent review.
--
-- Goal: AI narration audio bytes are written by the requesting official
-- narration account's own session JWT (RLS-checked), not by service_role.
-- Uses only provider-supported Storage RLS policies on storage.objects (no
-- triggers on the managed storage schema).
--
-- Writer identity (review F1 on 8903d5f): the JWT email claim alone is not
-- enough (an old JWT survives an email change until expiry; a deleted and
-- re-created account, or an email moved to another uid, would inherit the
-- right). The writer must be BOTH an allowlisted auth uid AND carry the
-- official email. The allowlist is service-role-only and its rows are
-- removed with the auth user (on delete cascade), so a re-created account is
-- NOT a writer until it is explicitly re-enrolled. Enrolling the official uid
-- is a separate, owner-approved step; no account id is stored in Git.

begin;

create table if not exists public.ai_narration_official_writers (
  user_id uuid primary key references auth.users (id) on delete cascade,
  enrolled_at timestamptz not null default now()
);
alter table public.ai_narration_official_writers enable row level security;
-- No policies: anon/authenticated cannot read or change the allowlist.
revoke all on table public.ai_narration_official_writers from public, anon, authenticated;

create or replace function public.is_ai_narration_official_writer()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.ai_narration_official_writers w
    where w.user_id = auth.uid()
  );
$$;
revoke all on function public.is_ai_narration_official_writer() from public, anon;
grant execute on function public.is_ai_narration_official_writer() to authenticated;

-- Converge the bucket even if it already exists with other settings (review F2).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ai-narration-private',
  'ai-narration-private',
  false,
  104857600,
  array['audio/wav', 'audio/x-wav', 'application/json']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Only the enrolled official narration account may INSERT, only under nemo/
-- or aivis/, and only as the object owner.
drop policy if exists "ai_narration_private_official_insert" on storage.objects;
create policy "ai_narration_private_official_insert"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'ai-narration-private'
    and (select public.is_ai_narration_official_writer())
    and lower(coalesce(auth.jwt() ->> 'email', '')) = 'libread08@gmail.com'
    and (storage.foldername(name))[1] in ('nemo', 'aivis')
    and owner_id = (select auth.uid())::text
  );

-- Deliberately NO select / update / delete policy for anon or authenticated:
-- objects are immutable from user roles (no overwrite, no removal), and
-- playback goes through the server-side, access-checked proxy.

-- Fail the whole transaction unless the bucket is private with the exact limits.
do $$
begin
  if not exists (
    select 1 from storage.buckets
    where id = 'ai-narration-private'
      and public = false
      and file_size_limit = 104857600
      and allowed_mime_types = array['audio/wav', 'audio/x-wav', 'application/json']
  ) then
    raise exception 'ai-narration-private bucket did not converge to private settings';
  end if;
end
$$;

commit;
