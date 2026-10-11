-- Child84 read-only Production Search eligibility/parity audit.
-- This checks the database's safe broad candidate boundary, NOT complete
-- Search ordering, facet counts, popularity, saved filters or R18 UI.
-- The output is aggregates only: no work/user/episode identifiers.
BEGIN READ ONLY;

WITH public_eligible AS MATERIALIZED (
  SELECT s.id, lower(btrim(s.source_language)) AS source_language
  FROM public.series s
  WHERE s.publication_status = 'public'
    AND lower(btrim(s.source_language)) IN
      ('ja','en','ko','fr','de','es','zh-hans','zh-hant')
), raw_episode_eligible AS MATERIALIZED (
  SELECT s.id,s.source_language
  FROM public_eligible s
  WHERE EXISTS (
    SELECT 1 FROM public.episodes e
    WHERE e.series_id = s.id
      AND e.posting_status = 'posted'
      AND e.is_published = true
  )
), summary_view_eligible AS MATERIALIZED (
  SELECT s.id,s.source_language
  FROM public_eligible s
  JOIN public.public_episode_work_summaries v ON v.series_id = s.id
  WHERE v.episode_count > 0
), missing_from_view AS (
  SELECT id FROM raw_episode_eligible
  EXCEPT SELECT id FROM summary_view_eligible
), extra_in_view AS (
  SELECT id FROM summary_view_eligible
  EXCEPT SELECT id FROM raw_episode_eligible
), compare_by_language AS (
  SELECT c.lang,
    (SELECT count(*) FROM raw_episode_eligible r WHERE r.source_language=c.lang) AS raw_n,
    (SELECT count(*) FROM summary_view_eligible v WHERE v.source_language=c.lang) AS view_n
  FROM (VALUES ('ja'),('en'),('ko'),('fr'),('de'),('es'),('zh-hans'),('zh-hant')) AS c(lang)
)
SELECT jsonb_build_object(
 'reference_eligible',(SELECT count(*) FROM raw_episode_eligible),
 'view_eligible',(SELECT count(*) FROM summary_view_eligible),
 'reference_missing_from_view',(SELECT count(*) FROM missing_from_view),
 'unexpected_view_ids',(SELECT count(*) FROM extra_in_view),
 'language_counts',(SELECT jsonb_object_agg(lang, jsonb_build_object('reference',raw_n,'view',view_n)
                         ORDER BY lang) FROM compare_by_language),
 'all_language_counts_equal',(SELECT bool_and(raw_n=view_n) FROM compare_by_language)
) AS search_eligibility_audit;

COMMIT;
