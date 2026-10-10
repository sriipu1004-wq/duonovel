"use server";

import { updateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isOwnedSeriesWorkspacePayload } from "@/lib/write/ownedSeriesPayload";

const PUBLIC_WORKS_CACHE_TAG = "public-base-work-cards";

type CreateResult =
  | { ok: true; seriesId: string }
  | { ok: false; persisted: true; code: "cache_invalidation_failed"; seriesId: string }
  | { ok: false; persisted: false; code: "invalid_request" | "authentication_required" | "save_failed" };

/**
 * Create through the request's authenticated Supabase session, never an
 * admin/service role. Both author-create forms must use this entrypoint.
 * The existing post-create source-language bridge remains unchanged.
 */
export async function createOwnedSeries(candidate: unknown): Promise<CreateResult> {
  if (!isOwnedSeriesWorkspacePayload(candidate)) {
    return { ok: false, persisted: false, code: "invalid_request" };
  }

  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) {
    return { ok: false, persisted: false, code: "authentication_required" };
  }

  // The owner is determined from the verified user, not caller-controlled
  // metadata. The existing series INSERT WITH CHECK RLS is a second boundary.
  const { data, error } = await supabase
    .from("series")
    .insert({ ...candidate, author_id: auth.user.id })
    .select("id")
    .single();

  if (error || !data?.id) {
    return { ok: false, persisted: false, code: "save_failed" };
  }

  try {
    // New public works must become discoverable without waiting for the
    // base-card cache's 60-second TTL. Avoid SWR for public visibility.
    updateTag(PUBLIC_WORKS_CACHE_TAG);
  } catch {
    // The create already committed; do not automatically repeat an INSERT.
    return { ok: false, persisted: true, code: "cache_invalidation_failed", seriesId: data.id };
  }

  return { ok: true, seriesId: data.id };
}
