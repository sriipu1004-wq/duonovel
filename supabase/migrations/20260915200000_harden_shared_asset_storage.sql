-- Security audit hardening for shared/site-managed assets.
-- No existing object data is rewritten. Public reads remain available.

-- bgm_library is a site-managed catalog. Browser roles only need SELECT.
revoke insert, update, delete, truncate, references, trigger
  on table public.bgm_library
  from anon, authenticated;
grant select on table public.bgm_library to anon, authenticated;

drop policy if exists "bgm_library_insert_authenticated" on public.bgm_library;
drop policy if exists "bgm_library_update_authenticated" on public.bgm_library;
-- Keep one canonical public SELECT policy. The authenticated-only SELECT policy
-- is redundant because authenticated requests also satisfy the public policy.
drop policy if exists "bgm_library_select_authenticated" on public.bgm_library;

-- BGM files are site-managed assets. Client roles must not be able to replace
-- catalog audio. service_role remains able to manage the bucket when required.
drop policy if exists "storage_bgm_library_insert_authenticated" on storage.objects;
drop policy if exists "storage_bgm_library_update_authenticated" on storage.objects;

-- Illustrations are uploaded directly from EffectSettingsForm in the browser,
-- under effects/<series_id>/<series_or_episode_id>/<file>. The old policies
-- allowed every authenticated user to mutate every illustration in the bucket.
-- Replace them with ownership-aware policies that also bind the object path to
-- a series owned by the current user.
drop policy if exists "Authenticated users can upload illustrations" on storage.objects;
drop policy if exists "Authenticated users can update illustrations" on storage.objects;
drop policy if exists "Authenticated users can delete illustrations" on storage.objects;
drop policy if exists "Users can upload owned-series illustrations" on storage.objects;
drop policy if exists "Users can update owned-series illustrations" on storage.objects;
drop policy if exists "Users can delete owned-series illustrations" on storage.objects;

create policy "Users can upload owned-series illustrations"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'illustrations'
  and (storage.foldername(name))[1] = 'effects'
  and exists (
    select 1
    from public.series s
    where s.id::text = (storage.foldername(name))[2]
      and s.author_id = auth.uid()
      and (
        (storage.foldername(name))[3] = s.id::text
        or exists (
          select 1
          from public.episodes e
          where e.id::text = (storage.foldername(name))[3]
            and e.series_id = s.id
        )
      )
  )
);

create policy "Users can update owned-series illustrations"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'illustrations'
  and owner_id = auth.uid()::text
  and (storage.foldername(name))[1] = 'effects'
  and exists (
    select 1
    from public.series s
    where s.id::text = (storage.foldername(name))[2]
      and s.author_id = auth.uid()
  )
)
with check (
  bucket_id = 'illustrations'
  and owner_id = auth.uid()::text
  and (storage.foldername(name))[1] = 'effects'
  and exists (
    select 1
    from public.series s
    where s.id::text = (storage.foldername(name))[2]
      and s.author_id = auth.uid()
      and (
        (storage.foldername(name))[3] = s.id::text
        or exists (
          select 1
          from public.episodes e
          where e.id::text = (storage.foldername(name))[3]
            and e.series_id = s.id
        )
      )
  )
);

create policy "Users can delete owned-series illustrations"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'illustrations'
  and owner_id = auth.uid()::text
  and (storage.foldername(name))[1] = 'effects'
  and exists (
    select 1
    from public.series s
    where s.id::text = (storage.foldername(name))[2]
      and s.author_id = auth.uid()
      and (
        (storage.foldername(name))[3] = s.id::text
        or exists (
          select 1
          from public.episodes e
          where e.id::text = (storage.foldername(name))[3]
            and e.series_id = s.id
        )
      )
  )
);

-- Mirror the existing browser-side guard at the storage boundary. A compromised
-- or custom client must not bypass the 5 MiB image-only restriction.
update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array['image/*']::text[]
where id = 'illustrations';

-- Preserve existing read policies:
--   Anyone can read public illustrations
--   storage_bgm_library_select_authenticated
-- Both buckets are public, so object delivery remains public by design.
