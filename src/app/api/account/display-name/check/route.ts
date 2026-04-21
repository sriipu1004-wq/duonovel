import { NextResponse } from "next/server";
import {
  normalizeDisplayName,
  validateDisplayName,
} from "@/lib/auth/accountSignupConsent";
import { findDisplayNameConflict } from "@/lib/auth/displayNameAvailability";
import { createAdminClient } from "@/lib/supabase/admin";

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
  const excludeUserId = readText(payload.excludeUserId);

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
    const adminSupabase = createAdminClient();

    const conflict = await findDisplayNameConflict({
      supabase: adminSupabase,
      displayName: normalizedDisplayName,
      excludeUserId: excludeUserId || undefined,
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