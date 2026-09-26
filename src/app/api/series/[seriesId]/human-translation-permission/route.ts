import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ seriesId: string }> };
type Mode = "open" | "closed";
function modeOf(value: unknown): Mode | null {
  return value === "open" || value === "closed" ? value : null;
}

export async function POST(request: Request, context: RouteContext) {
  const { seriesId } = await context.params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const mode = modeOf(body?.mode);
  if (!seriesId.trim() || !mode) {
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  const user = authData.user;
  if (authError || !user) {
    return NextResponse.json({ ok: false, error: "authentication_required" }, { status: 401 });
  }
  const series = await supabase.from("series").select("id,author_id").eq("id", seriesId).maybeSingle();
  if (series.error || !series.data) {
    return NextResponse.json({ ok: false, error: "series_not_found" }, { status: 404 });
  }
  if (series.data.author_id !== user.id) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const updated = await supabase
    .from("series")
    .update({ human_translation_permission_mode: mode })
    .eq("id", seriesId)
    .eq("author_id", user.id)
    .select("human_translation_permission_mode")
    .single();
  if (updated.error || !updated.data) {
    return NextResponse.json({ ok: false, error: "human_translation_permission_update_failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, mode: modeOf(updated.data.human_translation_permission_mode) ?? mode });
}
