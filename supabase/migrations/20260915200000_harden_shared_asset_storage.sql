-- Security audit hardening for site-managed shared assets.
-- No data is rewritten. Existing public reads remain available.

-- bgm_library is a site-managed catalog. Client roles only need SELECT.
revoke insert, update, delete, truncate, references, trigger
  on table public.bgm_library
  from anon, authenticated;
grant select on table public.bgm_library to anon, authenticated;

drop policy if exists "bgm_library_insert_authenticated" on public.bgm_library;
drop policy if exists "bgm_library_update_authenticated" on public.bgm_library;
-- Keep the canonical public SELECT policy. The authenticated-only SELECT policy
-- is redundant but harmless; remove it to keep the access model unambiguous.
drop policy if exists "bgm_library_select_authenticated" on public.bgm_library;

-- These buckets contain shared/site-managed assets. The application has no
-- client-side write path for either bucket, so authenticated mutation is not
-- required. service_role remains able to manage storage as needed.
drop policy if exists "storage_bgm_library_insert_authenticated" on storage.objects;
drop policy if exists "storage_bgm_library_update_authenticated" on storage.objects;

drop policy if exists "Authenticated users can upload illustrations" on storage.objects;
drop policy if exists "Authenticated users can update illustrations" on storage.objects;
drop policy if exists "Authenticated users can delete illustrations" on storage.objects;

-- Preserve existing read policies:
--   Anyone can read public illustrations
--   storage_bgm_library_select_authenticated
-- Both buckets are public, so object delivery remains public by design.
