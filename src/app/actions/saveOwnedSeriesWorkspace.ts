"use server";

import { updateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isValidSeriesId, isOwnedSeriesWorkspacePayload, preserveSeriesPublicDomainMetadata } from "@/lib/write/ownedSeriesPayload";

type SaveResult =
  | { ok: true }
  | { ok: false; code: "invalid_request" | "authentication_required" | "not_found_or_forbidden" | "save_failed" | "cache_invalidation_failed" | "stale_publication_state"; persisted: boolean };

const PUBLIC_WORKS_CACHE_TAG = "public-base-work-cards";
/**
 * Canonical edit-workspace save entrypoint. Does not use a service role:
 * Supabase author RLS continues to enforce ownership.
 *
 * Scope intentionally excludes series creation and episode writes.
 * Their client-side mutation paths must be migrated separately before
 * declaring global publication/cache consistency.
 */
export async function saveOwnedSeriesWorkspace(
  seriesId: string,
  candidate: unknown,
  expectedPublicationStatus: "public" | "private"
): Promise<SaveResult> {
  if (typeof seriesId !== "string" || !isValidSeriesId(seriesId) ||
      !isOwnedSeriesWorkspacePayload(candidate) ||
      !["public", "private"].includes(expectedPublicationStatus)) {
    return { ok: false, code: "invalid_request", persisted: false };
  }

  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) {
    return { ok: false, code: "authentication_required", persisted: false };
  }

  // Preserve reviewed Public Domain provenance currently stored in the DB.
  // The editor serializes presentation settings without this metadata.
  const { data: previous, error: previousError } = await supabase
    .from("series")
    .select("id, effect_settings, publication_status")
    .eq("id", seriesId)
    .eq("author_id", auth.user.id)
    .maybeSingle();
  if (previousError) return { ok: false, code: "save_failed", persisted: false };
  if (!previous) return { ok: false, code: "not_found_or_forbidden", persisted: false };
  if (previous.publication_status !== expectedPublicationStatus) {
    return { ok: false, code: "stale_publication_state", persisted: false };
  }

  const safeFields = {
    ...candidate,
    effect_settings: preserveSeriesPublicDomainMetadata(
      candidate.effect_settings,
      previous.effect_settings
    ),
  };

  const { data, error } = await supabase
    .from("series")
    .update(safeFields)
    .eq("id", seriesId)
    .eq("author_id", auth.user.id)
    // A concurrent emergency hide or another-tab publication change
    // must make this update affect zero rows, not re-publish stale state.
    .eq("publication_status", expectedPublicationStatus)
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, code: "save_failed", persisted: false };
  if (!data) return { ok: false, code: "stale_publication_state", persisted: false };

  try {
    // Next 16 Server Actions: force an immediate expiration, not 'max'
    // stale-while-revalidate (unsafe for public->private transitions).
    updateTag(PUBLIC_WORKS_CACHE_TAG);
  } catch {
    // The DB mutation has already committed. Do NOT retry it or tell the
    // client nothing was saved; surface an explicit partial-success state.
    return { ok: false, code: "cache_invalidation_failed", persisted: true };
  }

  return { ok: true };
}
