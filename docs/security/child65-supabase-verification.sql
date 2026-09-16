-- Child 65 security audit: read-only Supabase verification queries.
-- Run against Preview/Test first. These statements do not mutate data.

-- 1. Every public base table and whether RLS / FORCE RLS is enabled.
select
  n.nspname as schema_name,
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as force_rls
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
order by c.relname;

-- 2. Effective RLS policy inventory.
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname in ('public', 'storage')
order by schemaname, tablename, policyname;

-- 3. SECURITY DEFINER functions, fixed search_path state and exposed role grants.
select
  p.oid::regprocedure::text as function_signature,
  p.prosecdef as security_definer,
  p.proconfig,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
order by p.proname, p.oid::regprocedure::text;

-- 4. Table grants exposed through PostgREST roles.
select
  table_schema,
  table_name,
  grantee,
  privilege_type
from information_schema.role_table_grants
where table_schema in ('public', 'storage')
  and grantee in ('anon', 'authenticated', 'service_role')
order by table_schema, table_name, grantee, privilege_type;

-- 5. Sensitive finance / entitlement tables: browser roles should not have
-- mutation grants unless explicitly required by the application contract.
select
  table_name,
  grantee,
  string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in (
    'credit_ledger',
    'credit_purchase_lots',
    'credit_purchase_reversals',
    'public_episode_translation_unlocks',
    'libread_billing_customers',
    'libread_billing_subscriptions',
    'libread_stripe_webhook_events',
    'libread_user_entitlements'
  )
  and grantee in ('anon', 'authenticated', 'service_role')
group by table_name, grantee
order by table_name, grantee;

-- 6. Canonical publication-policy sanity: no legacy is_public-only public SELECT
-- policy should remain for series / episodes.
select
  tablename,
  policyname,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('series', 'episodes')
order by tablename, policyname;

-- 7. Storage bucket posture and object policies.
select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
order by id;

select
  policyname,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
order by policyname;

-- 8. Data-integrity constraints relied upon for idempotency / anti-amplification.
select
  conrelid::regclass::text as table_name,
  conname,
  contype,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where connamespace = 'public'::regnamespace
  and conrelid::regclass::text in (
    'credit_purchase_lots',
    'credit_purchase_reversals',
    'public_episode_translation_unlocks',
    'user_series_reactions',
    'user_series_bookmarks',
    'author_follows',
    'author_profile_likes'
  )
order by table_name, conname;

-- 9. Aggregate-only publication sanity checks. Do not select private bodies.
select
  count(*) filter (where publication_status = 'private') as private_series,
  count(*) filter (where publication_status = 'public') as public_series
from public.series;

select
  count(*) filter (
    where s.publication_status <> 'public'
       or e.posting_status <> 'posted'
       or e.is_published is not true
  ) as nonpublic_episode_rows,
  count(*) as total_episode_rows
from public.episodes e
join public.series s on s.id = e.series_id;

-- 10. Orphan / duplicate aggregate checks for social counters. No user payloads.
select
  count(*) as orphan_reactions
from public.user_series_reactions r
left join public.series s on s.id = r.series_id
where s.id is null;

select count(*) as duplicate_reaction_groups
from (
  select user_id, series_id
  from public.user_series_reactions
  group by user_id, series_id
  having count(*) > 1
) d;

select
  count(*) as orphan_bookmarks
from public.user_series_bookmarks b
left join public.series s on s.id = b.series_id
where s.id is null;

-- 11. Public recordings must point only at canonical public targets if marked public.
select count(*) as public_recordings_on_nonpublic_targets
from public.recordings r
left join public.series s on s.id = r.series_id
left join public.episodes e on e.id = r.episode_id
where r.is_public is true
  and (
    s.id is null
    or e.id is null
    or e.series_id <> r.series_id
    or s.publication_status <> 'public'
    or e.posting_status <> 'posted'
    or e.is_published is not true
  );
