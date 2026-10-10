"use server";

import { updateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isValidSeriesId } from "@/lib/write/ownedSeriesPayload";
import {
  isOwnedEpisodeSavePayload,
  type OwnedEpisodeSavePayload,
} from "@/lib/write/ownedEpisodePayload";

const PUBLIC_WORKS_CACHE_TAG = "public-base-work-cards";

type EpisodeSaveResult =
  | { ok: true; episodeId: string }
  | { ok: false; code: "cache_invalidation_failed"; persisted: true; episodeId: string }
  | {
      ok: false;
      code: "invalid_request" | "authentication_required" | "not_found_or_forbidden" | "save_failed";
      persisted: false;
    };

/**
 * Server-controlled episode create/update for the existing author editor.
 * The user's Supabase session and database RLS remain authoritative.
 * This does not cover scheduler jobs, deletion or external/direct DB clients.
 */
export async function saveOwnedEpisode(
  mode: "create" | "edit",
  episodeId: string | null,
  candidate: unknown
): Promise<EpisodeSaveResult> {
  if (
    (mode !== "create" && mode !== "edit") ||
    (mode === "create" && episodeId !== null) ||
    (mode === "edit" && (typeof episodeId !== "string" || !isValidSeriesId(episodeId))) ||
    !isOwnedEpisodeSavePayload(candidate)
  ) {
    return { ok: false, code: "invalid_request", persisted: false };
  }

  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) {
    return { ok: false, code: "authentication_required", persisted: false };
  }

  // Verify series ownership even for updates; episode INSERT/UPDATE RLS
  // independently checks ownership as a second database-side boundary.
  const { data: ownedSeries, error: ownerError } = await supabase
    .from("series")
    .select("id")
    .eq("id", candidate.series_id)
    .eq("author_id", auth.user.id)
    .maybeSingle();
  if (ownerError) return { ok: false, code: "save_failed", persisted: false };
  if (!ownedSeries) return { ok: false, code: "not_found_or_forbidden", persisted: false };

  let updateFields: OwnedEpisodeSavePayload = candidate;
  if (mode === "edit") {
    const { data: before, error: readError } = await supabase
      .from("episodes")
      .select("id, posted_at, last_edited_at, posting_status, is_published")
      .eq("id", episodeId!)
      .eq("series_id", candidate.series_id)
      .eq("episode_number", candidate.episode_number)
      .maybeSingle();

    if (readError) return { ok: false, code: "save_failed", persisted: false };
    if (!before) return { ok: false, code: "not_found_or_forbidden", persisted: false };
    const now = new Date().toISOString();
    updateFields = {
      ...candidate,
      posted_at: before.posted_at ?? (candidate.posting_status === "posted" ? now : null),
      last_edited_at:
        before.is_published && before.posting_status === "posted"
          ? now
          : before.last_edited_at ?? null,
    };
  } else {
    updateFields = {
      ...candidate,
      posted_at: candidate.posting_status === "posted" ? new Date().toISOString() : null,
      last_edited_at: null,
    };
  }

  const write = mode === "create"
    ? await supabase.from("episodes").insert(updateFields).select("id").single()
    : await supabase
        .from("episodes")
        .update(updateFields)
        .eq("id", episodeId!)
        .eq("series_id", candidate.series_id)
        .eq("episode_number", candidate.episode_number)
        .select("id")
        .maybeSingle();

  if (write.error) return { ok: false, code: "save_failed", persisted: false };
  if (!write.data?.id) return { ok: false, code: "not_found_or_forbidden", persisted: false };

  try {
    // Must invalidate synchronously in the Server Action; never 'max' SWR
    // for draft/unpublished transitions.
    updateTag(PUBLIC_WORKS_CACHE_TAG);
  } catch {
    return {
      ok: false,
      code: "cache_invalidation_failed",
      persisted: true,
      episodeId: write.data.id,
    };
  }

  return { ok: true, episodeId: write.data.id };
}
