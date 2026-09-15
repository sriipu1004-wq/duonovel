-- Security/performance hardening for display-name availability checks.
--
-- The previous server helper scanned Supabase Auth users page-by-page (up to
-- 100,000 accounts per request) because pending display names only lived in Auth
-- metadata. Do not reserve names for unconfirmed accounts. Completed profiles
-- are authoritative in public.users, and a normalized unique key closes the
-- final concurrent-write race at the database boundary.

begin;

alter table public.users
  add column if not exists display_name_key text
  generated always as (
    lower(
      regexp_replace(
        btrim(display_name),
        '[[:space:]]+',
        ' ',
        'g'
      )
    )
  ) stored;

create unique index if not exists users_display_name_key_unique
  on public.users (display_name_key);

commit;
