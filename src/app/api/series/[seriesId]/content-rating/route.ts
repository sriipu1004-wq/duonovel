import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getSeriesContentWarningLocks,
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

  const lockedWarnings = getSeriesContentWarningLocks(series);
  const warnings = Array.from(
    new Set<SeriesContentWarning>([...requestedWarnings, ...lockedWarnings])
  );
  const rating = warnings.includes("sexual_r18") ? "r18" : "general";

  const update = await supabase
    .from("series")
    .update({
      content_warnings: warnings,
      content_rating: rating,
    })
    .eq("id", cleanSeriesId)
    .eq("author_id", user.id)
    .select("content_rating, content_warnings, content_warning_locks")
    .single();

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

  return NextResponse.json({
    ok: true,
    rating,
    warnings: normalizeSeriesContentWarnings(update.data.content_warnings),
    lockedWarnings: getSeriesContentWarningLocks(update.data),
  });
}
