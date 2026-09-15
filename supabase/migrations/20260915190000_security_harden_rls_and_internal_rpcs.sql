-- Security hardening after the feature freeze.
--
-- SEC-01: internal SECURITY DEFINER RPCs were executable through the public
-- PostgREST roles even though the application only invokes them from trusted
-- server-side/service-role code.
-- SEC-02: legacy is_public-based SELECT policies could make canonical private
-- series (and their episodes) readable because is_public historically defaults
-- to true.
--
-- This migration is additive/permission-only: it does not rewrite user data.

begin;

-- ---------------------------------------------------------------------------
-- Canonical publication RLS
-- ---------------------------------------------------------------------------

-- Two permissive SELECT policies existed on series. PostgreSQL ORs permissive
-- policies, so the legacy is_public policy weakened the newer
-- publication_status policy.
drop policy if exists series_public_or_owner_select on public.series;
drop policy if exists series_select_public_or_owner on public.series;

create policy series_select_public_or_owner
on public.series
for select
to public
using (
  author_id = auth.uid()
  or publication_status = 'public'
);

-- Public episode access must follow both canonical series publication state and
-- canonical episode posting state. Owners retain access to their own episodes.
drop policy if exists episodes_public_or_owner_select on public.episodes;

create policy episodes_public_or_owner_select
on public.episodes
for select
to public
using (
  exists (
    select 1
    from public.series s
    where s.id = episodes.series_id
      and (
        s.author_id = auth.uid()
        or (
          s.publication_status = 'public'
          and episodes.posting_status = 'posted'
          and episodes.is_published = true
        )
      )
  )
);

-- ---------------------------------------------------------------------------
-- Server-contract SECURITY DEFINER RPCs
-- ---------------------------------------------------------------------------
-- These functions accept trusted server-selected identifiers, quotas, model
-- names, costs, or mutation payloads. They are not public API contracts.
-- Revoke the implicit PUBLIC privilege and make them service-role-only.

revoke execute on function public.reserve_time_fit_story_continuation(uuid, uuid, text, text, text, uuid, uuid, integer, text, text, text, text, integer, integer, numeric, integer, numeric, numeric, numeric) from public, anon, authenticated;
grant execute on function public.reserve_time_fit_story_continuation(uuid, uuid, text, text, text, uuid, uuid, integer, text, text, text, text, integer, integer, numeric, integer, numeric, numeric, numeric) to service_role;

revoke execute on function public.complete_time_fit_story_continuation(uuid, uuid, uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.complete_time_fit_story_continuation(uuid, uuid, uuid, uuid, text, text, text) to service_role;

revoke execute on function public.fail_time_fit_story_continuation(uuid, uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.fail_time_fit_story_continuation(uuid, uuid, text, text, boolean) to service_role;

revoke execute on function public.reserve_time_fit_story_generation(uuid, uuid, text, text, text, integer, text, text, text, text, integer, integer, numeric, integer, numeric, numeric, numeric) from public, anon, authenticated;
grant execute on function public.reserve_time_fit_story_generation(uuid, uuid, text, text, text, integer, text, text, text, text, integer, integer, numeric, integer, numeric, numeric, numeric) to service_role;

revoke execute on function public.reserve_libread_daily_ai_action(uuid, uuid, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.reserve_libread_daily_ai_action(uuid, uuid, text, text, integer, integer) to service_role;

revoke execute on function public.release_libread_daily_ai_action(uuid) from public, anon, authenticated;
grant execute on function public.release_libread_daily_ai_action(uuid) to service_role;

revoke execute on function public.get_libread_daily_ai_usage(uuid, text, integer, integer, integer, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.get_libread_daily_ai_usage(uuid, text, integer, integer, integer, integer, integer, integer) to service_role;

revoke execute on function public.reserve_libread_subscriber_monthly_ai_budget(uuid, uuid, text, numeric, numeric) from public, anon, authenticated;
grant execute on function public.reserve_libread_subscriber_monthly_ai_budget(uuid, uuid, text, numeric, numeric) to service_role;

revoke execute on function public.release_libread_subscriber_monthly_ai_budget(uuid) from public, anon, authenticated;
grant execute on function public.release_libread_subscriber_monthly_ai_budget(uuid) to service_role;

revoke execute on function public.reserve_episode_translation(uuid, uuid, text, text, uuid, text, integer, integer, integer, numeric, integer, numeric) from public, anon, authenticated;
grant execute on function public.reserve_episode_translation(uuid, uuid, text, text, uuid, text, integer, integer, integer, numeric, integer, numeric) to service_role;

revoke execute on function public.reserve_episode_translation_v2(uuid, uuid, text, text, text, uuid, text, integer, integer, integer, numeric, integer, numeric) from public, anon, authenticated;
grant execute on function public.reserve_episode_translation_v2(uuid, uuid, text, text, text, uuid, text, integer, integer, integer, numeric, integer, numeric) to service_role;

revoke execute on function public.reserve_generated_story_translation(uuid, text, text, text, uuid, text, integer, integer, integer, numeric, integer, numeric) from public, anon, authenticated;
grant execute on function public.reserve_generated_story_translation(uuid, text, text, text, uuid, text, integer, integer, integer, numeric, integer, numeric) to service_role;

revoke execute on function public.reserve_generated_story_translation_v2(uuid, text, text, text, text, uuid, text, integer, integer, integer, numeric, integer, numeric) from public, anon, authenticated;
grant execute on function public.reserve_generated_story_translation_v2(uuid, text, text, text, text, uuid, text, integer, integer, integer, numeric, integer, numeric) to service_role;

revoke execute on function public.reserve_private_library_chapter_translation(uuid, uuid, text, text, text, uuid, text, integer, integer, integer, numeric, integer, numeric) from public, anon, authenticated;
grant execute on function public.reserve_private_library_chapter_translation(uuid, uuid, text, text, text, uuid, text, integer, integer, integer, numeric, integer, numeric) to service_role;

revoke execute on function public.translation_budget_snapshot(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.translation_budget_snapshot(timestamptz, timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- Session-bound private-library SECURITY DEFINER RPCs
-- ---------------------------------------------------------------------------
-- These functions authenticate/authorize with auth.uid() internally and are
-- intentionally callable by signed-in users. Remove anonymous/PUBLIC execution
-- while preserving authenticated and service-role use.

revoke execute on function public.abort_private_library_import(uuid) from public, anon;
grant execute on function public.abort_private_library_import(uuid) to authenticated, service_role;

revoke execute on function public.append_private_library_import_units(uuid, integer, jsonb) from public, anon;
grant execute on function public.append_private_library_import_units(uuid, integer, jsonb) to authenticated, service_role;

revoke execute on function public.begin_private_library_import(text, text, text, text, text, integer, integer, integer) from public, anon;
grant execute on function public.begin_private_library_import(text, text, text, text, text, integer, integer, integer) to authenticated, service_role;

revoke execute on function public.complete_private_library_import(uuid) from public, anon;
grant execute on function public.complete_private_library_import(uuid) to authenticated, service_role;

revoke execute on function public.count_private_library_import_usage() from public, anon;
grant execute on function public.count_private_library_import_usage() to authenticated, service_role;

revoke execute on function public.import_private_library_txt(text, text, text, text, jsonb) from public, anon;
grant execute on function public.import_private_library_txt(text, text, text, text, jsonb) to authenticated, service_role;

revoke execute on function public.list_private_library_sections(uuid, integer, integer) from public, anon;
grant execute on function public.list_private_library_sections(uuid, integer, integer) to authenticated, service_role;

revoke execute on function public.update_private_library_reading_progress(uuid, numeric, integer) from public, anon;
grant execute on function public.update_private_library_reading_progress(uuid, numeric, integer) to authenticated, service_role;

commit;
