-- F2-P LOCAL ONLY (Issue #137) — NEW PRIVATE object INSERT by a signed-in
-- user Session Token under RLS, without service-role for the upload.
-- Applied manually only to disposable Docker PostgreSQL in run-local.sh.
-- This is NOT a production migration and creates NO PUBLIC object/bucket.
-- Do not broaden any other storage policy or grant UPDATE/DELETE rights.
create policy issue137_f2p_rls_private_writer_insert
on storage.objects as permissive for insert to authenticated
with check (
 bucket_id = 'f2p-rls-user-stage'
 and name ~ ('^owner/' || (select auth.uid())::text ||
   '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]wav$')
);
create policy issue137_f2p_rls_private_writer_read
on storage.objects as permissive for select to authenticated
using (
 bucket_id = 'f2p-rls-user-stage'
 and name ~ ('^owner/' || (select auth.uid())::text ||
   '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]wav$')
);
-- Additional restrictive policy, even if another permissive insert policy is
-- added later: the new bucket's stage paths MUST match the JWT subject.
create policy issue137_f2p_rls_private_writer_restrict_insert
on storage.objects as restrictive for insert to authenticated
with check (bucket_id <> 'f2p-rls-user-stage' or
 (name ~ ('^owner/' || (select auth.uid())::text ||
   '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]wav$')));
create policy issue137_f2p_rls_private_writer_restrict_read
on storage.objects as restrictive for select to authenticated
using (bucket_id <> 'f2p-rls-user-stage' or
 (name ~ ('^owner/' || (select auth.uid())::text ||
   '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]wav$')));
-- Public bucket, authentication roles and service-role credentials UNCHANGED.
