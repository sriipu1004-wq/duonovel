import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ workId: string }>;
};

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

  const result = await supabase.rpc("abort_private_library_import", {
    p_work_id: workId,
  });

  return NextResponse.json({ ok: !result.error });
}
