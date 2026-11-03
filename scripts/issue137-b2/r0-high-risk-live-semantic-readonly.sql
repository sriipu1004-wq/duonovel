-- #137 SOURCE/READ-ONLY high-risk semantic baseline check.
-- Input: CURRENT live PostgreSQL catalog only. No user rows, media, secrets.
-- NOT an authorization to install a migration or alter privileges.
-- A PASS says old high-risk intent is STILL present in the observed catalog,
-- NOT that any historical migration was executed, or that R18 is safe.
BEGIN READ ONLY;
WITH checks(area,check_id,observed) AS (
 VALUES
 ('RLS','series_canonical_publication',
 (SELECT count(*)=1 AND bool_and(qual LIKE '%publication_status%' AND qual LIKE '%author_id%' AND qual NOT LIKE '%is_public%')
 FROM pg_policies WHERE schemaname='public' AND tablename='series' AND policyname='series_select_public_or_owner')),
 ('RLS','old_is_public_series_policy_absent',
 NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='series' AND policyname='series_public_or_owner_select')),
 ('RLS','episodes_posted_publication',
 (SELECT count(*)=1 AND bool_and(qual LIKE '%publication_status%' AND qual LIKE '%posting_status%' AND qual LIKE '%is_published%')
 FROM pg_policies WHERE schemaname='public' AND tablename='episodes' AND policyname='episodes_public_or_owner_select')),
 ('RLS','recordings_public_source_episode',
 (SELECT count(*)=1 AND bool_and(qual LIKE '%publication_status%' AND qual LIKE '%posting_status%' AND qual LIKE '%is_published%' AND qual LIKE '%is_public%')
 FROM pg_policies WHERE schemaname='public' AND tablename='recordings' AND policyname='recordings_select_public_visible')),
 ('RLS','series_owner_update_checks_new_row',
 (SELECT count(*)>=1 AND bool_and(qual LIKE '%auth.uid()%' AND with_check LIKE '%auth.uid()%')
 FROM pg_policies WHERE schemaname='public' AND tablename='series' AND cmd='UPDATE')),
 ('RLS','private_library_owner_update_checks_new_row',
 (SELECT count(*)=1 AND bool_and(qual LIKE '%owner_user_id%' AND with_check LIKE '%owner_user_id%' AND roles::text LIKE '%authenticated%')
 FROM pg_policies WHERE schemaname='public' AND tablename='private_library_works' AND cmd='UPDATE')),
 ('RLS','consent_current_user_insert',
 (SELECT count(*)=1 AND bool_and(with_check LIKE '%auth.uid()%' AND with_check LIKE '%user_id%')
 FROM pg_policies WHERE schemaname='public' AND tablename='user_recording_consents' AND cmd='INSERT')),
 ('RLS','credit_ledger_owner_select',
 (SELECT count(*)=1 AND bool_and(qual LIKE '%auth.uid()%' AND qual LIKE '%user_id%')
 FROM pg_policies WHERE schemaname='public' AND tablename='credit_ledger' AND cmd='SELECT')),
 ('RLS','credit_purchase_lots_owner_select',
 (SELECT count(*)=1 AND bool_and(qual LIKE '%auth.uid()%' AND qual LIKE '%user_id%')
 FROM pg_policies WHERE schemaname='public' AND tablename='credit_purchase_lots' AND cmd='SELECT')),
 ('RPC','grant_credit_purchase_service_only',
 (SELECT has_function_privilege('service_role',p.oid,'EXECUTE')
 AND NOT has_function_privilege('anon',p.oid,'EXECUTE')
 AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE') AND p.prosecdef
 FROM pg_proc p WHERE p.oid=to_regprocedure('public.grant_credit_purchase(uuid,text,text,text,integer,timestamptz,text,jsonb)'))),
 ('RPC','reverse_credit_purchase_service_only',
 (SELECT has_function_privilege('service_role',p.oid,'EXECUTE')
 AND NOT has_function_privilege('anon',p.oid,'EXECUTE')
 AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE') AND p.prosecdef
 FROM pg_proc p WHERE p.oid=to_regprocedure('public.reverse_credit_purchase_full(text,text,text)'))),
 ('RPC','unlock_credit_service_only',
 (SELECT has_function_privilege('service_role',p.oid,'EXECUTE')
 AND NOT has_function_privilege('anon',p.oid,'EXECUTE')
 AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE') AND p.prosecdef
 FROM pg_proc p WHERE p.oid=to_regprocedure('public.unlock_public_episode_translation(uuid,uuid,text,text,text)'))),
 ('RPC','balance_read_signed_in_only',
 (SELECT has_function_privilege('authenticated',p.oid,'EXECUTE')
 AND NOT has_function_privilege('anon',p.oid,'EXECUTE') AND p.prosecdef
 FROM pg_proc p WHERE p.oid=to_regprocedure('public.get_credit_balance()'))),
 ('RPC','unlock_check_signed_in_only',
 (SELECT has_function_privilege('authenticated',p.oid,'EXECUTE')
 AND NOT has_function_privilege('anon',p.oid,'EXECUTE') AND p.prosecdef
 FROM pg_proc p WHERE p.oid=to_regprocedure('public.has_public_episode_translation_unlock(uuid,text)'))),
 ('RPC','retired_ai_generation_service_only',
 (SELECT has_function_privilege('service_role',p.oid,'EXECUTE')
 AND NOT has_function_privilege('anon',p.oid,'EXECUTE')
 AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE')
 FROM pg_proc p WHERE p.oid=to_regprocedure('public.reserve_time_fit_story_generation(uuid,uuid,text,text,text,integer,text,text,text,text,integer,integer,numeric,integer,numeric,numeric,numeric)'))),
 ('RPC','private_import_no_anonymous',
 (SELECT NOT has_function_privilege('anon',p.oid,'EXECUTE')
 AND has_function_privilege('authenticated',p.oid,'EXECUTE') AND p.prosecdef
 FROM pg_proc p WHERE p.oid=to_regprocedure('public.begin_private_library_import(text,text,text,text,text,integer,integer,integer)'))),
 ('BILLING','credit_append_only_trigger',
 EXISTS(SELECT 1 FROM pg_trigger t WHERE NOT t.tgisinternal AND t.tgrelid='public.credit_ledger'::regclass AND t.tgname='credit_ledger_append_only' AND t.tgenabled IN ('O','A'))),
 ('BILLING','grant_debt_reconciliation_in_function',
 (SELECT pg_get_functiondef(p.oid) LIKE '%v_debt_offset%' AND regexp_replace(pg_get_functiondef(p.oid), E'[[:space:]]+', ' ', 'g') LIKE '%v_remaining := p_credits - v_debt_offset%'
 FROM pg_proc p WHERE p.oid=to_regprocedure('public.grant_credit_purchase(uuid,text,text,text,integer,timestamptz,text,jsonb)'))),
 ('BILLING','unlock_append_only_body',
 (SELECT pg_get_functiondef(p.oid) LIKE '%insert into public.credit_ledger%'
 AND pg_get_functiondef(p.oid) NOT LIKE '%update public.credit_ledger%'
 FROM pg_proc p WHERE p.oid=to_regprocedure('public.unlock_public_episode_translation(uuid,uuid,text,text,text)'))),
 ('BILLING','credit_read_role_not_write',
 has_table_privilege('authenticated','public.credit_ledger','SELECT')
 AND NOT has_table_privilege('authenticated','public.credit_ledger','INSERT')
 AND NOT has_table_privilege('authenticated','public.credit_ledger','UPDATE')
 AND NOT has_table_privilege('authenticated','public.credit_ledger','DELETE')),
 ('STORAGE','illustration_owner_path_insert',
 (SELECT count(*)=1 AND bool_and(with_check LIKE '%author_id%' AND with_check LIKE '%foldername%' AND with_check LIKE '%illustrations%')
 FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
 AND policyname='Users can upload owned-series illustrations')),
 ('STORAGE','illustration_owner_path_update',
 (SELECT count(*)=1 AND bool_and(qual LIKE '%owner_id%' AND with_check LIKE '%author_id%' AND with_check LIKE '%foldername%')
 FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
 AND policyname='Users can update owned-series illustrations')),
 ('STORAGE','shared_bgm_client_write_denied',
 NOT has_table_privilege('authenticated','public.bgm_library','INSERT')
 AND NOT has_table_privilege('authenticated','public.bgm_library','UPDATE')
 AND NOT has_table_privilege('authenticated','public.bgm_library','DELETE')),
 ('STORAGE','public_recording_bucket_remains_public',
 (SELECT count(*)=1 AND bool_and(public IS TRUE) FROM storage.buckets WHERE id='recording-audio')),
 ('STORAGE','human_recording_bucket_stays_private',
 (SELECT count(*)=1 AND bool_and(public IS FALSE) FROM storage.buckets WHERE id='human-recording-audio')),
 ('PENDING','R18_restrictive_policies_not_yet_installed',
 (SELECT count(*)=0 FROM pg_policies WHERE schemaname='public' AND policyname LIKE 'issue137_b2_%')),
 ('PENDING','B2_R0_triggers_not_yet_installed',
 (SELECT count(*)=0 FROM pg_trigger WHERE NOT tgisinternal AND (tgname LIKE 'issue137_b2_%' OR tgname LIKE 'issue137_r0_%')))
), results AS (
 SELECT area,check_id,coalesce(observed,false) AS pass FROM checks
)
SELECT area,check_id,pass,
 CASE WHEN pass THEN 'BASELINE_OBSERVED_NOT_MIGRATION_PROVEN'
 ELSE 'BASELINE_MISMATCH_RELEASE_HOLD' END AS evidence_status,
 'RELEASE_HOLD_UNTIL_RIGHTS_RECOVERY_HISTORY_INDEPENDENT_GO_AND_EXACT_APPROVAL'::text AS release_gate
FROM results ORDER BY area,check_id;
ROLLBACK;
