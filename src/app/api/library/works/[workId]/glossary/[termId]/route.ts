import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ workId: string; termId: string }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
  const { workId, termId } = await context.params;
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return NextResponse.json(
      { ok: false, error: "authentication_required" },
      { status: 401 }
    );
  }

  const result = await supabase
    .from("private_library_glossary_terms")
    .delete()
    .eq("id", termId)
    .eq("work_id", workId)
    .eq("owner_user_id", authData.user.id)
    .select("id")
    .maybeSingle();

  if (result.error || !result.data) {
    return NextResponse.json(
      { ok: false, error: "glossary_delete_failed" },
      { status: 404 }
    );
  }

  return NextResponse.json({ ok: true });
}
