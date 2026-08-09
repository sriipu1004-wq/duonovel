import { NextResponse } from "next/server";
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
    .select("id, author_id")
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

  return NextResponse.json({
    ok: true,
    mode: normalizeMode(updateResult.data.translation_permission_mode) ?? mode,
  });
}
