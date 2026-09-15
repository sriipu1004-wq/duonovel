-- Security hardening for user illustrations and the site-managed BGM library.
-- Keep both buckets public for existing public-URL reads; only mutation rights change.

-- User illustrations: an authenticated user may mutate only objects they own.
drop policy if exists "Authenticated users can upload illustrations" on storage.objects;
drop policy if exists "Authenticated users can update illustrations" on storage.objects;
drop policy if exists "Authenticated users can delete illustrations" on storage.objects;

create policy "Authenticated users can upload own illustrations"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'illustrations'
  and owner_id = auth.uid()::text
);

create policy "Authenticated users can update own illustrations"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'illustrations'
  and owner_id = auth.uid()::text
)
with check (
  bucket_id = 'illustrations'
  and owner_id = auth.uid()::text
);

create policy "Authenticated users can delete own illustrations"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'illustrations'
  and owner_id = auth.uid()::text
);

-- BGM library is site-managed shared content. General authenticated clients
-- only need read access; service_role/server tooling can still maintain it.
drop policy if exists storage_bgm_library_insert_authenticated on storage.objects;
drop policy if exists storage_bgm_library_update_authenticated on storage.objects;

drop policy if exists bgm_library_insert_authenticated on public.bgm_library;
drop policy if exists bgm_library_update_authenticated on public.bgm_library;
