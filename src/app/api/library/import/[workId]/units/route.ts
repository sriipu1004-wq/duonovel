import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { PRIVATE_LIBRARY_LIMITS } from "@/lib/library/privateLibrary";
import {
  getPrivateLibraryImportErrorMessage,
  parsePrivateLibraryImportUnits,
} from "@/lib/library/privateLibraryImportServer";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ workId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
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

  const startUnitNumber = Number(payload.startUnitNumber);
  const units = parsePrivateLibraryImportUnits(payload.units);

  if (
    !workId ||
    !Number.isInteger(startUnitNumber) ||
    startUnitNumber < 1 ||
    !units ||
    units.length > PRIVATE_LIBRARY_LIMITS.importBatchSize
  ) {
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

  const result = await supabase.rpc("append_private_library_import_units", {
    p_work_id: workId,
    p_start_unit_number: startUnitNumber,
    p_units: units,
  });

  if (result.error || Number(result.data) !== units.length) {
    const message = result.error?.message ?? "";
    return NextResponse.json(
      {
        ok: false,
        error: "private_library_import_batch_failed",
        message: getPrivateLibraryImportErrorMessage(message),
      },
      { status: 422 }
    );
  }

  return NextResponse.json({ ok: true, stored: units.length });
}
