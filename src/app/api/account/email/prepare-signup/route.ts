import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

type PrepareSignupStatus =
  | "available"
  | "deleted_unconfirmed"
  | "confirmed";

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
        if (isEmailConfirmed(matchedUser.email_confirmed_at)) {
          return NextResponse.json(
            {
              ok: false,
              status: "confirmed" satisfies PrepareSignupStatus,
              normalizedEmail,
              error: "このメールアドレスはすでに登録済み。ログインへ進んで。",
            },
            { status: 409 }
          );
        }

        const { error: deleteError } =
          await adminSupabase.auth.admin.deleteUser(matchedUser.id);

        if (deleteError) {
          throw deleteError;
        }

        return NextResponse.json({
          ok: true,
          status: "deleted_unconfirmed" satisfies PrepareSignupStatus,
          normalizedEmail,
          error: "",
        });
      }

      if (users.length < perPage) {
        break;
      }

      page += 1;
    }

    return NextResponse.json({
      ok: true,
      status: "available" satisfies PrepareSignupStatus,
      normalizedEmail,
      error: "",
    });
  } catch (error) {
    console.error("[prepare-signup-email]", error);

    return NextResponse.json(
      {
        ok: false,
        status: "available" satisfies PrepareSignupStatus,
        error: "確認メール送信の準備に失敗した。",
      },
      { status: 500 }
    );
  }
}