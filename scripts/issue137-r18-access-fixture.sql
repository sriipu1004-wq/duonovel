\set ON_ERROR_STOP on
-- Issue #137: disposable PostgreSQL 17 SQL fixture, synthetic test data ONLY.
-- NEVER run against Supabase, any Production DB, or a real user's data.
-- The baseline deliberately models a publication-only RLS policy. Its
-- anonymous R18-body exposure is an EXPECTED INSECURE POSITIVE CONTROL.
-- The second phase models one POSSIBLE stricter DB-side policy, NOT a
-- product decision, deployed fix, Supabase migration, or signed-in E2E.
-- request.jwt.claim.sub below is a TRUSTED-GATEWAY MOCK set by the test
-- superuser. This DOES NOT verify JWT signatures or actual PostgREST Auth.
--
-- Namespaces are isolated to avoid borrowing any live migration objects.
CREATE ROLE issue137_anon NOLOGIN;
CREATE ROLE issue137_authenticated NOLOGIN;
CREATE ROLE issue137_policy_owner NOLOGIN;
CREATE SCHEMA issue137_r18;
CREATE SCHEMA issue137_private AUTHORIZATION issue137_policy_owner;
REVOKE ALL ON SCHEMA issue137_private FROM PUBLIC;
GRANT USAGE ON SCHEMA issue137_r18 TO issue137_anon, issue137_authenticated;

CREATE TABLE issue137_r18.series (
  id integer PRIMARY KEY,
  owner_id text NOT NULL,
  publication_status text NOT NULL,
  content_rating text NOT NULL,
  content_warnings text[] NOT NULL DEFAULT '{}'::text[]
);
CREATE TABLE issue137_r18.episodes (
  id integer PRIMARY KEY,
  series_id integer NOT NULL REFERENCES issue137_r18.series(id),
  posting_status text NOT NULL,
  is_published boolean NOT NULL,
  body text NOT NULL
);
CREATE TABLE issue137_private.profiles (
  id text PRIMARY KEY,
  age_confirmed boolean NOT NULL,
  show_r18_content boolean NOT NULL
);
ALTER TABLE issue137_private.profiles OWNER TO issue137_policy_owner;

-- Includes rating-only and warning-only R18: warning must be authoritative.
INSERT INTO issue137_r18.series(id,owner_id,publication_status,content_rating,content_warnings) VALUES
  (1,'series-owner','public','general','{}'),
  (2,'series-owner','public','r18','{}'),
  (3,'series-owner','public','general',ARRAY['sexual_r18']),
  (4,'series-owner','private','general','{}'),
  (5,'series-owner','public','general','{}'),
  (6,'series-owner','public','general','{}'),
  (7,'series-owner','private','r18','{}');
INSERT INTO issue137_r18.episodes(id,series_id,posting_status,is_published,body) VALUES
  (1,1,'posted',true,'SECRET-1'),
  (2,2,'posted',true,'SECRET-2'),
  (3,3,'posted',true,'SECRET-3'),
  (4,4,'posted',true,'SECRET-4'),
  (5,5,'draft',false,'SECRET-5'),
  (6,6,'posted',false,'SECRET-6'),
  (7,7,'posted',true,'SECRET-7');
INSERT INTO issue137_private.profiles(id,age_confirmed,show_r18_content) VALUES
  ('viewer-unconfirmed',false,true),
  ('viewer-off',true,false),
  ('viewer-on',true,true),
  ('series-owner',true,true);

-- Do not grant profile-table SELECT to either public role. The function is
-- owned by a minimally-scoped test role rather than a superuser.
SET ROLE issue137_policy_owner;
CREATE FUNCTION issue137_private.allowed_r18()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,issue137_private
AS $$
  SELECT EXISTS (
    SELECT 1 FROM issue137_private.profiles p
    WHERE p.id = NULLIF(current_setting('request.jwt.claim.sub',true),'')
      AND p.age_confirmed IS TRUE
      AND p.show_r18_content IS TRUE
  );
$$;
RESET ROLE;
REVOKE ALL ON FUNCTION issue137_private.allowed_r18() FROM PUBLIC;
GRANT USAGE ON SCHEMA issue137_private TO issue137_anon, issue137_authenticated;
GRANT EXECUTE ON FUNCTION issue137_private.allowed_r18() TO issue137_anon, issue137_authenticated;
GRANT SELECT ON issue137_r18.series,issue137_r18.episodes TO issue137_anon,issue137_authenticated;
ALTER TABLE issue137_r18.series ENABLE ROW LEVEL SECURITY;
ALTER TABLE issue137_r18.episodes ENABLE ROW LEVEL SECURITY;
-- Reject any accidental table mutation capability by API-like roles.
DO $$ BEGIN
  IF has_table_privilege('issue137_anon','issue137_r18.episodes','UPDATE') OR
     has_table_privilege('issue137_authenticated','issue137_r18.episodes','UPDATE') OR
     has_table_privilege('issue137_anon','issue137_private.profiles','SELECT') OR
     has_table_privilege('issue137_authenticated','issue137_private.profiles','SELECT')
  THEN RAISE EXCEPTION 'FAIL ordinary roles can edit episodes or read profiles'; END IF;
END $$;

-- Baseline: mirrors the MATERIAL issue that a publication gate alone does
-- not encode self-attested age + R18 ON in PostgreSQL row visibility.
CREATE POLICY baseline_series_select ON issue137_r18.series
FOR SELECT TO issue137_anon,issue137_authenticated
USING (
  publication_status='public'
  OR (current_user='issue137_authenticated'
      AND owner_id=NULLIF(current_setting('request.jwt.claim.sub',true),''))
);
CREATE POLICY public_episode_select ON issue137_r18.episodes
FOR SELECT TO issue137_anon,issue137_authenticated
USING (
  posting_status='posted' AND is_published IS TRUE
  AND EXISTS (
    SELECT 1 FROM issue137_r18.series s
    WHERE s.id=issue137_r18.episodes.series_id
  )
);

-- Invoker assertions select the BODY COLUMN, so these checks cover the
-- raw Data API-like result boundary, not just a user-interface card count.
CREATE FUNCTION issue137_r18.assert_body_ids(
  expected integer[], label text
) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog
AS $$
DECLARE actual integer[];
BEGIN
  SELECT COALESCE(array_agg(e.id ORDER BY e.id),'{}'::integer[])
    INTO actual FROM issue137_r18.episodes e
   WHERE e.body LIKE 'SECRET-%';
  IF actual IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'FAIL %: expected %, got %',label,expected,actual;
  END IF;
  RAISE NOTICE 'PASS %: visible synthetic episode bodies %',label,actual;
END;
$$;
GRANT EXECUTE ON FUNCTION issue137_r18.assert_body_ids(integer[],text)
TO issue137_anon,issue137_authenticated;

-- Baseline: demonstrate why app-level viewer masking alone does NOT stop
-- a browser-direct Data API request for a public R18 episode body.
SELECT set_config('request.jwt.claim.sub','',false);
SET ROLE issue137_anon;
SELECT issue137_r18.assert_body_ids(ARRAY[1,2,3]::integer[],
  'baseline anon sees general + rating-R18 + warning-R18');
RESET ROLE;

SELECT set_config('request.jwt.claim.sub','viewer-unconfirmed',false);
SET ROLE issue137_authenticated;
SELECT issue137_r18.assert_body_ids(ARRAY[1,2,3]::integer[],
  'baseline unconfirmed sees both public R18 bodies');
RESET ROLE;

-- Replace only the synthetic policy with a hypothetical stronger RLS
-- contract: require (ageConfirmed && R18 ON) for rating or sexual warning.
-- This DROP/CREATE is confined to disposable issue137_r18 tables.
DROP POLICY baseline_series_select ON issue137_r18.series;
CREATE POLICY strict_series_select ON issue137_r18.series
FOR SELECT TO issue137_anon,issue137_authenticated
USING (
  (
    publication_status='public'
    OR (current_user='issue137_authenticated'
      AND owner_id=NULLIF(current_setting('request.jwt.claim.sub',true),''))
  )
  AND (
    (
      content_rating <> 'r18'
      AND NOT ('sexual_r18'=ANY(content_warnings))
    )
    OR (
      current_user='issue137_authenticated'
      AND issue137_private.allowed_r18()
    )
  )
);

SELECT set_config('request.jwt.claim.sub','',false);
SET ROLE issue137_anon;
SELECT issue137_r18.assert_body_ids(ARRAY[1]::integer[],
  'strict anon denied both public R18 bodies + all private/draft');
RESET ROLE;

SELECT set_config('request.jwt.claim.sub','viewer-unconfirmed',false);
SET ROLE issue137_authenticated;
SELECT issue137_r18.assert_body_ids(ARRAY[1]::integer[],
  'strict signed-in unconfirmed with ON denied R18');
RESET ROLE;

SELECT set_config('request.jwt.claim.sub','viewer-off',false);
SET ROLE issue137_authenticated;
SELECT issue137_r18.assert_body_ids(ARRAY[1]::integer[],
  'strict age-confirmed OFF denied R18');
RESET ROLE;

SELECT set_config('request.jwt.claim.sub','viewer-on',false);
SET ROLE issue137_authenticated;
SELECT issue137_r18.assert_body_ids(ARRAY[1,2,3]::integer[],
  'strict age-confirmed ON allowed public rating and warning R18');
RESET ROLE;

SELECT set_config('request.jwt.claim.sub','series-owner',false);
SET ROLE issue137_authenticated;
SELECT issue137_r18.assert_body_ids(ARRAY[1,2,3,4,7]::integer[],
  'strict owner age-confirmed ON sees own private general and R18');
RESET ROLE;

-- Owner ownership never bypasses the hypothetical stricter R18 gate.
UPDATE issue137_private.profiles
SET show_r18_content=false WHERE id='series-owner';
SET ROLE issue137_authenticated;
SELECT issue137_r18.assert_body_ids(ARRAY[1,4]::integer[],
  'strict owner OFF retains own private general but not any R18');
RESET ROLE;
UPDATE issue137_private.profiles
SET show_r18_content=true WHERE id='series-owner';

-- Missing/malformed profile and untrusted source state fail closed.
SELECT set_config('request.jwt.claim.sub','unknown-user',false);
SET ROLE issue137_authenticated;
SELECT issue137_r18.assert_body_ids(ARRAY[1]::integer[],
  'strict unknown user preference denies R18');
RESET ROLE;

-- Mutations to public status and episode publication must take effect in
-- direct body SELECT, including for opted-in viewers (no app cache involved).
UPDATE issue137_r18.series SET publication_status='private' WHERE id=2;
SELECT set_config('request.jwt.claim.sub','viewer-on',false);
SET ROLE issue137_authenticated;
SELECT issue137_r18.assert_body_ids(ARRAY[1,3]::integer[],
  'strict opt-in viewer cannot read newly private R18 series');
RESET ROLE;

UPDATE issue137_r18.series SET publication_status='public' WHERE id=2;
UPDATE issue137_r18.episodes SET is_published=false WHERE id=3;
SET ROLE issue137_authenticated;
SELECT issue137_r18.assert_body_ids(ARRAY[1,2]::integer[],
  'strict opt-in viewer cannot read newly unpublished warning-R18 episode');
RESET ROLE;

SELECT 'PASS: isolated PG17 publication-only negative control and strict R18 role/row visibility matrix' AS result;
