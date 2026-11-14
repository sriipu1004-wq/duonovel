-- Issue #142 PR3: apply the migration to a disposable PostgreSQL and assert
-- (CI service container only; never the hosted project).
--   psql -X -v ON_ERROR_STOP=1 -f scripts/issue142-google-consent/check.sql
\set ON_ERROR_STOP on
\i scripts/issue142-google-consent/fixture.sql

-- Rows owned by each test user, created before the migration (as owner).
create table public.test_seed (uid uuid primary key, series_id uuid, episode_id uuid,
  comment_id uuid, review_id uuid, entry_id uuid, target_id uuid, profile_id uuid);
grant select on public.test_seed to anon, authenticated, service_role;
do $$
declare u uuid; s uuid; e uuid; c uuid; r uuid; g uuid; t uuid; p uuid;
begin
  for u in select id from auth.users loop
    insert into public.series(author_id) values (u) returning id into s;
    insert into public.episodes(series_id) values (s) returning id into e;
    insert into public.user_episode_comments(episode_id, user_id) values (e, u) returning id into c;
    insert into public.user_series_reviews(series_id, user_id) values (s::text, u) returning id into r;
    insert into public.series_translation_glossary_entries(series_id, source_language, created_by_user_id)
      values (s, 'ja', u) returning id into g;
    insert into public.series_translation_glossary_targets(glossary_entry_id, target_language)
      values (g, 'en') returning id into t;
    insert into public.series_translation_profiles(series_id, target_language, updated_by_user_id)
      values (s, 'en', u) returning id into p;
    insert into public.test_seed values (u, s, e, c, r, g, t, p);
  end loop;
end $$;

-- The migration under test, applied twice (must be idempotent).
\i supabase/migrations/20261115120000_issue142_google_consent_rls.sql
\i supabase/migrations/20261115120000_issue142_google_consent_rls.sql

-- One full write cycle as the current claims. allowed=true: every insert
-- succeeds and every update touches exactly one row. allowed=false: every
-- insert is refused and every update touches no row.
create function public.test_cycle(label text, allowed boolean) returns void
language plpgsql as $$
declare
  u uuid := auth.uid();
  seed public.test_seed;
  statements text[];
  stmt text;
  n integer;
begin
  select * into seed from public.test_seed where uid = u;
  statements := array[
    format('insert into public.series(author_id) values (%L)', u),
    format('insert into public.episodes(series_id) values (%L)', seed.series_id),
    format('insert into public.user_episode_comments(episode_id, user_id) values (%L, %L)', seed.episode_id, u),
    format('insert into public.user_series_reviews(series_id, user_id) values (%L, %L)', seed.series_id::text, u),
    format('insert into public.series_translation_glossary_entries(series_id, source_language, created_by_user_id) values (%L, %L, %L)', seed.series_id, 'ja', u),
    format('insert into public.series_translation_glossary_targets(glossary_entry_id, target_language) values (%L, %L)', seed.entry_id, 'ko'),
    format('insert into public.series_translation_profiles(series_id, target_language, updated_by_user_id) values (%L, %L, %L)', seed.series_id, 'ko', u)
  ];
  foreach stmt in array statements loop
    if allowed then
      execute stmt;
    else
      perform public.test_expect_denied(label || ': ' || left(stmt, 60), stmt);
    end if;
  end loop;

  statements := array[
    format('update public.series set publication_status = %L where id = %L', 'public', seed.series_id),
    format('update public.episodes set is_published = true where id = %L', seed.episode_id),
    format('update public.user_episode_comments set body = %L where id = %L', 'edited', seed.comment_id),
    format('update public.user_series_reviews set body = %L where id = %L', 'edited', seed.review_id),
    format('update public.series_translation_glossary_entries set term = %L where id = %L', 'x', seed.entry_id),
    format('update public.series_translation_glossary_targets set term = %L where id = %L', 'x', seed.target_id),
    format('update public.series_translation_profiles set note = %L where id = %L', 'x', seed.profile_id),
    format('update public.users set display_name = %L where id = %L', 'renamed', u)
  ];
  foreach stmt in array statements loop
    n := public.test_rowcount(stmt);
    if n <> (case when allowed then 1 else 0 end) then
      raise exception 'FAIL: % update touched % rows: %', label, n, stmt;
    end if;
  end loop;
  raise notice 'ok cycle: % (allowed=%)', label, allowed;
end $$;
grant execute on function public.test_cycle(text, boolean) to authenticated;

set role authenticated;

-- Email-only user (the shape of all 11 active production users).
select public.test_as('00000000-0000-4000-8000-00000000000e', '{"provider":"email","providers":["email"]}');
select public.test_cycle('email user', true);
-- Empty / missing app_metadata (soft-deleted production rows have none).
select public.test_as('00000000-0000-4000-8000-00000000000e', '{}');
select public.test_cycle('email user, no app_metadata', true);

-- Google linked, no server-recorded consent.
select public.test_as('00000000-0000-4000-8000-00000000000a', '{"provider":"email","providers":["email","google"]}');
select public.test_cycle('google without consent', false);
-- user_metadata is not app_metadata: a self-written flag does not help.
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', '00000000-0000-4000-8000-00000000000a', 'role', 'authenticated',
  'app_metadata', '{"provider":"email","providers":["email","google"]}'::jsonb,
  'user_metadata', '{"google_consent_identity_id":"11111111-1111-4111-8111-111111111111","account_google_consent_identity_id":"11111111-1111-4111-8111-111111111111"}'::jsonb
)::text, false);
select public.test_cycle('google, consent only in user_metadata', false);
-- Google-created user (provider google) with an empty consent key.
select public.test_as('00000000-0000-4000-8000-00000000000d', '{"provider":"google","providers":["google"],"google_consent_identity_id":"  "}');
select public.test_cycle('google provider, blank consent', false);
-- Either field alone is enough to count as Google.
select public.test_as('00000000-0000-4000-8000-00000000000d', '{"provider":"google"}');
select public.test_cycle('google provider without providers', false);
select public.test_as('00000000-0000-4000-8000-00000000000d', '{"providers":["google"]}');
select public.test_cycle('google in providers without provider', false);

-- Google linked, consent recorded by the server.
select public.test_as('00000000-0000-4000-8000-00000000000c',
  '{"provider":"email","providers":["email","google"],"google_consent_identity_id":"11111111-1111-4111-8111-111111111111"}');
select public.test_cycle('google with consent', true);

-- account_consents: authenticated cannot write; reads only its own rows.
select public.test_expect_denied('authenticated insert account_consents',
  $q$insert into public.account_consents(user_id, identity_id, provider, terms_version, privacy_version,
     agreed_to_terms, agreed_to_privacy, acknowledged_public_surface)
     values ('00000000-0000-4000-8000-00000000000c', '11111111-1111-4111-8111-111111111111', 'google', 'v', 'v', true, true, true)$q$);
select public.test_expect_denied('authenticated update account_consents',
  'update public.account_consents set terms_version = ''x''');
select public.test_expect_denied('authenticated delete account_consents',
  'delete from public.account_consents');
reset role;

set role anon;
select public.test_expect_denied('anon insert account_consents',
  $q$insert into public.account_consents(user_id, identity_id, provider, terms_version, privacy_version,
     agreed_to_terms, agreed_to_privacy, acknowledged_public_surface)
     values ('00000000-0000-4000-8000-00000000000c', '11111111-1111-4111-8111-111111111111', 'google', 'v', 'v', true, true, true)$q$);
select public.test_expect_denied('anon select account_consents', 'select * from public.account_consents');
reset role;

-- The service role (API) appends; it cannot update or delete.
set role service_role;
insert into public.account_consents(user_id, identity_id, provider, terms_version, privacy_version,
  agreed_to_terms, agreed_to_privacy, acknowledged_public_surface, consented_at)
values ('00000000-0000-4000-8000-00000000000c', '11111111-1111-4111-8111-111111111111', 'google',
  '2026-04-17', '2026-04-17', true, true, true, now());
select public.test_expect_denied('service_role update account_consents',
  'update public.account_consents set terms_version = ''x''');
select public.test_expect_denied('service_role delete account_consents',
  'delete from public.account_consents');
select public.test_expect_denied('consent row with a false flag',
  $q$insert into public.account_consents(user_id, identity_id, provider, terms_version, privacy_version,
     agreed_to_terms, agreed_to_privacy, acknowledged_public_surface)
     values ('00000000-0000-4000-8000-00000000000c', '11111111-1111-4111-8111-111111111111', 'google', 'v', 'v', true, false, true)$q$);
select public.test_expect_denied('consent row with another provider',
  $q$insert into public.account_consents(user_id, identity_id, provider, terms_version, privacy_version,
     agreed_to_terms, agreed_to_privacy, acknowledged_public_surface)
     values ('00000000-0000-4000-8000-00000000000c', '11111111-1111-4111-8111-111111111111', 'email', 'v', 'v', true, true, true)$q$);
reset role;

-- Even the owner cannot UPDATE (trigger); FK cascade still removes rows.
do $$ begin
  begin
    update public.account_consents set terms_version = 'x';
    raise exception 'FAIL: owner update allowed';
  exception when insufficient_privilege then null;
  end;
end $$;

set role authenticated;
select public.test_as('00000000-0000-4000-8000-00000000000c', '{"provider":"email","providers":["email","google"],"google_consent_identity_id":"x"}');
do $$ begin
  if (select count(*) from public.account_consents) <> 1 then
    raise exception 'FAIL: owner cannot read own consent row';
  end if;
end $$;
select public.test_as('00000000-0000-4000-8000-00000000000e', '{"provider":"email","providers":["email"]}');
do $$ begin
  if (select count(*) from public.account_consents) <> 0 then
    raise exception 'FAIL: another user can read the consent row';
  end if;
end $$;
reset role;

-- Hook function: Google sign-up refused, email sign-up passes.
do $$
declare r jsonb;
begin
  r := public.hook_before_user_created_block_google(
    '{"metadata":{"name":"before-user-created"},"user":{"app_metadata":{"provider":"google","providers":["google"]}}}');
  if (r -> 'error' ->> 'http_code')::int <> 403 or coalesce(r -> 'error' ->> 'message', '') = '' then
    raise exception 'FAIL: google sign-up not refused: %', r;
  end if;
  r := public.hook_before_user_created_block_google(
    '{"user":{"app_metadata":{"provider":"email","providers":["email","google"]}}}');
  if (r ? 'error') is not true then raise exception 'FAIL: providers containing google not refused'; end if;
  r := public.hook_before_user_created_block_google(
    '{"user":{"app_metadata":{"provider":"email","providers":["email"]}}}');
  if r <> '{}'::jsonb then raise exception 'FAIL: email sign-up refused: %', r; end if;
  r := public.hook_before_user_created_block_google('{"user":{}}');
  if r <> '{}'::jsonb then raise exception 'FAIL: missing app_metadata refused: %', r; end if;
end $$;

do $$ begin
  if not has_function_privilege('supabase_auth_admin', 'public.hook_before_user_created_block_google(jsonb)', 'EXECUTE')
    then raise exception 'FAIL: supabase_auth_admin cannot execute the hook'; end if;
  if has_function_privilege('authenticated', 'public.hook_before_user_created_block_google(jsonb)', 'EXECUTE')
    or has_function_privilege('anon', 'public.hook_before_user_created_block_google(jsonb)', 'EXECUTE')
    or has_function_privilege('service_role', 'public.hook_before_user_created_block_google(jsonb)', 'EXECUTE')
    then raise exception 'FAIL: hook is executable by authenticated/anon/service_role'; end if;
  -- lock_timeout is SET LOCAL: it must not leak past the migration.
  if current_setting('lock_timeout') <> '0' then
    raise exception 'FAIL: lock_timeout leaked out of the migration: %', current_setting('lock_timeout');
  end if;
  if has_table_privilege('authenticated', 'public.account_consents', 'INSERT')
    or has_table_privilege('authenticated', 'public.account_consents', 'UPDATE')
    or has_table_privilege('authenticated', 'public.account_consents', 'DELETE')
    or has_table_privilege('anon', 'public.account_consents', 'SELECT')
    then raise exception 'FAIL: account_consents grants too wide'; end if;
end $$;

set role supabase_auth_admin;
select public.hook_before_user_created_block_google('{"user":{"app_metadata":{"provider":"email","providers":["email"]}}}');
reset role;

-- FK cascade on hard delete of the auth user.
delete from public.users where id = '00000000-0000-4000-8000-00000000000c';
delete from auth.users where id = '00000000-0000-4000-8000-00000000000c';
do $$ begin
  if (select count(*) from public.account_consents) <> 0 then
    raise exception 'FAIL: consent rows survive the auth user hard delete';
  end if;
end $$;

-- Rollback: the original PERMISSIVE policies alone apply again.
\i scripts/issue142-google-consent/rollback.sql
do $$ begin
  if exists (select 1 from pg_policies where policyname like 'issue142_%') then
    raise exception 'FAIL: rollback left issue142 policies';
  end if;
  -- 17 production PERMISSIVE write policies in the fixture.
  if (select count(*) from pg_policies where schemaname = 'public' and permissive = 'PERMISSIVE'
      and policyname not like 'fixture_%' and tablename <> 'account_consents') <> 17 then
    raise exception 'FAIL: rollback changed the original policies';
  end if;
end $$;
set role authenticated;
select public.test_as('00000000-0000-4000-8000-00000000000a', '{"provider":"email","providers":["email","google"]}');
select public.test_cycle('google without consent after rollback', true);
reset role;

\echo PASS: issue142 consent RLS (email unaffected, unconsented Google blocked, consented Google allowed), append-only account_consents, hook function, rollback
