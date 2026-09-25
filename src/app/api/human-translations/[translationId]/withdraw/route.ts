import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/uuid";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ translationId: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const { translationId } = await context.params;
  if (!isUuid(translationId)) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return NextResponse.json({ ok: false, error: "authentication_required" }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();
  const updated = await admin
    .from("episode_human_translations")
    .update({ status: "withdrawn", withdrawn_at: now, updated_at: now })
    .eq("id", translationId)
    .eq("translator_user_id", authData.user.id)
    .select("id")
    .maybeSingle();

  if (updated.error || !updated.data) {
    return NextResponse.json({ ok: false, error: "forbidden_or_not_found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, translationId });
}
