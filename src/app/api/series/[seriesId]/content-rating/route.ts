import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  getSeriesContentWarningLocks,
  getSeriesContentWarnings,
  normalizeSeriesContentWarnings,
  type SeriesContentWarning,
} from "@/lib/contentRating";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ seriesId: string }>;
};

function normalizeCreatedAfter(value: unknown): number | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readRequestedWarnings(payload: Record<string, unknown>): SeriesContentWarning[] | null {
  if (payload.warnings !== undefined) {
    if (!Array.isArray(payload.warnings)) return null;
    const normalized = normalizeSeriesContentWarnings(payload.warnings);
    if (normalized.length !== payload.warnings.length) return null;
    return normalized;
  }

  if (payload.rating === "general") return [];
  if (payload.rating === "r18") return ["sexual_r18"];
  return null;
}

// PostgREST's eq operator accepts a PostgreSQL text[] literal. Use the
// exact raw DB snapshot, not a normalized subset: otherwise another editor's
// newly added warning/lock can be silently lost between SELECT and UPDATE.
// Only canonical enum values are admitted; no string interpolation of
// arbitrary user- or DB-supplied text into an array literal.
function exactWarningArrayPredicate(value: unknown): string | null {
  if (!Array.isArray(value) ||
      value.some(item => item !== "sexual_r18" && item !== "violence")) {
    return null;
  }
  return `{${value.join(",")}}`;
}

export async function POST(request: Request, context: RouteContext) {
  const { seriesId } = await context.params;
  const cleanSeriesId = seriesId.trim();
  if (!cleanSeriesId) {
    return NextResponse.json(
      { ok: false, error: "invalid_series_id" },
      { status: 400 }
    );
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_request" },
      { status: 400 }
    );
  }

  // An explicit emergency request atomically hides the work AND persists the
  // corrected rating. No claim is made that old PUBLIC Storage URLs are gone.
  if (payload.emergencyUnpublish !== undefined &&
      typeof payload.emergencyUnpublish !== "boolean") {
    return NextResponse.json(
      { ok: false, error: "invalid_emergency_unpublish" }, { status: 400 }
    );
  }
  const emergencyUnpublish = payload.emergencyUnpublish === true;
  const requestedWarnings = readRequestedWarnings(payload);
  if (!requestedWarnings) {
    return NextResponse.json(
      { ok: false, error: "invalid_content_warnings" },
      { status: 400 }
    );
  }

  const createdAfter = normalizeCreatedAfter(payload.createdAfter);
  if (payload.createdAfter !== undefined && createdAfter === null) {
    return NextResponse.json(
      { ok: false, error: "invalid_created_after" },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { ok: false, error: "authentication_required" },
      { status: 401 }
    );
  }

  const seriesResult = await supabase
    .from("series")
    .select("*")
    .eq("id", cleanSeriesId)
    .maybeSingle();

  if (seriesResult.error || !seriesResult.data) {
    return NextResponse.json(
      { ok: false, error: "series_not_found" },
      { status: 404 }
    );
  }

  const series = seriesResult.data as Record<string, unknown>;
  if (series.author_id !== user.id) {
    return NextResponse.json(
      { ok: false, error: "forbidden" },
      { status: 403 }
    );
  }

  if (createdAfter !== null) {
    const createdAt = Date.parse(String(series.created_at ?? ""));
    if (!Number.isFinite(createdAt) || createdAt < createdAfter) {
      return NextResponse.json(
        { ok: false, error: "series_not_created_after_pending_selection" },
        { status: 409 }
      );
    }
  }

  const previousPublication = series.publication_status;
  const previousRating = series.content_rating;
  const previousWarnings = exactWarningArrayPredicate(series.content_warnings);
  const previousLocks = exactWarningArrayPredicate(series.content_warning_locks);
  if ((previousPublication !== "public" && previousPublication !== "private") ||
      (previousRating !== "general" && previousRating !== "r18") ||
      previousWarnings === null || previousLocks === null) {
    return NextResponse.json(
      { ok: false, error: "stale_content_warning_state", persisted: false },
      { status: 409 }
    );
  }

  const lockedWarnings = getSeriesContentWarningLocks(series);
  // Emergency withdrawal corrects the work to R18, but must never drop a
  // recently added violence or other existing warning from another editor.
  const warnings = Array.from(
    new Set<SeriesContentWarning>([
      ...requestedWarnings, ...lockedWarnings,
      // The emergency operation is always PRIVATE + R18, even when an
      // authenticated direct API caller supplies [] or rating: "general".
      // Preserve existing and locked warnings; do not weaken ordinary edits.
      ...(emergencyUnpublish ? ["sexual_r18" as const] : []),
      ...(emergencyUnpublish ? getSeriesContentWarnings(series) : []),
    ])
  );
  const rating = warnings.includes("sexual_r18") ? "r18" : "general";

  const update = await supabase
    .from("series")
    .update({
      content_warnings: warnings,
      content_rating: rating,
      ...(emergencyUnpublish ? { publication_status: "private" } : {}),
    })
    .eq("id", cleanSeriesId)
    .eq("author_id", user.id)
    // Atomic optimistic compare-and-swap on every field that determines the
    // rating/warning merge. A concurrent author edit or emergency withdrawal
    // must affect zero rows rather than resurrect stale warnings or visibility.
    .eq("publication_status", previousPublication)
    .eq("content_rating", previousRating)
    .eq("content_warnings", previousWarnings)
    .eq("content_warning_locks", previousLocks)
    .select("publication_status, content_rating, content_warnings, content_warning_locks")
    .maybeSingle();

  if (update.error?.code === "23514" &&
      update.error.message?.includes("ISSUE137_PUBLIC_MEDIA_CONTAINMENT_REQUIRED")) {
    // A public Storage URL is not revoked by RLS or changing the content rating.
    // The candidate DB guard rejected the entire transaction: do not claim a
    // new rating was saved, and never include audio paths in the response.
    return NextResponse.json(
      { ok: false, error: "media_containment_required", persisted: false },
      { status: 409 }
    );
  }

  if (!update.error && !update.data) {
    return NextResponse.json(
      { ok: false, error: "stale_content_warning_state", persisted: false },
      { status: 409 }
    );
  }

  if (update.error || !update.data) {
    return NextResponse.json(
      {
        ok: false,
        error: "content_warnings_update_failed",
        message: update.error?.message ?? "コンテンツ警告を更新できませんでした。",
      },
      { status: 500 }
    );
  }

  try {
    // Next 16 Route Handlers cannot call updateTag (Server Actions only).
    // expire: 0 forces blocking refresh instead of stale-while-revalidate,
    // which must not expose pre-change general/public catalog metadata.
    revalidateTag("public-base-work-cards", { expire: 0 });
    if (emergencyUnpublish) {
      revalidatePath(`/works/${cleanSeriesId}`);
      // App/Next cache invalidation is NOT proof of old CDN/Storage URL recall.
    }
  } catch {
    // Database mutation has already committed. Do not report that it did not.
    return NextResponse.json(
      {
        ok: false,
        error: "cache_invalidation_failed",
        persisted: true,
        rating,
        ...(emergencyUnpublish ? {
          publicationStatus: update.data.publication_status,
          publicMediaStatus: "unverified",
        } : {}),
        warnings: normalizeSeriesContentWarnings(update.data.content_warnings),
        lockedWarnings: getSeriesContentWarningLocks(update.data),
      },
      { status: 503 }
    );
  }

  return NextResponse.json({
    ok: true,
    rating,
    ...(emergencyUnpublish ? {
      publicationStatus: update.data.publication_status,
      publicMediaStatus: "unverified",
    } : {}),
    warnings: normalizeSeriesContentWarnings(update.data.content_warnings),
    lockedWarnings: getSeriesContentWarningLocks(update.data),
  });
}
