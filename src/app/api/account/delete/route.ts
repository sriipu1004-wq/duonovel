import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Child84h temporary fail-closed gate.
 *
 * Until author content, private data, billing, Storage, and retry semantics are
 * approved and implemented together, do not turn an Auth soft-delete into a
 * misleading claim that an account and its contents were fully erased.
 *
 * This must remain a server-side guard even if the UI no longer offers a
 * self-service delete button. No payment, Auth mutation, or DB write occurs.
 */
export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError?.name === "AuthSessionMissingError") {
      return NextResponse.json(
        { error: "ログイン状態を確認できなかった。" },
        { status: 401 }
      );
    }

    if (userError) {
      return NextResponse.json(
        { error: "認証の確認が一時的に利用できません。" },
        { status: 503 }
      );
    }

    if (!user) {
      return NextResponse.json(
        { error: "ログイン状態を確認できなかった。" },
        { status: 401 }
      );
    }
  } catch {
    return NextResponse.json(
      { error: "認証の確認が一時的に利用できません。" },
      { status: 503 }
    );
  }

  return NextResponse.json(
    {
      code: "ACCOUNT_DELETION_REVIEW_REQUIRED",
      error:
        "データの削除範囲と公開作品の扱いを確認するため、アカウントの自動削除を一時停止しています。お問い合わせページから削除を申請してください。申請だけでは削除は完了しません。",
      contactPath: "/contact",
    },
    { status: 409 }
  );
}
