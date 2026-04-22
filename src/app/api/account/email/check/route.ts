import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

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
      const exists = users.some(
        (user) => normalizeEmail(user.email ?? "") === normalizedEmail
      );

      if (exists) {
        return NextResponse.json({
          ok: true,
          available: false,
          normalizedEmail,
          error: "このメールアドレスはすでに登録されている。ログインへ進んで。",
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
      normalizedEmail,
      error: "",
    });
  } catch (error) {
    console.error("[email-check]", error);

    return NextResponse.json(
      {
        ok: false,
        available: false,
        error: "メールアドレスの重複確認に失敗した。",
      },
      { status: 500 }
    );
  }
}