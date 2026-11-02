-- Issue #138: restrict authenticated direct private-library mutations.
--
-- IMPORTANT: source migration ONLY. Do not apply to hosted Supabase without
-- an exact, separately approved production DB migration and release review.
--
-- Existing SECURITY DEFINER import RPCs retain the current verified
-- auth.uid()/ownership/completeness/declared-size/quota enforcement.
-- Existing direct work title/author editing and owner DELETE remain available.
-- RLS policies, table rows, Auth users and any Storage are not altered.
--
-- Prior privilege inventory (pg_catalog LIVE READ ONLY, 2026-11-02 UTC):
-- both public.private_library_works and public.private_library_chapters have
-- table-level authenticated=arwdDxtm, with no column-specific grants.
-- No known app client requires direct chapters INSERT/UPDATE/DELETE or work
-- INSERT; approved app direct work PATCH changes title,author_name,updated_at.
begin;

-- Stop user JWTs from bypassing RPC-only import completeness/quota checks:
-- direct work INSERT can mint fabricated import rows, and unrestricted UPDATE
-- can set READY, declared source_char_count and expected chapter_count.
revoke insert,update on table public.private_library_works
 from public,anon,authenticated;

-- Even after a valid imported READY state, direct client chapter edits/deletes
-- could defeat the enforced aggregate consistency. All authorized imports go
-- through the existing owner-checked SECURITY DEFINER import RPCs.
revoke insert,update,delete on table public.private_library_chapters
 from public,anon,authenticated;

-- Preserve the legitimate authenticated work metadata PATCH endpoint.
grant update (title,author_name,updated_at)
 on table public.private_library_works to authenticated;

-- Migration stops rather than claiming success if effective privileges differ
-- from the intended least-privilege boundary. SELECT and owner DELETE remain
-- intentionally intact. The service_role keeps its preexisting grants.
do $assert_private_import_roles$
begin
 if has_table_privilege('authenticated','public.private_library_works','INSERT')
    or has_table_privilege('authenticated','public.private_library_works','UPDATE')
    or has_column_privilege('authenticated','public.private_library_works','import_status','UPDATE')
    or has_column_privilege('authenticated','public.private_library_works','source_char_count','UPDATE')
    or has_column_privilege('authenticated','public.private_library_works','chapter_count','UPDATE')
    or not has_column_privilege('authenticated','public.private_library_works','title','UPDATE')
    or not has_column_privilege('authenticated','public.private_library_works','author_name','UPDATE')
    or not has_column_privilege('authenticated','public.private_library_works','updated_at','UPDATE')
    or not has_table_privilege('authenticated','public.private_library_works','DELETE')
    or not has_table_privilege('authenticated','public.private_library_works','SELECT')
    or has_table_privilege('authenticated','public.private_library_chapters','INSERT')
    or has_table_privilege('authenticated','public.private_library_chapters','UPDATE')
    or has_table_privilege('authenticated','public.private_library_chapters','DELETE')
    or not has_table_privilege('authenticated','public.private_library_chapters','SELECT')
    or not has_table_privilege('service_role','public.private_library_works','INSERT')
    or not has_table_privilege('service_role','public.private_library_chapters','INSERT')
 then
  raise exception 'Issue #138 private-library effective role grants mismatch'
   using errcode='42501';
 end if;
end
$assert_private_import_roles$;

commit;
