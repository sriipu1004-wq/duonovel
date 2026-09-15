import { NextResponse } from "next/server";

type PrepareSignupStatus = "available";

function readText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function validateEmail(value: string): string {
  if (!value) {
    return "メールアドレスが必要。";
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return "メールアドレスの形式が不正。";
  }

  return "";
}

export async function POST(request: Request) {
  let payload: Record<string, unknown>;

  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      {
        ok: false,
        status: "available" satisfies PrepareSignupStatus,
        error: "リクエストを読めなかった。",
      },
      { status: 400 }
    );
  }

  const normalizedEmail = normalizeEmail(readText(payload.email));
  const validationError = validateEmail(normalizedEmail);

  if (validationError) {
    return NextResponse.json(
      {
        ok: false,
        status: "available" satisfies PrepareSignupStatus,
        error: validationError,
      },
      { status: 400 }
    );
  }

  // Do not inspect Supabase Auth users here. The previous implementation exposed
  // whether an arbitrary email was registered and, more seriously, deleted any
  // matching unconfirmed user through the admin API before signup. A third party
  // could therefore repeatedly remove another person's pending account.
  //
  // Supabase Auth owns duplicate-signup / confirmation behavior. This endpoint
  // now only preserves the existing client contract by validating and
  // normalizing the address before supabase.auth.signUp().
  return NextResponse.json({
    ok: true,
    status: "available" satisfies PrepareSignupStatus,
    normalizedEmail,
    error: "",
  });
}
