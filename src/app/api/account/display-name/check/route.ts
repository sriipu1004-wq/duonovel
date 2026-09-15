import { NextResponse } from "next/server";
import {
  normalizeDisplayName,
  validateDisplayName,
} from "@/lib/auth/accountSignupConsent";
import { findDisplayNameConflict } from "@/lib/auth/displayNameAvailability";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function readText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  let payload: Record<string, unknown>;

  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      {
        ok: false,
        available: false,
        error: "リクエストを読めなかった。",
      },
      { status: 400 }
    );
  }

  const normalizedDisplayName = normalizeDisplayName(
    readText(payload.displayName)
  );

  const validationError = validateDisplayName(normalizedDisplayName);

  if (validationError) {
    return NextResponse.json(
      {
        ok: false,
        available: false,
        error: validationError,
      },
      { status: 400 }
    );
  }

  try {
    // Never trust a caller-provided excludeUserId. Anonymous signup checks have
    // no exclusion; signed-in profile edits may exclude only the current session
    // user resolved by Supabase Auth on the server.
    const sessionClient = await createClient();
    const {
      data: { user },
    } = await sessionClient.auth.getUser();

    const adminSupabase = createAdminClient();
    const conflict = await findDisplayNameConflict({
      supabase: adminSupabase,
      displayName: normalizedDisplayName,
      excludeUserId: user?.id ?? undefined,
    });

    return NextResponse.json({
      ok: true,
      available: !conflict,
      normalizedDisplayName,
      error: conflict ? "このユーザー名はすでに使われている。" : "",
    });
  } catch (error) {
    console.error("[display-name-check]", error);

    return NextResponse.json(
      {
        ok: false,
        available: false,
        error: "ユーザー名の重複確認に失敗した。",
      },
      { status: 500 }
    );
  }
}
