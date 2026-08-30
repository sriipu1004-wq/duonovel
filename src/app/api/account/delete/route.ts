import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cancelSubscriptionsBeforeAccountDeletion } from "@/lib/billing/billing.server";

export async function POST() {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json(
      { error: "ログイン状態を確認できなかった。" },
      { status: 401 }
    );
  }

  try {
    await cancelSubscriptionsBeforeAccountDeletion(user.id);
  } catch (billingError) {
    console.error("[account-delete-billing]", billingError);
    return NextResponse.json(
      {
        error:
          "継続請求を安全に停止できなかったため、アカウント削除を中止しました。サブスクの契約管理またはお問い合わせから確認してください。",
      },
      { status: 503 }
    );
  }

  const admin = createAdminClient();
  const { error: deleteError } = await admin.auth.admin.deleteUser(
    user.id,
    true
  );

  if (deleteError) {
    return NextResponse.json(
      { error: deleteError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
