"use server";

import { updateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isValidSeriesId, isOwnedSeriesWorkspacePayload } from "@/lib/write/ownedSeriesPayload";

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
  candidate: unknown
): Promise<SaveResult> {
  if (typeof seriesId !== "string" || !isValidSeriesId(seriesId) || !isOwnedSeriesWorkspacePayload(candidate)) {
    return { ok: false, code: "invalid_request", persisted: false };
  }

  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) {
    return { ok: false, code: "authentication_required", persisted: false };
  }

  const { data, error } = await supabase
    .from("series")
    .update(candidate)
    .eq("id", seriesId)
    .eq("author_id", auth.user.id)
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, code: "save_failed", persisted: false };
  if (!data) return { ok: false, code: "not_found_or_forbidden", persisted: false };

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
