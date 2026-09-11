import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPrivateLibraryImportErrorMessage } from "@/lib/library/privateLibraryImportServer";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ workId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { workId } = await context.params;
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData.user) {
    return NextResponse.json(
      { ok: false, error: "authentication_required" },
      { status: 401 }
    );
  }

  const result = await supabase.rpc("complete_private_library_import_with_usage", {
    p_work_id: workId,
  });

  if (result.error || result.data !== workId) {
    if (result.error?.code === "PGRST202") {
      return NextResponse.json(
        { ok: false, error: "import_update_pending", message: "取り込み機能の更新を準備中です。時間をおいて再度お試しください。" },
        { status: 503 }
      );
    }
    const message = result.error?.message ?? "";
    const quotaExceeded = message.includes("Free library import daily action limit");
    return NextResponse.json(
      {
        ok: false,
        error: quotaExceeded ? "daily_action_limit" : "private_library_import_complete_failed",
        message: getPrivateLibraryImportErrorMessage(message),
      },
      { status: quotaExceeded ? 429 : 422 }
    );
  }

  return NextResponse.json({ ok: true, workId });
}
