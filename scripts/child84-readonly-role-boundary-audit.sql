-- Child84 read-only Production acceptance: public admission and private library RLS.
-- PRECONDITION: privileged review-only SQL connection that can SET ROLE anon/authenticated.
-- Run the WHOLE file in one transaction. No DDL, DML, role grants, user or media writes.
-- Hardcoded UUID is a synthetic NON-USER; reject the probe if it ever exists in Auth.
-- The counts are intentionally dynamic so a growing public catalog remains valid.
-- A pass is NOT proof of real session/JWT, R18, Human/AI translation, recording,
-- signed-in Reader, cache eviction, deletion or concurrent publication behavior.
BEGIN READ ONLY;

DO $assert$
BEGIN
  IF EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = '00000000-0000-0000-0000-000000000000'::uuid
  ) THEN
    RAISE EXCEPTION 'Synthetic user identifier is occupied; abort RLS probe';
  END IF;
END $assert$;

-- Baseline obtained under privileged role only as aggregate counts.
SELECT set_config(
  'child84.expected_public_series',
  (SELECT count(*) FROM public.series
   WHERE publication_status = 'public')::text,
  true
);
SELECT set_config(
  'child84.expected_public_episodes',
  (SELECT count(*) FROM public.episodes e
   JOIN public.series s ON s.id = e.series_id
   WHERE s.publication_status = 'public'
     AND e.posting_status = 'posted'
     AND e.is_published = true)::text,
  true
);

SET LOCAL ROLE anon;
DO $assert$
BEGIN
  IF (SELECT count(*) FROM public.series)
     <> current_setting('child84.expected_public_series')::bigint
    OR (SELECT count(*) FROM public.series
        WHERE publication_status <> 'public') <> 0
  THEN
    RAISE EXCEPTION 'Anon can see wrong series set';
  END IF;

  IF (SELECT count(*) FROM public.episodes)
     <> current_setting('child84.expected_public_episodes')::bigint
    OR (SELECT count(*) FROM public.episodes
        WHERE posting_status <> 'posted' OR is_published IS NOT TRUE) <> 0
  THEN
    RAISE EXCEPTION 'Anon can see wrong episode set';
  END IF;
END $assert$;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000000',
  true
);
DO $assert$
BEGIN
  IF auth.uid() IS DISTINCT FROM
    '00000000-0000-0000-0000-000000000000'::uuid
  THEN
    RAISE EXCEPTION 'Synthetic authenticated claim not applied';
  END IF;

  IF (SELECT count(*) FROM public.series)
     <> current_setting('child84.expected_public_series')::bigint
    OR (SELECT count(*) FROM public.series
        WHERE publication_status <> 'public') <> 0
  THEN
    RAISE EXCEPTION 'Signed-in stranger can see wrong series set';
  END IF;

  IF (SELECT count(*) FROM public.episodes)
     <> current_setting('child84.expected_public_episodes')::bigint
    OR (SELECT count(*) FROM public.episodes
        WHERE posting_status <> 'posted' OR is_published IS NOT TRUE) <> 0
  THEN
    RAISE EXCEPTION 'Signed-in stranger can see wrong episode set';
  END IF;

  IF (SELECT count(*) FROM public.private_library_works) <> 0
  THEN
    RAISE EXCEPTION 'Signed-in stranger can see another user library';
  END IF;
END $assert$;

-- Emit ONLY aggregate public counts and the fixed synthetic identity.
SELECT current_user AS effective_role,
  auth.uid()::text AS synthetic_auth_id,
  (SELECT count(*) FROM public.series) AS public_series_visible,
  (SELECT count(*) FROM public.episodes) AS public_episodes_visible,
  (SELECT count(*) FROM public.private_library_works) AS private_library_visible;

COMMIT;
