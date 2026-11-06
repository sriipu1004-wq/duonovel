-- Issue #137 F2-P: DISPOSABLE-ONLY ALL-PUBLIC Storage write freeze experiment.
-- DO NOT APPLY TO HOSTED OR PROMOTE INTO AN APPLICATION MIGRATION.
-- Supabase explicitly discourages mutating its provider-managed storage schema.
-- Local E2E will install this as its LAST operation, then destroy the whole
-- ephemeral Docker Supabase stack. No Production DB, rights, or media touched.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $local_only$
BEGIN
 IF pg_catalog.to_regclass('libread_r0_disposable.sentinel') IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM libread_r0_disposable.sentinel
      WHERE id = true AND purpose = 'SYNTHETIC-R0-ONLY'
    ) THEN
   RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='ISSUE137_FREEZE_REQUIRES_DISPOSABLE_SENTINEL';
 END IF;
 IF EXISTS (
   SELECT 1 FROM pg_catalog.pg_trigger t
   WHERE t.tgname IN (
      'issue137_local_full_public_object_freeze',
      'issue137_local_full_public_bucket_freeze'
   ) AND NOT t.tgisinternal
 ) THEN
   RAISE EXCEPTION USING ERRCODE='42501',
     MESSAGE='ISSUE137_FULL_PUBLIC_FREEZE_ALREADY_INSTALLED';
 END IF;
END;
$local_only$;

-- No MIME, path, file extension, ownership or R18 exemption: PUBLIC *as a
-- destination* is sufficient to reject a new byte/object/version. A move
-- FROM an existing PUBLIC origin also cannot silently mutate provenance.
-- This is a strong local negative/control proof, NOT a supported Supabase
-- tenant configuration; it prevents benign BGM/illustration writes too.
CREATE FUNCTION libread_r0_disposable.deny_full_public_object_mutation()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  old_public boolean := false;
  new_public boolean := false;
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN
    SELECT b.public INTO old_public FROM storage.buckets b
      WHERE b.id = OLD.bucket_id FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE='42501',
        MESSAGE='ISSUE137_FULL_PUBLIC_FREEZE_UNKNOWN_OLD_BUCKET';
    END IF;
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') THEN
    SELECT b.public INTO new_public FROM storage.buckets b
      WHERE b.id = NEW.bucket_id FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE='42501',
        MESSAGE='ISSUE137_FULL_PUBLIC_FREEZE_UNKNOWN_NEW_BUCKET';
    END IF;
  END IF;
  IF old_public IS TRUE OR new_public IS TRUE THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='ISSUE137_LOCAL_FULL_PUBLIC_WRITE_FROZEN';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION libread_r0_disposable.deny_full_public_object_mutation()
  FROM PUBLIC, anon, authenticated;
CREATE TRIGGER issue137_local_full_public_object_freeze
BEFORE INSERT OR UPDATE OR DELETE ON storage.objects
FOR EACH ROW EXECUTE FUNCTION libread_r0_disposable.deny_full_public_object_mutation();

-- A caller must not create a PUBLIC bucket or flip an empty PRIVATE bucket
-- to PUBLIC to escape the object guard. Existing PUBLIC buckets cannot be
-- renamed, deleted or toggled while this local demonstration is installed.
CREATE FUNCTION libread_r0_disposable.deny_full_public_bucket_mutation()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.public IS TRUE THEN
      RAISE EXCEPTION USING ERRCODE='42501',
        MESSAGE='ISSUE137_LOCAL_PUBLIC_BUCKET_CREATE_FROZEN';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.public IS TRUE OR NEW.public IS TRUE THEN
      RAISE EXCEPTION USING ERRCODE='42501',
        MESSAGE='ISSUE137_LOCAL_PUBLIC_BUCKET_MUTATION_FROZEN';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.public IS TRUE THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='ISSUE137_LOCAL_PUBLIC_BUCKET_DELETE_FROZEN';
  END IF;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION libread_r0_disposable.deny_full_public_bucket_mutation()
  FROM PUBLIC, anon, authenticated;
CREATE TRIGGER issue137_local_full_public_bucket_freeze
BEFORE INSERT OR UPDATE OR DELETE ON storage.buckets
FOR EACH ROW EXECUTE FUNCTION libread_r0_disposable.deny_full_public_bucket_mutation();
COMMIT;

SELECT
  CASE WHEN (SELECT count(*) FROM pg_catalog.pg_trigger t
             JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid
             JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='storage' AND
                   t.tgname IN ('issue137_local_full_public_object_freeze',
                                 'issue137_local_full_public_bucket_freeze')
                   AND NOT t.tgisinternal) = 2
  THEN 'ISSUE137_LOCAL_FULL_PUBLIC_WRITE_FREEZE_INSTALLED'
  ELSE 'ISSUE137_LOCAL_FULL_PUBLIC_WRITE_FREEZE_INCOMPLETE'
  END AS only_disposable_attestation;
