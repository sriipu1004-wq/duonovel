# #137 legacy migration 51 + four old-format — read-only catalog reconciliation

**Evidence snapshot: 2026-11-03. Status: NONPRODUCTION / SOURCE CHECK COMPLETE; RELEASE HOLD.** This document is tied to main `848f8419c64b2954ae004397b5292edf0cb75236` and the connected Supabase project `nyxbnccuvmlzffgtdadi`. It is **not** permission to modify the hosted ledger, SQL, Storage, RLS, rights, app visibility or merge Draft PR #160.

## Evidence grading and findings

This phase inspected the SQL files of **51** 14-digit-name source files that have **no hosted ledger row by either exact version or exact migration name**, and **four** older non-14-digit source files (55 total). For each file we selected **one representative catalog reference actually related to its SQL operations**, then checked `pg_class`, `information_schema.columns`, `pg_proc`, `pg_policies` or `pg_trigger` **inside an explicit read-only hosted transaction**.

- **54/55 representative probes PRESENT.** The sole absent probe is old March RLS policy `public.series:series_public_or_owner_select`, which appears superseded because the live catalog instead has `series_select_public_or_owner`. That observation does **NOT** prove replacement RLS is semantically equivalent or safer.
- **55/55 migration executions remain UNVERIFIED as historical provenance.** A surviving table/column/function/policy does not prove which migration created it, whether DML/DDL from the original script fully ran, whether any later patch superseded its semantics, or whether stored user data is correct. Even `pg_proc` name-only probing does not verify overloaded signatures/body/privileges; later static and RLS audits are required.
- **High-impact areas:** R18/visibility, authorship/ownership, private-library contents, translation credits/purchase/quotas, old AI-generation functions (retired product feature; current function presence does not reactivate it), voice/consent and public Storage. No existing protections are removed in this stage.
- **Repo/hosted migration ledger recap**: main has **76** SQL files, 72 with 14-digit prefixes; hosted has 21 named/versioned statements. Only 4 version numbers match. All 17 remote-version-only rows map to same-name local files with different timestamps. Historical SQL comparison of the 21 stored statements: 5 exact MD5/length matches and 16 match after comment/whitespace/case stripping; that normalization is a *text heuristic*, NOT parse-level semantic proof. The other 51+4 do not have an equivalent row by version/name. Do not assume they were never applied.

### File-by-file READ-ONLY representative probes

“存在” means ONLY that the singled-out catalog object currently exists. **Not “migration applied.”** All 55 rows have `provenance: UNVERIFIED` in the machine-readable manifest; “old name absent” is not by itself a leak.

| # | Source file (main) | Representative actual catalog probe | Observation | Area |
|---:|---|---|---|---|
| 1 | `20260322120000_add_series_tags_canonical_source.sql` | `column:public.series.tags` | 存在 | data |
| 2 | `20260326000100_add_series_recording_permission_mode.sql` | `column:public.series.recording_permission_mode` | 存在 | rights |
| 3 | `20260326000200_create_series_recording_requests.sql` | `relation:public.series_recording_requests` | 存在 | rights |
| 4 | `20260326_manage_rls_series_episodes.sql` | `policy:public.series:series_public_or_owner_select` | 旧名不在・後継候補あり | rls |
| 5 | `20260327_add_bgm_settings_json.sql` | `column:public.series.bgm_settings` | 存在 | data |
| 6 | `20260328230000_add_episode_rls.sql` | `policy:public.episodes:episodes_select_own_series` | 存在 | rls |
| 7 | `20260329043000_create_bgm_library.sql` | `relation:public.bgm_library` | 存在 | data |
| 8 | `20260329043000_create_user_series_bookmarks.sql` | `relation:public.user_series_bookmarks` | 存在 | ownership |
| 9 | `202603290730_create_user_series_reactions.sql` | `relation:public.user_series_reactions` | 存在 | ownership |
| 10 | `20260330090000_add_user_series_reviews.sql` | `relation:public.user_series_reviews` | 存在 | ownership |
| 11 | `20260331143000_add_bgm_library_favorites.sql` | `relation:public.bgm_library_favorites` | 存在 | ownership |
| 12 | `20260331_001_effect_foundation.sql` | `column:public.series.effect_settings` | 存在 | data |
| 13 | `20260401110000_add_episode_is_published.sql` | `column:public.episodes.is_published` | 存在 | visibility |
| 14 | `20260401183000_add_series_publication_and_episode_posting_status.sql` | `column:public.series.publication_status` | 存在 | visibility |
| 15 | `20260401195000_add_series_rls_policies.sql` | `policy:public.series:series_select_public_or_owner` | 存在 | rls |
| 16 | `20260401213000_create_user_series_review_likes.sql` | `relation:public.user_series_review_likes` | 存在 | ownership |
| 17 | `20260401223000_add_episode_post_dates.sql` | `column:public.episodes.posted_at` | 存在 | visibility |
| 18 | `20260401223000_create_episode_comments_and_likes.sql` | `relation:public.user_episode_comments` | 存在 | ownership |
| 19 | `20260401235000_add_series_reaction_visibility_flags.sql` | `column:public.series.reviews_enabled` | 存在 | visibility |
| 20 | `20260404113000_create_popularity_event_tables.sql` | `relation:public.series_view_events` | 存在 | analytics |
| 21 | `20260404120000_add_series_genres_canonical_source.sql` | `column:public.series.genres` | 存在 | data |
| 22 | `20260416190000_create_user_recording_consents.sql` | `relation:public.user_recording_consents` | 存在 | rights |
| 23 | `20260419000000_add_series_popularity_daily.sql` | `relation:public.series_popularity_daily` | 存在 | analytics |
| 24 | `20260421183000_add_nemo_generation_queue.sql` | `relation:public.nemo_generation_queue` | 存在 | audio |
| 25 | `20260422013000_add_profile_links_and_social_relations.sql` | `relation:public.author_follows` | 存在 | ownership |
| 26 | `20260707143000_add_time_fit_global_generation_limits.sql` | `function:public.reserve_time_fit_story_generation` | 存在 | retired-ai |
| 27 | `20260805150000_add_ai_story_continuations.sql` | `relation:public.time_fit_story_continuation_reservations` | 存在 | retired-ai |
| 28 | `20260809070000_add_time_fit_prompt_tag_usage.sql` | `relation:public.time_fit_story_prompt_tag_usage` | 存在 | retired-ai |
| 29 | `20260809170000_add_episode_translations.sql` | `relation:public.episode_translations` | 存在 | translation |
| 30 | `20260809175500_add_series_translation_permission.sql` | `column:public.series.translation_permission_mode` | 存在 | rights |
| 31 | `20260810204500_add_generated_story_translations.sql` | `relation:public.generated_story_translations` | 存在 | retired-ai |
| 32 | `20260811193000_add_r18_content_controls.sql` | `column:public.series.content_rating` | 存在 | r18 |
| 33 | `20260811195500_add_series_content_warnings.sql` | `column:public.series.content_warnings` | 存在 | r18 |
| 34 | `20260821120000_generalize_translation_languages.sql` | `column:public.episode_translations.source_language` | 存在 | translation |
| 35 | `20260824123000_create_private_library_txt_import.sql` | `relation:public.private_library_works` | 存在 | private |
| 36 | `20260826123000_add_private_library_chapter_translations.sql` | `relation:public.private_library_chapter_translations` | 存在 | private |
| 37 | `20260827120000_expand_private_library_long_form_import.sql` | `column:public.private_library_works.section_count` | 存在 | private |
| 38 | `20260827121000_add_private_library_reading_progress.sql` | `relation:public.private_library_reading_progress` | 存在 | private |
| 39 | `20260827122000_add_private_library_glossary.sql` | `relation:public.private_library_glossary_terms` | 存在 | private |
| 40 | `20260827123000_add_ai_action_quotas_and_entitlements.sql` | `relation:public.libread_user_entitlements` | 存在 | billing |
| 41 | `20260827124000_add_private_library_word_explanations.sql` | `relation:public.private_library_word_explanations` | 存在 | private |
| 42 | `20260827125000_share_free_generation_translation_quota.sql` | `function:public.reserve_libread_daily_ai_action` | 存在 | billing |
| 43 | `20260827126000_track_word_explanation_actual_cost.sql` | `column:public.private_library_word_explanations.actual_cost_jpy` | 存在 | private |
| 44 | `20260828120000_create_bilingual_word_explanations.sql` | `relation:public.bilingual_word_explanations` | 存在 | private |
| 45 | `20260829120000_add_stripe_subscriptions.sql` | `relation:public.libread_billing_customers` | 存在 | billing |
| 46 | `20260829130000_limit_free_private_library_works.sql` | `trigger:public.private_library_works:trg_enforce_private_library_work_limit` | 存在 | private |
| 47 | `20260911120000_count_private_library_import_usage.sql` | `trigger:public.private_library_works:count_private_library_import_usage` | 存在 | private |
| 48 | `20260912100000_add_public_translation_unlocks_credit_ledger.sql` | `relation:public.credit_ledger` | 存在 | billing |
| 49 | `20260912103000_harden_translation_credit_rpc_privileges.sql` | `function:public.get_credit_balance` | 存在 | billing |
| 50 | `20260912153000_add_series_source_language.sql` | `column:public.series.source_language` | 存在 | translation |
| 51 | `20260913113000_add_series_translation_glossary.sql` | `relation:public.series_translation_glossary_entries` | 存在 | translation |
| 52 | `20260914070000_add_public_translation_credit_runtime.sql` | `relation:public.credit_purchase_lots` | 存在 | billing |
| 53 | `20260914071000_enforce_credit_purchase_expiration.sql` | `column:public.credit_purchase_lots.expired_at` | 存在 | billing |
| 54 | `20260914072000_fix_credit_unlock_append_only.sql` | `function:public.unlock_public_episode_translation` | 存在 | billing |
| 55 | `20260914073000_reconcile_credit_purchase_debt.sql` | `function:public.grant_credit_purchase` | 存在 | billing |

## Repository filename hazards — additional independent blocker

Direct scan of main `supabase/migrations` (not just the unpaired 55) found:

- **Two duplicate version prefixes:** `20260329043000` shared by `create_bgm_library` / `create_user_series_bookmarks`; `20260401223000` shared by `add_episode_post_dates` / `create_episode_comments_and_likes`.
- **Four calendar-invalid 14-digit timestamps:** `20260827126000_track_word_explanation_actual_cost.sql`, `20260915206000_harden_series_bookmark_mutations.sql`, `20260915207000_harden_recording_visibility.sql`, `20260915208000_index_display_name_uniqueness.sql` (invalid minute field). The latter three have name-matched remote historical entries; changing the local prefix now would not prove history alignment.
- **Four non-14-digit legacy names:** `20260326_manage_rls_series_episodes.sql`, `20260327_add_bgm_settings_json.sql`, `202603290730_create_user_series_reactions.sql`, `20260331_001_effect_foundation.sql`. These were individually source-inspected and catalog-probed.

All are **RELEASE HOLD** for blind CLI migration replay. Do not rename, delete, consolidate, or mark old versions applied/reverted without separately scoped approval and provenance evidence.

## Source-only release precheck (no remote writes)

- `scripts/issue137-b2/r0-legacy-catalog-probes.json`: 55 source→representative object→recorded boolean mappings, pinned current main/project/date and deliberately `UNVERIFIED` provenance for every row.
- `scripts/issue137-b2/r0-hosted-ledger-snapshot.json`: **21 version/name records only**, no SQL secrets or user data; a 2026-11-03 snapshot, not a live authoritative ledger.
- `scripts/issue137-b2/r0-legacy-history-preflight.mjs --self-test`: **offline only**, refuses manifest coverage drift, duplicate/unexpected snapshot mappings, silently reinterpreting observed catalog presence as “applied”, changed filename anomaly counts and unaccounted files; emits a `RELEASE_HOLD` marker even on source PASS. It contains no provider credential usage, network request, SQL execution or migration repair.
- `... --emit-readonly-sql` outputs a `BEGIN READ ONLY; ... ROLLBACK;` representative 55-entry comparison for separately authorized read-only catalog inspections. This is an aid, not the full migration-history repair algorithm or a production gate.
- `scripts/issue137-b2/r0-b2-release-metadata-readonly.sql`: **source-only** release preflight against live catalog metadata, checking required columns and relations, existing `issue137_b2/r0` collisions, RLS presence, public summary invoker view, `recording-audio` and `human-recording-audio` public status, and total remote ledger rows. Tested read-only on 2026-11-03: zero missing required relations/columns, zero installed B2/R0 triggers/policies, 21 ledger versions, expected bucket and summary configuration, status **`BASELINE_METADATA_COMPATIBLE_RELEASE_STILL_HOLD`**. This “compatible” status is only a *metadata snapshot*, NOT approval to install the unified SQL candidate. The query intentionally returns a separate **`RELEASE_HOLD_...`** output even when current metadata matches.

## Safe integration evaluation (proposal; no rollout approved)

| Choice | Mechanically possible? | Evidence-based recommendation |
| --- | --- | --- |
| Normal `supabase db push` of the current 76 files | Unsafe with unresolved duplicates, invalid calendar versions, 51 unpaired source files and 17 retimestamped records | **NO** |
| Blanket `supabase migration repair --status applied` for historical files | Alters the ledger without proving actual SQL operations or permissions; could suppress required changes or represent false history | **NO** |
| New single **current-schema** B2/R0 SQL migration, pinned to reviewed HEAD, with explicit targeted application after baseline reconciliation | Technically feasible in principle but actual hosted dependency / Storage provider and rollback have not been validated | **Preferred design candidate, still HOLD** |
| Preserve current main/Production, keep Draft and investigate missing provenance / special cases | No additional deployment/security regression; unresolved public audio risk remains | **Current safe operational default** |

**Before real Production:** establish a complete semantic object-by-object and privilege RLS matrix for all security/billing-critical legacy effects, examine exact historic SQL execution provenance where available, test one migration against a source-equivalent *isolated* database with actual storage/role topology and rollback/restore bytes; reconcile broad #153 vs #160, emergency Owner PRIVATE+R18 / Reader & Search, signed bearer/CDN and service_role/S3 concurrency. Obtain a stable fixed-HEAD independent security, rights and DB review, and **separate explicit owner approval** for merge and each hosted SQL/history/Storage/rights action. If any item remains unverified, keep `merge HOLD`.

**Preserved:** No migration-history repair, Production SQL/write, hosted Storage object access, signed URL download, PII readout, R18/publication/rights changes or merge. Baseline source and deployment are unchanged by this document.

Additional context: [Issue #137 last ledger checkpoint](https://github.com/sriipu1004-wq/duonovel/issues/137#issuecomment-6596458567), [migration rollout/rollback runbook](issue137-b2-r0-migration-rollout-rollback.md), [Supabase migration repair reference](https://supabase.com/docs/reference/cli/supabase-migration-repair).
