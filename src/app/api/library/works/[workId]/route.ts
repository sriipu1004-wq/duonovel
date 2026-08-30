import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ workId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const { workId } = await context.params;
  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_request" },
      { status: 400 }
    );
  }

  const title = typeof payload.title === "string" ? payload.title.trim() : "";
  const authorName =
    typeof payload.authorName === "string" ? payload.authorName.trim() : "";
  if (!title || title.length > 200 || authorName.length > 200) {
    return NextResponse.json(
      { ok: false, error: "invalid_request" },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return NextResponse.json(
      { ok: false, error: "authentication_required" },
      { status: 401 }
    );
  }

  const result = await supabase
    .from("private_library_works")
    .update({
      title,
      author_name: authorName || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", workId)
    .eq("owner_user_id", authData.user.id)
    .eq("import_status", "ready")
    .select("id")
    .maybeSingle();

  if (result.error || !result.data) {
    return NextResponse.json(
      { ok: false, error: "work_update_failed" },
      { status: 404 }
    );
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { workId } = await context.params;
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return NextResponse.json(
      { ok: false, error: "authentication_required" },
      { status: 401 }
    );
  }

  const result = await supabase
    .from("private_library_works")
    .delete()
    .eq("id", workId)
    .eq("owner_user_id", authData.user.id)
    .select("id")
    .maybeSingle();

  if (result.error || !result.data) {
    return NextResponse.json(
      { ok: false, error: "work_delete_failed" },
      { status: 404 }
    );
  }

  return NextResponse.json({ ok: true });
}
