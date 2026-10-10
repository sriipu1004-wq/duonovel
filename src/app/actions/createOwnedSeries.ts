"use server";

import { updateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { validateOwnedSeriesCreationPayload } from "@/lib/write/ownedSeriesCreatePayload";

const PUBLIC_WORKS_CACHE_TAG = "public-base-work-cards";

type CreateResult =
  | { ok: true; persisted: false; seriesId: string }
  | { ok: false; persisted: true; code: "cache_invalidation_failed"; seriesId: string }
  | { ok: false; persisted: false; code: "invalid_request" | "authentication_required" | "save_failed" };

/**
 * Create through the request's authenticated Supabase session, never an
 * admin/service role. Both author-create forms must use this entrypoint.
 * Source language and R18 warnings are stored in the same INSERT as the work.
 */
export async function createOwnedSeries(candidate: unknown): Promise<CreateResult> {
  const validated = validateOwnedSeriesCreationPayload(candidate);
  if (!validated) {
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
    .insert({ ...validated, author_id: auth.user.id })
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

  return { ok: true, persisted: false, seriesId: data.id };
}
