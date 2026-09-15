import { NextResponse } from "next/server";

type EmailAvailabilityStatus = "available";

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
        available: false,
        status: "available" satisfies EmailAvailabilityStatus,
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
        available: false,
        status: "available" satisfies EmailAvailabilityStatus,
        error: validationError,
      },
      { status: 400 }
    );
  }

  // Never reveal whether an arbitrary email exists in Supabase Auth. Duplicate
  // handling belongs to the Auth signup/login flows, which intentionally avoid
  // account-enumeration signals. Keeping a generic positive response preserves
  // callers that only use this endpoint as a preflight format check.
  return NextResponse.json({
    ok: true,
    available: true,
    status: "available" satisfies EmailAvailabilityStatus,
    normalizedEmail,
    error: "",
  });
}
