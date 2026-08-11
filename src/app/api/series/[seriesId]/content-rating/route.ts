import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  normalizeSeriesContentRating,
  type SeriesContentRating,
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

function parseRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object") return value as Record<string, unknown>;
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function parseTags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(String).map((tag) => tag.trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value.split(/[\n,、]/u).map((tag) => tag.trim()).filter(Boolean);
  }
  return [];
}

function isAiGenerated(series: Record<string, unknown>): boolean {
  const tags = parseTags(series.tags);
  const settings = parseRecord(series.effect_settings ?? series.effectSettings);
  return (
    tags.includes("AI生成") ||
    settings?.source === "time_fit_ai_story" ||
    settings?.aiGenerated === true ||
    settings?.authorName === "AI生成"
  );
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

  if (payload.rating !== "general" && payload.rating !== "r18") {
    return NextResponse.json(
      { ok: false, error: "invalid_content_rating" },
      { status: 400 }
    );
  }
  const rating = payload.rating as SeriesContentRating;

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

  if (rating === "r18" && isAiGenerated(series)) {
    return NextResponse.json(
      {
        ok: false,
        error: "ai_generated_r18_forbidden",
        message: "AI生成作品は全年齢設定で固定されています。",
      },
      { status: 409 }
    );
  }

  const update = await supabase
    .from("series")
    .update({ content_rating: rating })
    .eq("id", cleanSeriesId)
    .eq("author_id", user.id)
    .select("content_rating")
    .single();

  if (update.error || !update.data) {
    return NextResponse.json(
      {
        ok: false,
        error: "content_rating_update_failed",
        message: update.error?.message ?? "対象年齢を更新できませんでした。",
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    rating: normalizeSeriesContentRating(update.data.content_rating),
  });
}
