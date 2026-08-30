import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPrivateLibraryImportErrorMessage } from "@/lib/library/privateLibraryImportServer";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ workId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const { workId } = await context.params;
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData.user) {
    return NextResponse.json(
      { ok: false, error: "authentication_required" },
      { status: 401 }
    );
  }

  const result = await supabase.rpc("complete_private_library_import", {
    p_work_id: workId,
  });

  if (result.error || result.data !== workId) {
    const message = result.error?.message ?? "";
    return NextResponse.json(
      {
        ok: false,
        error: "private_library_import_complete_failed",
        message: getPrivateLibraryImportErrorMessage(message),
      },
      { status: 422 }
    );
  }

  return NextResponse.json({ ok: true, workId });
}
