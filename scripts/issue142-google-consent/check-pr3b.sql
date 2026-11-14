-- Issue #142 PR3b: apply the PR3 and PR3b migrations to a disposable
-- PostgreSQL and assert (CI service container only; never the hosted project).
--   psql -X -v ON_ERROR_STOP=1 -f scripts/issue142-google-consent/check-pr3b.sql
--
-- What is checked:
-- - consent is bound to the CURRENT Google identity in auth.identities
--   (re-link => blocked again), and needs both the app_metadata key in
--   auth.users and an account_consents row for that identity;
-- - the JWT is not trusted: stale JWTs (no "google", or an old consent key)
--   change nothing in either direction;
-- - email-only users and anon are unaffected;
-- - storage.objects INSERT / UPDATE in "illustrations" follow the same rule,
--   other buckets are unaffected;
-- - SECURITY DEFINER, empty search_path, no PUBLIC execute, callers cannot
--   read auth.identities / auth.users directly;
-- - the function runs once per statement (InitPlan), not once per row;
-- - rollback-pr3b.sql restores the PR3 behaviour.
\set ON_ERROR_STOP on
\i scripts/issue142-google-consent/fixture.sql

-- Seed rows for every test user (as owner, before the migrations).
create table public.test_seed (uid uuid primary key, series_id uuid, episode_id uuid,
  comment_id uuid, review_id uuid, entry_id uuid, target_id uuid, profile_id uuid,
  object_id uuid, other_object_id uuid);
grant select on public.test_seed to anon, authenticated, service_role;
do $$
declare u uuid; s uuid; e uuid; c uuid; r uuid; g uuid; t uuid; p uuid; o uuid; oo uuid;
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
    insert into storage.objects(bucket_id, name, owner_id)
      values ('illustrations', format('effects/%s/%s/seed.png', s, e), u::text) returning id into o;
    insert into storage.objects(bucket_id, name, owner_id)
      values ('fixture-other', format('%s/seed.bin', u), u::text) returning id into oo;
    insert into public.test_seed values (u, s, e, c, r, g, t, p, o, oo);
  end loop;
end $$;

-- Identities and server-recorded consent (production shapes).
--   e: email only (no Google identity)
--   a: Google identity, no consent
--   c: Google identity, consent recorded (app_metadata key + row)
--   d: Google identity, blank consent key, no row
--   b: consented Google identity G1, then a newer Google identity G2 linked
--   1: app_metadata key for its Google identity, but no account_consents row
--   2: account_consents row for its Google identity, but no app_metadata key
insert into auth.identities (id, user_id, provider, created_at) values
  ('e0000000-0000-4000-8000-00000000000e', '00000000-0000-4000-8000-00000000000e', 'email',  '2026-01-01T00:00:00Z'),
  ('a0000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000a', 'email',  '2026-01-01T00:00:00Z'),
  ('a1111111-1111-4111-8111-11111111111a', '00000000-0000-4000-8000-00000000000a', 'google', '2026-02-01T00:00:00Z'),
  ('c0000000-0000-4000-8000-00000000000c', '00000000-0000-4000-8000-00000000000c', 'email',  '2026-01-01T00:00:00Z'),
  ('c1111111-1111-4111-8111-11111111111c', '00000000-0000-4000-8000-00000000000c', 'google', '2026-02-01T00:00:00Z'),
  ('d1111111-1111-4111-8111-11111111111d', '00000000-0000-4000-8000-00000000000d', 'google', '2026-02-01T00:00:00Z'),
  ('b0000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-00000000000b', 'email',  '2026-01-01T00:00:00Z'),
  ('b1111111-1111-4111-8111-11111111111b', '00000000-0000-4000-8000-00000000000b', 'google', '2026-02-01T00:00:00Z'),
  ('b2222222-2222-4222-8222-22222222222b', '00000000-0000-4000-8000-00000000000b', 'google', '2026-03-01T00:00:00Z'),
  ('11111111-1111-4111-8111-111111111101', '00000000-0000-4000-8000-000000000001', 'google', '2026-02-01T00:00:00Z'),
  ('11111111-1111-4111-8111-111111111102', '00000000-0000-4000-8000-000000000002', 'google', '2026-02-01T00:00:00Z');

update auth.users set raw_app_meta_data = case id
  when '00000000-0000-4000-8000-00000000000e' then '{"provider":"email","providers":["email"]}'::jsonb
  when '00000000-0000-4000-8000-00000000000a' then '{"provider":"email","providers":["email","google"]}'::jsonb
  when '00000000-0000-4000-8000-00000000000c' then '{"provider":"email","providers":["email","google"],"google_consent_identity_id":"c1111111-1111-4111-8111-11111111111c"}'::jsonb
  when '00000000-0000-4000-8000-00000000000d' then '{"provider":"google","providers":["google"],"google_consent_identity_id":"  "}'::jsonb
  when '00000000-0000-4000-8000-00000000000b' then '{"provider":"email","providers":["email","google"],"google_consent_identity_id":"b1111111-1111-4111-8111-11111111111b"}'::jsonb
  when '00000000-0000-4000-8000-000000000001' then '{"provider":"google","providers":["google"],"google_consent_identity_id":"11111111-1111-4111-8111-111111111101"}'::jsonb
  when '00000000-0000-4000-8000-000000000002' then '{"provider":"google","providers":["google"]}'::jsonb
end;

-- PR3 (already in production), then PR3b twice (must be idempotent).
\i supabase/migrations/20261115120000_issue142_google_consent_rls.sql
\i supabase/migrations/20261115180000_issue142_pr3b_identity_bound_consent.sql
\i supabase/migrations/20261115180000_issue142_pr3b_identity_bound_consent.sql

-- Consent rows (service role path), after PR3 created the table.
insert into public.account_consents(user_id, identity_id, provider, terms_version, privacy_version,
  agreed_to_terms, agreed_to_privacy, acknowledged_public_surface) values
  ('00000000-0000-4000-8000-00000000000c', 'c1111111-1111-4111-8111-11111111111c', 'google', '2026-04-17', '2026-04-17', true, true, true),
  ('00000000-0000-4000-8000-00000000000b', 'b1111111-1111-4111-8111-11111111111b', 'google', '2026-04-17', '2026-04-17', true, true, true),
  ('00000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111102', 'google', '2026-04-17', '2026-04-17', true, true, true);

-- One full write cycle as the current claims: the 8 PR3 tables plus
-- storage. allowed=true: inserts succeed, updates touch exactly one row.
-- allowed=false: inserts refused, updates touch no row. The "fixture-other"
-- bucket is always writable (PR3b must not affect other buckets).
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
    format('insert into public.series_translation_profiles(series_id, target_language, updated_by_user_id) values (%L, %L, %L)', seed.series_id, 'ko', u),
    format('insert into storage.objects(bucket_id, name, owner_id) values (%L, %L, %L)',
      'illustrations', format('effects/%s/%s/%s.png', seed.series_id, seed.series_id, gen_random_uuid()), u::text)
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
    format('update public.users set display_name = %L where id = %L', 'renamed', u),
    format('update storage.objects set metadata = %L where id = %L', '{"v":1}', seed.object_id)
  ];
  foreach stmt in array statements loop
    n := public.test_rowcount(stmt);
    if n <> (case when allowed then 1 else 0 end) then
      raise exception 'FAIL: % update touched % rows: %', label, n, stmt;
    end if;
  end loop;

  -- Other buckets: unaffected either way.
  execute format('insert into storage.objects(bucket_id, name, owner_id) values (%L, %L, %L)',
    'fixture-other', format('%s/%s.bin', u, gen_random_uuid()), u::text);
  n := public.test_rowcount(format('update storage.objects set metadata = %L where id = %L', '{"v":2}', seed.other_object_id));
  if n <> 1 then
    raise exception 'FAIL: % other bucket update touched % rows', label, n;
  end if;
  raise notice 'ok cycle: % (allowed=%)', label, allowed;
end $$;
grant execute on function public.test_cycle(text, boolean) to authenticated;

set role authenticated;

-- Email-only user.
select public.test_as('00000000-0000-4000-8000-00000000000e', '{"provider":"email","providers":["email"]}');
select public.test_cycle('email user', true);
select public.test_as('00000000-0000-4000-8000-00000000000e', '{}');
select public.test_cycle('email user, no app_metadata', true);
-- A forged JWT that claims Google does not block an email-only user either
-- (the JWT is no longer read).
select public.test_as('00000000-0000-4000-8000-00000000000e', '{"provider":"google","providers":["google"]}');
select public.test_cycle('email user, JWT claims google', true);

-- Google, no consent: blocked whatever the JWT says.
select public.test_as('00000000-0000-4000-8000-00000000000a', '{"provider":"email","providers":["email","google"]}');
select public.test_cycle('google without consent', false);
select public.test_as('00000000-0000-4000-8000-00000000000a', '{"provider":"email","providers":["email"]}');
select public.test_cycle('google without consent, stale JWT without google', false);
select public.test_as('00000000-0000-4000-8000-00000000000a',
  '{"provider":"email","providers":["email","google"],"google_consent_identity_id":"a1111111-1111-4111-8111-11111111111a"}');
select public.test_cycle('google without consent, forged JWT consent key', false);

-- Blank consent key.
select public.test_as('00000000-0000-4000-8000-00000000000d', '{"provider":"google","providers":["google"]}');
select public.test_cycle('google, blank consent key', false);

-- Re-linked: consent for G1, newer G2 now current (review S2-1).
select public.test_as('00000000-0000-4000-8000-00000000000b',
  '{"provider":"email","providers":["email","google"],"google_consent_identity_id":"b1111111-1111-4111-8111-11111111111b"}');
select public.test_cycle('google re-linked after consent', false);

-- Key without row, row without key.
select public.test_as('00000000-0000-4000-8000-000000000001',
  '{"provider":"google","providers":["google"],"google_consent_identity_id":"11111111-1111-4111-8111-111111111101"}');
select public.test_cycle('app_metadata key without consent row', false);
select public.test_as('00000000-0000-4000-8000-000000000002', '{"provider":"google","providers":["google"]}');
select public.test_cycle('consent row without app_metadata key', false);

-- Consented for the current identity: allowed, even with a stale JWT.
select public.test_as('00000000-0000-4000-8000-00000000000c',
  '{"provider":"email","providers":["email","google"],"google_consent_identity_id":"c1111111-1111-4111-8111-11111111111c"}');
select public.test_cycle('google with consent', true);
select public.test_as('00000000-0000-4000-8000-00000000000c', '{"provider":"email","providers":["email"]}');
select public.test_cycle('google with consent, stale JWT', true);

-- Callers cannot read the auth tables themselves.
select public.test_expect_denied('authenticated select auth.identities', 'select * from auth.identities');
select public.test_expect_denied('authenticated select auth.users', 'select * from auth.users');
reset role;

-- After unlinking Google (identity row gone) the user is not a Google user.
delete from auth.identities where id = 'a1111111-1111-4111-8111-11111111111a';
set role authenticated;
select public.test_as('00000000-0000-4000-8000-00000000000a', '{"provider":"email","providers":["email","google"]}');
select public.test_cycle('google unlinked', true);
reset role;
-- Re-linked user b recovers once STEP 2 records consent for G2.
insert into public.account_consents(user_id, identity_id, provider, terms_version, privacy_version,
  agreed_to_terms, agreed_to_privacy, acknowledged_public_surface) values
  ('00000000-0000-4000-8000-00000000000b', 'b2222222-2222-4222-8222-22222222222b', 'google', '2026-04-17', '2026-04-17', true, true, true);
update auth.users set raw_app_meta_data = raw_app_meta_data || '{"google_consent_identity_id":"b2222222-2222-4222-8222-22222222222b"}'
  where id = '00000000-0000-4000-8000-00000000000b';
set role authenticated;
select public.test_as('00000000-0000-4000-8000-00000000000b', '{"provider":"email","providers":["email","google"]}');
select public.test_cycle('google re-linked, consent for current identity', true);
reset role;

-- anon: the function says true (no uid), and anon still has no write path.
set role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', false);
do $$ begin
  if public.account_google_consent_satisfied() is not true then
    raise exception 'FAIL: anon is not neutral';
  end if;
end $$;
select public.test_expect_denied('anon insert illustrations',
  $q$insert into storage.objects(bucket_id, name, owner_id) values ('illustrations', 'effects/x/x/x.png', null)$q$);
reset role;

-- Function shape and privileges.
do $$
declare f record;
begin
  select p.prosecdef, p.proconfig, p.provolatile, pg_get_userbyid(p.proowner) as owner, p.proacl
    into f from pg_proc p where p.oid = 'public.account_google_consent_satisfied()'::regprocedure;
  if not f.prosecdef then raise exception 'FAIL: not SECURITY DEFINER'; end if;
  if f.proconfig is distinct from array['search_path=""'] then
    raise exception 'FAIL: search_path not pinned: %', f.proconfig;
  end if;
  if f.provolatile <> 's' then raise exception 'FAIL: not STABLE'; end if;
  if exists (select 1 from aclexplode(f.proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE') then
    raise exception 'FAIL: PUBLIC can execute';
  end if;
  if not has_function_privilege('authenticated', 'public.account_google_consent_satisfied()', 'EXECUTE')
    or not has_function_privilege('anon', 'public.account_google_consent_satisfied()', 'EXECUTE') then
    raise exception 'FAIL: callers of the policies cannot execute the function';
  end if;
  if (select count(*) from pg_policies where policyname like 'issue142_%' and schemaname = 'public') <> 15 then
    raise exception 'FAIL: PR3 policies changed';
  end if;
  if (select count(*) from pg_policies where schemaname = 'storage'
      and policyname in ('issue142_google_consent_illustrations_insert', 'issue142_google_consent_illustrations_update')
      and permissive = 'RESTRICTIVE' and roles = '{authenticated}') <> 2 then
    raise exception 'FAIL: storage policies missing or not RESTRICTIVE';
  end if;
  -- The production storage policies are unchanged (4 illustrations + fixture).
  if (select count(*) from pg_policies where schemaname = 'storage' and permissive = 'PERMISSIVE') <> 5 then
    raise exception 'FAIL: storage PERMISSIVE policies changed';
  end if;
  if current_setting('lock_timeout') <> '0' then
    raise exception 'FAIL: lock_timeout leaked out of the migration';
  end if;
end $$;

-- Once per statement: updating 1 row and 6 rows calls the function the same
-- number of times (InitPlan), measured in the current transaction.
insert into public.series(author_id)
  select '00000000-0000-4000-8000-00000000000c' from generate_series(1, 5);
begin;
-- track_functions is superuser-only: set it before switching role.
set local track_functions = 'all';
set local role authenticated;
select public.test_as('00000000-0000-4000-8000-00000000000c', '{"provider":"email","providers":["email","google"]}');
do $$
declare
  fn oid := 'public.account_google_consent_satisfied()'::regprocedure;
  before bigint; one bigint; many bigint; rows_one int; rows_many int;
begin
  before := coalesce(pg_stat_get_xact_function_calls(fn), 0);
  update public.series set publication_status = 'public'
    where id = (select series_id from public.test_seed where uid = auth.uid());
  get diagnostics rows_one = row_count;
  one := coalesce(pg_stat_get_xact_function_calls(fn), 0) - before;
  before := coalesce(pg_stat_get_xact_function_calls(fn), 0);
  update public.series set publication_status = 'public' where author_id = auth.uid();
  get diagnostics rows_many = row_count;
  many := coalesce(pg_stat_get_xact_function_calls(fn), 0) - before;
  if rows_one <> 1 or rows_many < 6 then
    raise exception 'FAIL: unexpected row counts % / %', rows_one, rows_many;
  end if;
  if one = 0 or many <> one then
    raise exception 'FAIL: function calls depend on row count (1 row: %, % rows: %)', one, rows_many, many;
  end if;
  raise notice 'ok once per statement: % call(s) for 1 row and for % rows', one, rows_many;
end $$;
commit;
reset role;

-- Rollback: PR3 behaviour (JWT-based) comes back, storage policies go.
\i scripts/issue142-google-consent/rollback-pr3b.sql
do $$ begin
  if exists (select 1 from pg_policies where policyname like 'issue142_google_consent_illustrations_%') then
    raise exception 'FAIL: rollback left storage policies';
  end if;
  if (select prosecdef from pg_proc where oid = 'public.account_google_consent_satisfied()'::regprocedure) then
    raise exception 'FAIL: rollback left SECURITY DEFINER';
  end if;
  if (select count(*) from pg_policies where policyname like 'issue142_%') <> 15 then
    raise exception 'FAIL: rollback touched the PR3 policies';
  end if;
end $$;
set role authenticated;
-- PR3 semantics: JWT with google and no key => blocked on the PR3 tables.
select public.test_as('00000000-0000-4000-8000-000000000001', '{"provider":"google","providers":["google"]}');
select public.test_expect_denied('after rollback: JWT google without key',
  format('insert into public.series(author_id) values (%L)', auth.uid()));
-- ... and storage is no longer guarded.
select public.test_rowcount(format('insert into storage.objects(bucket_id, name, owner_id) values (%L, %L, %L)',
  'illustrations', format('effects/%s/%s/after-rollback.png', s.series_id, s.series_id), auth.uid()::text))
  from public.test_seed s where s.uid = auth.uid();
reset role;

\echo PASS: issue142 PR3b identity-bound consent (re-link blocked, stale JWT ignored, key+row required), illustrations storage guard, once per statement, rollback
