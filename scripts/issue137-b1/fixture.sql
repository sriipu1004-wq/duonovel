-- Issue #137 B1: throwaway LOCAL Supabase fixture ONLY. Not a Production migration.
-- Copied by run-local.sh into an isolated mktemp project; NO real identities.
CREATE TABLE public.issue137_b1_profiles (
 id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 show_r18_content boolean NOT NULL DEFAULT false,
 r18_confirmed_at timestamptz
);
CREATE TABLE public.issue137_b1_series (
 id uuid PRIMARY KEY, author_id uuid NOT NULL REFERENCES auth.users(id),
 publication_status text NOT NULL CHECK (publication_status IN ('public','private')),
 content_rating text NOT NULL CHECK (content_rating IN ('general','r18')),
 content_warnings text[] NOT NULL DEFAULT '{}'::text[]
);
CREATE TABLE public.issue137_b1_episodes (
 id uuid PRIMARY KEY, series_id uuid NOT NULL REFERENCES public.issue137_b1_series(id),
 posting_status text NOT NULL CHECK (posting_status IN ('posted','draft')),
 is_published boolean NOT NULL, body text NOT NULL
);
CREATE TABLE public.issue137_b1_recordings (
 id uuid PRIMARY KEY, series_id uuid NOT NULL REFERENCES public.issue137_b1_series(id),
 episode_id uuid NOT NULL REFERENCES public.issue137_b1_episodes(id),
 is_public boolean NOT NULL, bucket_id text NOT NULL, storage_path text NOT NULL
);
GRANT SELECT ON public.issue137_b1_profiles TO authenticated;
GRANT SELECT ON public.issue137_b1_series,public.issue137_b1_episodes,
 public.issue137_b1_recordings TO anon,authenticated;
ALTER TABLE public.issue137_b1_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.issue137_b1_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.issue137_b1_episodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.issue137_b1_recordings ENABLE ROW LEVEL SECURITY;
CREATE POLICY b1_profile_self ON public.issue137_b1_profiles
 FOR SELECT TO authenticated USING (id=(SELECT auth.uid()));

-- Isolated non-exposed SECURITY DEFINER: one boolean, current auth.uid().
-- The profile table is not readable by anon; role-controlled JWT is required.
CREATE SCHEMA issue137_b1_private;
REVOKE ALL ON SCHEMA issue137_b1_private FROM PUBLIC;
CREATE FUNCTION issue137_b1_private.can_read_r18()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog AS $$
 SELECT EXISTS (
 SELECT 1 FROM public.issue137_b1_profiles p
 WHERE p.id=(SELECT auth.uid())
  AND p.show_r18_content IS TRUE AND p.r18_confirmed_at IS NOT NULL
 );
$$;
REVOKE ALL ON FUNCTION issue137_b1_private.can_read_r18() FROM PUBLIC;
GRANT USAGE ON SCHEMA issue137_b1_private TO anon,authenticated;
GRANT EXECUTE ON FUNCTION issue137_b1_private.can_read_r18() TO anon,authenticated;

CREATE POLICY b1_series_public_reader ON public.issue137_b1_series
 FOR SELECT TO anon,authenticated USING (
 publication_status='public' AND (
  (content_rating<>'r18' AND NOT ('sexual_r18'=ANY(content_warnings)))
  OR issue137_b1_private.can_read_r18()
 ));
CREATE POLICY b1_series_author_workspace ON public.issue137_b1_series
 FOR SELECT TO authenticated USING (author_id=(SELECT auth.uid()));
CREATE POLICY b1_episode_public_reader ON public.issue137_b1_episodes
 FOR SELECT TO anon,authenticated USING (
 posting_status='posted' AND is_published IS TRUE
 AND EXISTS (SELECT 1 FROM public.issue137_b1_series s
 WHERE s.id=issue137_b1_episodes.series_id AND s.publication_status='public'));
CREATE POLICY b1_episode_author_workspace ON public.issue137_b1_episodes
 FOR SELECT TO authenticated USING (EXISTS (
 SELECT 1 FROM public.issue137_b1_series s
 WHERE s.id=issue137_b1_episodes.series_id AND s.author_id=(SELECT auth.uid())));
CREATE POLICY b1_recording_public_reader ON public.issue137_b1_recordings
 FOR SELECT TO anon,authenticated USING (
 is_public IS TRUE AND EXISTS (
 SELECT 1 FROM public.issue137_b1_episodes e
 JOIN public.issue137_b1_series s ON s.id=e.series_id
 WHERE e.id=issue137_b1_recordings.episode_id
 AND s.id=issue137_b1_recordings.series_id
 AND s.publication_status='public'
 AND e.posting_status='posted' AND e.is_published IS TRUE));
CREATE POLICY b1_recording_author_workspace ON public.issue137_b1_recordings
 FOR SELECT TO authenticated USING (EXISTS (
 SELECT 1 FROM public.issue137_b1_series s
 WHERE s.id=issue137_b1_recordings.series_id AND s.author_id=(SELECT auth.uid())));

CREATE VIEW public.issue137_b1_public_episode_counts
 WITH (security_invoker=true) AS
 SELECT e.series_id, COUNT(*)::integer AS episode_count
 FROM public.issue137_b1_episodes e
 JOIN public.issue137_b1_series s ON s.id=e.series_id
 WHERE s.publication_status='public'
  AND e.posting_status='posted' AND e.is_published IS TRUE
 GROUP BY e.series_id;
GRANT SELECT ON public.issue137_b1_public_episode_counts TO anon,authenticated;

-- ONLY the synthetic LOCAL private-media bucket; no existing object affected.
CREATE POLICY b1_private_media_reader ON storage.objects
 FOR SELECT TO authenticated USING (
 bucket_id='issue137-b1-private'
 AND EXISTS (
 SELECT 1 FROM public.issue137_b1_recordings r
 WHERE r.bucket_id=storage.objects.bucket_id
  AND r.storage_path=storage.objects.name));

DO $$ BEGIN
 IF has_table_privilege('anon','public.issue137_b1_profiles','SELECT')
 OR has_table_privilege('authenticated','public.issue137_b1_profiles','UPDATE')
 OR has_table_privilege('anon','public.issue137_b1_episodes','UPDATE')
 OR has_table_privilege('authenticated','public.issue137_b1_series','UPDATE')
 THEN RAISE EXCEPTION 'FAIL B1 least privilege'; END IF;
END $$;
