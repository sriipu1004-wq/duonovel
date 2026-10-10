import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ seriesId: string }>;
};

type TranslationPermissionMode = "open" | "closed";

function normalizeMode(value: unknown): TranslationPermissionMode | null {
  if (value === "open" || value === "closed") {
    return value;
  }

  return null;
}

function normalizeCreatedAfter(value: unknown): number | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
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

  const mode = normalizeMode(payload.mode);

  if (!mode) {
    return NextResponse.json(
      { ok: false, error: "invalid_translation_permission_mode" },
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
  const { data: authData, error: authError } = await supabase.auth.getUser();
  const user = authData.user ?? null;

  if (authError || !user) {
    return NextResponse.json(
      { ok: false, error: "authentication_required" },
      { status: 401 }
    );
  }

  const seriesResult = await supabase
    .from("series")
    .select("id, author_id, created_at")
    .eq("id", cleanSeriesId)
    .maybeSingle();

  if (seriesResult.error || !seriesResult.data) {
    return NextResponse.json(
      { ok: false, error: "series_not_found" },
      { status: 404 }
    );
  }

  if (seriesResult.data.author_id !== user.id) {
    return NextResponse.json(
      { ok: false, error: "forbidden" },
      { status: 403 }
    );
  }

  if (createdAfter !== null) {
    const createdAt = Date.parse(String(seriesResult.data.created_at ?? ""));
    if (!Number.isFinite(createdAt) || createdAt < createdAfter) {
      return NextResponse.json(
        { ok: false, error: "series_not_created_after_pending_selection" },
        { status: 409 }
      );
    }
  }

  const updateResult = await supabase
    .from("series")
    .update({ translation_permission_mode: mode })
    .eq("id", cleanSeriesId)
    .eq("author_id", user.id)
    .select("translation_permission_mode")
    .single();

  if (updateResult.error || !updateResult.data) {
    return NextResponse.json(
      {
        ok: false,
        error: "translation_permission_update_failed",
        message: updateResult.error?.message ?? "更新に失敗しました。",
      },
      { status: 500 }
    );
  }

  const savedMode = normalizeMode(updateResult.data.translation_permission_mode) ?? mode;

  try {
    // This value is copied into public-base-work-cards.translationEligible.
    // Route Handlers must use immediate expiration, not a stale SWR profile.
    revalidateTag("public-base-work-cards", { expire: 0 });
  } catch {
    // The DB update committed. Returning persisted:true avoids misleading
    // author UI and duplicate retry of a successful permission change.
    return NextResponse.json(
      { ok: false, error: "cache_invalidation_failed", persisted: true, mode: savedMode },
      { status: 503 }
    );
  }

  return NextResponse.json({ ok: true, mode: savedMode });
}
