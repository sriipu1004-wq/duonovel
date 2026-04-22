import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

type EmailAvailabilityStatus = "available" | "confirmed" | "unconfirmed";

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

function isEmailConfirmed(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
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

  try {
    const adminSupabase = createAdminClient();
    let page = 1;
    const perPage = 200;

    while (true) {
      const { data, error } = await adminSupabase.auth.admin.listUsers({
        page,
        perPage,
      });

      if (error) {
        throw error;
      }

      const users = data?.users ?? [];
      const matchedUser =
        users.find(
          (user) => normalizeEmail(user.email ?? "") === normalizedEmail
        ) ?? null;

      if (matchedUser) {
        const status: EmailAvailabilityStatus = isEmailConfirmed(
          matchedUser.email_confirmed_at
        )
          ? "confirmed"
          : "unconfirmed";

        return NextResponse.json({
          ok: true,
          available: false,
          status,
          normalizedEmail,
          error:
            status === "confirmed"
              ? "このメールアドレスはすでに登録済み。ログインへ進んで。"
              : "このメールアドレスは確認待ち。確認メールのリンクを開いてからログインして。確認がまだなら作成を続けられない。",
        });
      }

      if (users.length < perPage) {
        break;
      }

      page += 1;
    }

    return NextResponse.json({
      ok: true,
      available: true,
      status: "available" satisfies EmailAvailabilityStatus,
      normalizedEmail,
      error: "",
    });
  } catch (error) {
    console.error("[email-check]", error);

    return NextResponse.json(
      {
        ok: false,
        available: false,
        status: "available" satisfies EmailAvailabilityStatus,
        error: "メールアドレスの重複確認に失敗した。",
      },
      { status: 500 }
    );
  }
}