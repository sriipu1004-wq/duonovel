-- Child84h: HISTORICAL soft-deleted Auth reference inventory, READ ONLY.
-- Scan 44 explicit public UUID principal columns plus public.users and Storage
-- owner metadata. No IDs, emails, paths, or content are returned; counts only.
-- A zero result DOES NOT imply total erasure (orphans, Stripe, logs, media bytes,
-- backups, non-UUID PII and external systems are outside this query).
-- Run only with authorized privileged DB inspection; never publish row payloads.
BEGIN READ ONLY;

DO $guard$
DECLARE expected_columns integer;
BEGIN
  SELECT count(*) INTO expected_columns FROM information_schema.columns
  WHERE table_schema='public' AND data_type='uuid'
    AND (column_name IN ('owner_user_id','user_id','author_id','reader_id',
      'reader_user_id','translator_user_id','created_by','actor_user_id',
      'profile_id','account_id') OR column_name LIKE '%_user_id');
  IF expected_columns <> 44 THEN
    RAISE EXCEPTION 'Review user-principal inventory after schema drift: expected 44, got %',
      expected_columns;
  END IF;
END $guard$;

SELECT
  (SELECT count(*) FROM auth.users WHERE deleted_at IS NOT NULL)::bigint
    AS soft_deleted_auth_identities;

SELECT reference_path, soft_deleted_references
FROM (
  SELECT 'author_follows.follower_user_id'::text AS reference_path,
         count(*)::bigint AS soft_deleted_references
  FROM public.author_follows t
  JOIN auth.users au ON au.id = t.follower_user_id
  WHERE au.deleted_at IS NOT NULL
  UNION ALL
  SELECT 'author_profile_likes.author_id'::text AS reference_path,
         count(*)::bigint AS soft_deleted_references
  FROM public.author_profile_likes t
  JOIN auth.users au ON au.id = t.author_id
  WHERE au.deleted_at IS NOT NULL
  UNION ALL
  SELECT 'author_profile_likes.user_id'::text AS reference_path,
         count(*)::bigint AS soft_deleted_references
  FROM public.author_profile_likes t
  JOIN auth.users au ON au.id = t.user_id
  WHERE au.deleted_at IS NOT NULL
  UNION ALL
  SELECT 'bgm_library_favorites.user_id'::text AS reference_path,
         count(*)::bigint AS soft_deleted_references
  FROM public.bgm_library_favorites t
  JOIN auth.users au ON au.id = t.user_id
  WHERE au.deleted_at IS NOT NULL
  UNION ALL
  SELECT 'bilingual_word_explanations.owner_user_id'::text AS reference_path,
         count(*)::bigint AS soft_deleted_references
  FROM public.bilingual_word_explanations t
  JOIN auth.users au ON au.id = t.owner_user_id
  WHERE au.deleted_at IS NOT NULL
  UNION ALL
  SELECT 'credit_ledger.user_id'::text AS reference_path,
         count(*)::bigint AS soft_deleted_references
  FROM public.credit_ledger t
  JOIN auth.users au ON au.id = t.user_id
  WHERE au.deleted_at IS NOT NULL
  UNION ALL
  SELECT 'credit_purchase_lots.user_id'::text AS reference_path,
         count(*)::bigint AS soft_deleted_references
  FROM public.credit_purchase_lots t
  JOIN auth.users au ON au.id = t.user_id
  WHERE au.deleted_at IS NOT NULL
  UNION ALL
  SELECT 'episode_human_translations.translator_user_id'::text AS reference_path,
         count(*)::bigint AS soft_deleted_references
  FROM public.episode_human_translations t
  JOIN auth.users au ON au.id = t.translator_user_id
  WHERE au.deleted_at IS NOT NULL
  UNION ALL
  SELECT 'episode_translation_logs.user_id'::text AS reference_path,
         count(*)::bigint AS soft_deleted_references
  FROM public.episode_translation_logs t
  JOIN auth.users au ON au.id = t.user_id
  WHERE au.deleted_at IS NOT NULL
  UNION ALL
  SELECT 'episode_translations.requested_by_user_id'::text AS reference_path,
         count(*)::bigint AS soft_deleted_references
  FROM public.episode_translations t
  JOIN auth.users au ON au.id = t.requested_by_user_id
  WHERE au.deleted_at IS NOT NULL
  UNION ALL
  SELECT 'generated_story_translation_logs.user_id'::text AS reference_path,
         count(*)::bigint AS soft_deleted_references
  FROM public.generated_story_translation_logs t
  JOIN auth.users au ON au.id = t.user_id
  WHERE au.deleted_at IS NOT NULL
  UNION ALL
  SELECT 'generated_story_translations.requested_by_user_id'::text AS reference_path,
         count(*)::bigint AS soft_deleted_references
  FROM public.generated_story_translations t
  JOIN auth.users au ON au.id = t.requested_by_user_id
  WHERE au.deleted_at IS NOT NULL
  UNION ALL
  SELECT 'libread_billing_customers.user_id'::text AS reference_path,
         count(*)::bigint AS soft_deleted_references
  FROM public.libread_billing_customers t
  JOIN auth.users au ON au.id = t.user_id
  WHERE au.deleted_at IS NOT NULL
  UNION ALL
  SELECT 'libread_billing_subscriptions.user_id'::text AS reference_path,
         count(*)::bigint AS soft_deleted_references
  FROM public.libread_billing_subscriptions t
  JOIN auth.users au ON au.id = t.user_id
  WHERE au.deleted_at IS NOT NULL
  UNION ALL
  SELECT 'libread_daily_ai_action_logs.user_id'::text AS reference_path,
         count(*)::bigint AS soft_deleted_references
  FROM public.libread_daily_ai_action_logs t
  JOIN auth.users au ON au.id = t.user_id
  WHERE au.deleted_at IS NOT NULL
  UNION ALL
  SELECT 'libread_subscriber_monthly_ai_reservations.user_id'::text AS reference_path,
         count(*)::bigint AS soft_deleted_references
  FROM public.libread_subscriber_monthly_ai_reservations t
  JOIN auth.users au ON au.id = t.user_id
  WHERE au.deleted_at IS NOT NULL
  UNION ALL
  SELECT 'libread_user_entitlements.user_id'::text AS reference_path,
         count(*)::bigint AS soft_deleted_references
  FROM public.libread_user_entitlements t
  JOIN auth.users au ON au.id = t.user_id
  WHERE au.deleted_at IS NOT NULL
  UNION ALL
  SELECT 'play_logs.user_id'::text AS reference_path,
         count(*)::bigint AS soft_deleted_references
  FROM public.play_logs t
  JOIN auth.users au ON au.id = t.user_id
  WHERE au.deleted_at IS NOT NULL
  UNION ALL
  SELECT 'private_library_chapter_translation_logs.user_id'::text AS reference_path,
         count(*)::bigint AS soft_deleted_references
  FROM public.private_library_chapter_translation_logs t
  JOIN auth.users au ON au.id = t.user_id
  WHERE au.deleted_at IS NOT NULL
  UNION ALL
  SELECT 'private_library_chapter_translations.requested_by_user_id'::text AS reference_path,
         count(*)::bigint AS soft_deleted_references
  FROM public.private_library_chapter_translations t
  JOIN auth.users au ON au.id = t.requested_by_user_id
  WHERE au.deleted_at IS NOT NULL
  UNION ALL
  SELECT 'private_library_glossary_terms.owner_user_id'::text AS reference_path,
         count(*)::bigint AS soft_deleted_references
  FROM public.private_library_glossary_terms t
  JOIN auth.users au ON au.id = t.owner_user_id
  WHERE au.deleted_at IS NOT NULL
  UNION ALL
  SELECT 'private_library_reading_progress.user_id'::text AS reference_path,
         count(*)::bigint AS soft_deleted_references
  FROM public.private_library_reading_progress t
  JOIN auth.users au ON au.id = t.user_id
  WHERE au.deleted_at IS NOT NULL
  UNION ALL
  SELECT 'private_library_word_explanations.owner_user_id'::text AS reference_path,
         count(*)::bigint AS soft_deleted_references
  FROM public.private_library_word_explanations t
  JOIN auth.users au ON au.id = t.owner_user_id
  WHERE au.deleted_at IS NOT NULL
  UNION ALL
  SELECT 'private_library_works.owner_user_id'::text AS reference_path,
         count(*)::bigint AS soft_deleted_references
  FROM public.private_library_works t
  JOIN auth.users au ON au.id = t.owner_user_id
  WHERE au.deleted_at IS NOT NULL
  UNION ALL
  SELECT 'public_episode_translation_unlocks.user_id'::text AS reference_path,
         count(*)::bigint AS soft_deleted_references
  FROM public.public_episode_translation_unlocks t
  JOIN auth.users au ON au.id = t.user_id
  WHERE au.deleted_at IS NOT NULL
  UNION ALL
  SELECT 'reader_card_likes.user_id'::text AS reference_path,
         count(*)::bigint AS soft_deleted_references
  FROM public.reader_card_likes t
  JOIN auth.users au ON au.id = t.user_id
  WHERE au.deleted_at IS NOT NULL
  UNION ALL
  SELECT 'recording_play_events.user_id'::text AS reference_path,
         count(*)::bigint AS soft_deleted_references
  FROM public.recording_play_events t
  JOIN auth.users au ON au.id = t.user_id
  WHERE au.deleted_at IS NOT NULL
  UNION ALL
  SELECT 'recordings.reader_id'::text AS reference_path,
         count(*)::bigint AS soft_deleted_references
  FROM public.recordings t
  JOIN auth.users au ON au.id = t.reader_id
  WHERE au.deleted_at IS NOT NULL
  UNION ALL
  SELECT 'recordings.reader_user_id'::text AS reference_path,
         count(*)::bigint AS soft_deleted_references
  FROM public.recordings t
  JOIN auth.users au ON au.id = t.reader_user_id
  WHERE au.deleted_at IS NOT NULL
  UNION ALL
  SELECT 'series.author_id'::text AS reference_path,
         count(*)::bigint AS soft_deleted_references
  FROM public.series t
  JOIN auth.users au ON au.id = t.author_id
  WHERE au.deleted_at IS NOT NULL
  UNION ALL
  SELECT 'series_recording_requests.requester_user_id'::text AS reference_path,
         count(*)::bigint AS soft_deleted_references
  FROM public.series_recording_requests t
  JOIN auth.users au ON au.id = t.requester_user_id
  WHERE au.deleted_at IS NOT NULL
  UNION ALL
  SELECT 'series_recording_requests.reviewed_by_user_id'::text AS reference_path,
         count(*)::bigint AS soft_deleted_references
  FROM public.series_recording_requests t
  JOIN auth.users au ON au.id = t.reviewed_by_user_id
  WHERE au.deleted_at IS NOT NULL
  UNION ALL
  SELECT 'series_translation_glossary_entries.created_by_user_id'::text AS reference_path,
         count(*)::bigint AS soft_deleted_references
  FROM public.series_translation_glossary_entries t
  JOIN auth.users au ON au.id = t.created_by_user_id
  WHERE au.deleted_at IS NOT NULL
  UNION ALL
  SELECT 'series_translation_profiles.updated_by_user_id'::text AS reference_path,
         count(*)::bigint AS soft_deleted_references
  FROM public.series_translation_profiles t
  JOIN auth.users au ON au.id = t.updated_by_user_id
  WHERE au.deleted_at IS NOT NULL
  UNION ALL
  SELECT 'series_view_events.user_id'::text AS reference_path,
         count(*)::bigint AS soft_deleted_references
  FROM public.series_view_events t
  JOIN auth.users au ON au.id = t.user_id
  WHERE au.deleted_at IS NOT NULL
  UNION ALL
  SELECT 'time_fit_story_continuation_reservations.user_id'::text AS reference_path,
         count(*)::bigint AS soft_deleted_references
  FROM public.time_fit_story_continuation_reservations t
  JOIN auth.users au ON au.id = t.user_id
  WHERE au.deleted_at IS NOT NULL
  UNION ALL
  SELECT 'time_fit_story_generation_logs.user_id'::text AS reference_path,
         count(*)::bigint AS soft_deleted_references
  FROM public.time_fit_story_generation_logs t
  JOIN auth.users au ON au.id = t.user_id
  WHERE au.deleted_at IS NOT NULL
  UNION ALL
  SELECT 'user_episode_comment_likes.user_id'::text AS reference_path,
         count(*)::bigint AS soft_deleted_references
  FROM public.user_episode_comment_likes t
  JOIN auth.users au ON au.id = t.user_id
  WHERE au.deleted_at IS NOT NULL
  UNION ALL
  SELECT 'user_episode_comments.user_id'::text AS reference_path,
         count(*)::bigint AS soft_deleted_references
  FROM public.user_episode_comments t
  JOIN auth.users au ON au.id = t.user_id
  WHERE au.deleted_at IS NOT NULL
  UNION ALL
  SELECT 'user_recording_consents.user_id'::text AS reference_path,
         count(*)::bigint AS soft_deleted_references
  FROM public.user_recording_consents t
  JOIN auth.users au ON au.id = t.user_id
  WHERE au.deleted_at IS NOT NULL
  UNION ALL
  SELECT 'user_series_bookmarks.user_id'::text AS reference_path,
         count(*)::bigint AS soft_deleted_references
  FROM public.user_series_bookmarks t
  JOIN auth.users au ON au.id = t.user_id
  WHERE au.deleted_at IS NOT NULL
  UNION ALL
  SELECT 'user_series_reactions.user_id'::text AS reference_path,
         count(*)::bigint AS soft_deleted_references
  FROM public.user_series_reactions t
  JOIN auth.users au ON au.id = t.user_id
  WHERE au.deleted_at IS NOT NULL
  UNION ALL
  SELECT 'user_series_review_likes.user_id'::text AS reference_path,
         count(*)::bigint AS soft_deleted_references
  FROM public.user_series_review_likes t
  JOIN auth.users au ON au.id = t.user_id
  WHERE au.deleted_at IS NOT NULL
  UNION ALL
  SELECT 'user_series_reviews.user_id'::text AS reference_path,
         count(*)::bigint AS soft_deleted_references
  FROM public.user_series_reviews t
  JOIN auth.users au ON au.id = t.user_id
  WHERE au.deleted_at IS NOT NULL
  UNION ALL
  SELECT 'public.users.id'::text,
         count(*)::bigint
  FROM public.users pu JOIN auth.users au ON au.id = pu.id
  WHERE au.deleted_at IS NOT NULL
  UNION ALL
  SELECT 'storage.objects.owner'::text,
         count(*)::bigint
  FROM storage.objects o JOIN auth.users au ON au.id = o.owner
  WHERE au.deleted_at IS NOT NULL
  UNION ALL
  SELECT 'storage.objects.owner_id'::text,
         count(*)::bigint
  FROM storage.objects o JOIN auth.users au ON au.id::text = o.owner_id
  WHERE au.deleted_at IS NOT NULL
) counts
ORDER BY reference_path;

COMMIT;
