\set ON_ERROR_STOP on
-- Issue #137: EPHEMERAL PostgreSQL 17 fixture ONLY. Never point this at Supabase.
-- Deliberately synthetic identities/works. No production migrations or secrets.
CREATE ROLE catalog_anon NOLOGIN;
CREATE ROLE catalog_epoch_owner NOLOGIN;
CREATE SCHEMA catalog_test;
CREATE SCHEMA catalog_internal;
REVOKE ALL ON SCHEMA catalog_internal FROM PUBLIC;
GRANT USAGE ON SCHEMA catalog_internal TO catalog_epoch_owner;

CREATE TABLE catalog_internal.generation (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  value bigint NOT NULL DEFAULT 0 CHECK (value >= 0)
);
INSERT INTO catalog_internal.generation(singleton, value) VALUES (true, 0);
REVOKE ALL ON catalog_internal.generation FROM PUBLIC;
GRANT SELECT, UPDATE ON catalog_internal.generation TO catalog_epoch_owner;

CREATE TABLE catalog_test.users (
  id integer PRIMARY KEY,
  display_name text NOT NULL,
  show_r18_content boolean NOT NULL DEFAULT false
);
CREATE TABLE catalog_test.series (
  id integer PRIMARY KEY,
  author_id integer NOT NULL REFERENCES catalog_test.users(id),
  title text NOT NULL,
  publication_status text NOT NULL DEFAULT 'private',
  content_rating text NOT NULL DEFAULT 'general',
  content_warnings text[] NOT NULL DEFAULT '{}',
  source_language text NOT NULL DEFAULT 'ja',
  rights jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE catalog_test.episodes (
  id integer PRIMARY KEY,
  series_id integer NOT NULL REFERENCES catalog_test.series(id) ON DELETE CASCADE,
  posting_status text NOT NULL DEFAULT 'draft',
  is_published boolean NOT NULL DEFAULT false,
  episode_number integer NOT NULL,
  posted_at timestamptz
);

CREATE FUNCTION catalog_internal.bump_generation()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  UPDATE catalog_internal.generation
     SET value = value + 1
   WHERE singleton = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Missing catalog generation singleton';
  END IF;
  RETURN NULL;
END;
$$;
-- Unlike a superuser-owned production function, this definer has ONLY the
-- minimum private-generation read/write privileges, no app-table write rights.
ALTER FUNCTION catalog_internal.bump_generation() OWNER TO catalog_epoch_owner;
REVOKE ALL ON FUNCTION catalog_internal.bump_generation() FROM PUBLIC;

CREATE TRIGGER series_insert_delete
AFTER INSERT OR DELETE ON catalog_test.series
FOR EACH ROW EXECUTE FUNCTION catalog_internal.bump_generation();
CREATE TRIGGER series_update
AFTER UPDATE ON catalog_test.series
FOR EACH ROW
WHEN (
  OLD.author_id IS DISTINCT FROM NEW.author_id OR
  OLD.title IS DISTINCT FROM NEW.title OR
  OLD.publication_status IS DISTINCT FROM NEW.publication_status OR
  OLD.content_rating IS DISTINCT FROM NEW.content_rating OR
  OLD.content_warnings IS DISTINCT FROM NEW.content_warnings OR
  OLD.source_language IS DISTINCT FROM NEW.source_language OR
  OLD.rights IS DISTINCT FROM NEW.rights
)
EXECUTE FUNCTION catalog_internal.bump_generation();
CREATE TRIGGER series_truncate AFTER TRUNCATE ON catalog_test.series
FOR EACH STATEMENT EXECUTE FUNCTION catalog_internal.bump_generation();

CREATE TRIGGER episodes_insert_delete
AFTER INSERT OR DELETE ON catalog_test.episodes
FOR EACH ROW EXECUTE FUNCTION catalog_internal.bump_generation();
CREATE TRIGGER episodes_update
AFTER UPDATE ON catalog_test.episodes
FOR EACH ROW WHEN (
  OLD.series_id IS DISTINCT FROM NEW.series_id OR
  OLD.posting_status IS DISTINCT FROM NEW.posting_status OR
  OLD.is_published IS DISTINCT FROM NEW.is_published OR
  OLD.episode_number IS DISTINCT FROM NEW.episode_number OR
  OLD.posted_at IS DISTINCT FROM NEW.posted_at
)
EXECUTE FUNCTION catalog_internal.bump_generation();
CREATE TRIGGER episodes_truncate AFTER TRUNCATE ON catalog_test.episodes
FOR EACH STATEMENT EXECUTE FUNCTION catalog_internal.bump_generation();

CREATE TRIGGER users_insert_delete
AFTER INSERT OR DELETE ON catalog_test.users
FOR EACH ROW EXECUTE FUNCTION catalog_internal.bump_generation();
CREATE TRIGGER users_update
AFTER UPDATE ON catalog_test.users
FOR EACH ROW WHEN (OLD.display_name IS DISTINCT FROM NEW.display_name)
EXECUTE FUNCTION catalog_internal.bump_generation();
CREATE TRIGGER users_truncate AFTER TRUNCATE ON catalog_test.users
FOR EACH STATEMENT EXECUTE FUNCTION catalog_internal.bump_generation();

CREATE FUNCTION catalog_test.assert_generation(expected bigint, label text)
RETURNS void LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE actual bigint;
BEGIN
  SELECT value INTO actual FROM catalog_internal.generation WHERE singleton=true;
  IF actual IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'FAIL %: expected generation %, got %', label, expected, actual;
  END IF;
  RAISE NOTICE 'PASS %: generation %', label, actual;
END;
$$;
REVOKE ALL ON FUNCTION catalog_test.assert_generation(bigint,text) FROM PUBLIC;

SELECT catalog_test.assert_generation(0, 'setup');
INSERT INTO catalog_test.users(id,display_name) VALUES(1,'synthetic-author');
INSERT INTO catalog_test.series(id,author_id,title,publication_status)
VALUES(100,1,'synthetic-work','public');
INSERT INTO catalog_test.episodes(id,series_id,posting_status,is_published,episode_number)
VALUES(1000,100,'posted',true,1);
SELECT catalog_test.assert_generation(3, 'three writes');

UPDATE catalog_test.series SET title='synthetic-work' WHERE id=100;
SELECT catalog_test.assert_generation(3, 'no-op title does not invalidate');
UPDATE catalog_test.series SET content_warnings=ARRAY['sexual_r18'] WHERE id=100;
SELECT catalog_test.assert_generation(4, 'content_warnings R18 change invalidates');
UPDATE catalog_test.series SET publication_status='private' WHERE id=100;
SELECT catalog_test.assert_generation(5, 'public-to-private invalidates');
UPDATE catalog_test.episodes SET posting_status='draft' WHERE id=1000;
SELECT catalog_test.assert_generation(6, 'posted-to-draft invalidates');
UPDATE catalog_test.users SET display_name='synthetic-author-renamed' WHERE id=1;
SELECT catalog_test.assert_generation(7, 'author rename invalidates');
UPDATE catalog_test.users SET show_r18_content=true WHERE id=1;
SELECT catalog_test.assert_generation(7, 'viewer preference stays outside global key');

BEGIN;
UPDATE catalog_test.series SET title='rolled-back-title' WHERE id=100;
SELECT catalog_test.assert_generation(8, 'inside transaction');
ROLLBACK;
SELECT catalog_test.assert_generation(7, 'rollback restores generation');
DO $$ BEGIN
  IF (SELECT title FROM catalog_test.series WHERE id=100) <> 'synthetic-work' THEN
    RAISE EXCEPTION 'FAIL rollback persisted title';
  END IF;
END $$;

-- Expose a test-only self-contained anon role, never global user profile reads.
ALTER TABLE catalog_test.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_test.series ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_test.episodes ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA catalog_test TO catalog_anon;
GRANT SELECT ON catalog_test.users,catalog_test.series,catalog_test.episodes TO catalog_anon;
CREATE POLICY anon_public_series ON catalog_test.series FOR SELECT TO catalog_anon
USING (publication_status='public');
CREATE POLICY anon_public_episodes ON catalog_test.episodes FOR SELECT TO catalog_anon
USING (
  is_published AND posting_status='posted'
  AND EXISTS (
    SELECT 1 FROM catalog_test.series s
    WHERE s.id = catalog_test.episodes.series_id AND s.publication_status = 'public'
  )
);
-- NO anon SELECT policy on users: zero author profile rows.
CREATE VIEW catalog_test.bad_author_join WITH (security_invoker=true) AS
SELECT s.id,u.display_name FROM catalog_test.series s
JOIN catalog_test.users u ON u.id=s.author_id;
GRANT SELECT ON catalog_test.bad_author_join TO catalog_anon;

DO $$ BEGIN
  IF has_schema_privilege('catalog_anon','catalog_internal','USAGE') THEN
    RAISE EXCEPTION 'FAIL anon has access to internal schema'; END IF;
  IF has_table_privilege('catalog_anon','catalog_internal.generation','SELECT') THEN
    RAISE EXCEPTION 'FAIL anon can read generation'; END IF;
  IF has_table_privilege('catalog_anon','catalog_internal.generation','UPDATE') THEN
    RAISE EXCEPTION 'FAIL anon can change generation'; END IF;
  IF has_function_privilege('catalog_anon','catalog_internal.bump_generation()','EXECUTE') THEN
    RAISE EXCEPTION 'FAIL anon can call privileged function'; END IF;
END $$;

UPDATE catalog_test.series SET publication_status='public' WHERE id=100;
UPDATE catalog_test.episodes SET posting_status='posted' WHERE id=1000;
SELECT catalog_test.assert_generation(9, 'ready for anon test');
SET ROLE catalog_anon;
DO $$ DECLARE c bigint; BEGIN
  SELECT count(*) INTO c FROM catalog_test.series;
  IF c <> 1 THEN RAISE EXCEPTION 'FAIL anon public series count %',c; END IF;
  SELECT count(*) INTO c FROM catalog_test.users;
  IF c <> 0 THEN RAISE EXCEPTION 'FAIL anon users visibility %',c; END IF;
  SELECT count(*) INTO c FROM catalog_test.bad_author_join;
  IF c <> 0 THEN RAISE EXCEPTION 'FAIL naive security_invoker author JOIN leaked rows'; END IF;
END $$;
RESET ROLE;

-- A real PostgreSQL FK action must invoke both the series DELETE trigger
-- and the cascaded episodes DELETE trigger, without a separate app API call.
DELETE FROM catalog_test.series WHERE id=100;
SELECT catalog_test.assert_generation(11, 'series delete and episode FK cascade');
INSERT INTO catalog_test.series(id,author_id,title,publication_status,content_warnings)
VALUES (100,1,'synthetic-work','public',ARRAY['sexual_r18']);
INSERT INTO catalog_test.episodes(id,series_id,posting_status,is_published,episode_number)
VALUES(1000,100,'posted',true,1);
SELECT catalog_test.assert_generation(13, 'series+episode reinsert');

-- Direct missed-trigger experiment: no generation change when trigger disabled.
BEGIN;
ALTER TABLE catalog_test.series DISABLE TRIGGER series_update;
UPDATE catalog_test.series SET content_warnings='{}'::text[] WHERE id=100;
SELECT catalog_test.assert_generation(13, 'expected insecure missed-trigger negative control');
ROLLBACK;
SELECT catalog_test.assert_generation(13, 'trigger and state restored after rollback');

-- Assert TRUNCATE coverage and rollback are transactional, too.
BEGIN;
TRUNCATE TABLE catalog_test.episodes;
SELECT catalog_test.assert_generation(14, 'episodes TRUNCATE bumps generation');
ROLLBACK;
SELECT catalog_test.assert_generation(13, 'TRUNCATE rollback restores generation and rows');

-- Fail closed if the generation singleton disappears during a mutation.
-- A nested PL/pgSQL exception block forms a savepoint, so no state is changed.
DO $$
DECLARE original_title text;
BEGIN
  SELECT title INTO original_title FROM catalog_test.series WHERE id=100;
  BEGIN
    DELETE FROM catalog_internal.generation WHERE singleton=true;
    UPDATE catalog_test.series SET title=title||'-must-fail' WHERE id=100;
    RAISE EXCEPTION 'FAIL mutation succeeded despite missing generation';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'Missing catalog generation singleton' THEN
      RAISE;
    END IF;
    RAISE NOTICE 'PASS missing-generation mutation fails closed';
  END;
  IF (SELECT title FROM catalog_test.series WHERE id=100) IS DISTINCT FROM original_title THEN
    RAISE EXCEPTION 'FAIL title mutated after missing-generation rollback';
  END IF;
END $$;
SELECT catalog_test.assert_generation(13, 'failed generation write rolls back');

-- Public work with a draft episode and private work with an otherwise posted
-- episode must remain invisible through raw table RLS AND the invoker view.
CREATE VIEW catalog_test.public_episode_listing WITH (security_invoker=true) AS
SELECT e.id, e.series_id
FROM catalog_test.episodes e
JOIN catalog_test.series s ON s.id = e.series_id
WHERE s.publication_status='public'
  AND e.posting_status='posted' AND e.is_published=true;
GRANT SELECT ON catalog_test.public_episode_listing TO catalog_anon;
INSERT INTO catalog_test.series(id,author_id,title,publication_status)
VALUES(101,1,'synthetic-unpublished','private');
INSERT INTO catalog_test.episodes(id,series_id,posting_status,is_published,episode_number)
VALUES(1001,101,'posted',true,1);
INSERT INTO catalog_test.episodes(id,series_id,posting_status,is_published,episode_number)
VALUES(1002,100,'draft',false,2);
SELECT catalog_test.assert_generation(16, 'negative-visibility rows inserted');
SET ROLE catalog_anon;
DO $$
DECLARE actual bigint;
BEGIN
  SELECT count(*) INTO actual FROM catalog_test.series;
  IF actual <> 1 THEN RAISE EXCEPTION 'FAIL anon series count %',actual; END IF;
  SELECT count(*) INTO actual FROM catalog_test.episodes;
  IF actual <> 1 THEN RAISE EXCEPTION 'FAIL anon raw episodes count %',actual; END IF;
  SELECT count(*) INTO actual FROM catalog_test.public_episode_listing;
  IF actual <> 1 THEN RAISE EXCEPTION 'FAIL anon invoker view episode count %',actual; END IF;
  SELECT count(*) INTO actual FROM catalog_test.bad_author_join;
  IF actual <> 0 THEN RAISE EXCEPTION 'FAIL anon author profile leaked'; END IF;
  -- Test the *actual* runtime permission error, not just has_*_privilege.
  BEGIN
    EXECUTE 'SELECT value FROM catalog_internal.generation';
    RAISE EXCEPTION 'FAIL anon generation SELECT unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS anon generation SELECT denied';
  END;
  BEGIN
    EXECUTE 'UPDATE catalog_internal.generation SET value=value+1';
    RAISE EXCEPTION 'FAIL anon generation UPDATE unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS anon generation UPDATE denied';
  END;
  RAISE NOTICE 'PASS anon raw series/episodes and security-invoker visibility';
END $$;
RESET ROLE;

-- A constrained application writer may change ONE synthetic work but cannot
-- SELECT/UPDATE the internal epoch directly; its trigger must still advance it.
CREATE ROLE catalog_writer NOLOGIN;
GRANT USAGE ON SCHEMA catalog_test TO catalog_writer;
GRANT SELECT (id,title), UPDATE (title) ON catalog_test.series TO catalog_writer;
CREATE POLICY writer_own_series_select ON catalog_test.series FOR SELECT TO catalog_writer
USING (id=100);
CREATE POLICY writer_own_series_update ON catalog_test.series FOR UPDATE TO catalog_writer
USING (id=100) WITH CHECK (id=100);
DO $$ BEGIN
  IF has_schema_privilege('catalog_writer','catalog_internal','USAGE')
     OR has_table_privilege('catalog_writer','catalog_internal.generation','UPDATE')
     OR has_function_privilege('catalog_writer','catalog_internal.bump_generation()','EXECUTE')
  THEN RAISE EXCEPTION 'FAIL catalog writer can access internal mutation surface'; END IF;
END $$;
SET ROLE catalog_writer;
UPDATE catalog_test.series SET title='synthetic-work-writer-updated' WHERE id=100;
RESET ROLE;
SELECT catalog_test.assert_generation(17, 'RLS-constrained writer invokes protected epoch trigger');

-- Permanent fixture left ready for independent concurrency shell test.
SELECT 'READY_FOR_CONCURRENCY' AS status;
