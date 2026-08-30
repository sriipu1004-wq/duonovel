import "server-only";

import { isOfficialAccountEmail } from "@/lib/auth/officialAccount";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Keep the verified LIB read operator account entitled independently of Stripe.
 * This is deliberately resolved from Supabase Auth on the server; request
 * payloads and client-side email values can never grant the entitlement.
 */
export async function ensureOfficialSubscriberEntitlement(
  userId: string
): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.getUserById(userId);

  if (error || !isOfficialAccountEmail(data.user?.email)) return false;

  const { error: entitlementError } = await admin
    .from("libread_user_entitlements")
    .upsert(
      {
        user_id: userId,
        plan_type: "subscriber",
        subscriber_until: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

  if (entitlementError) {
    throw new Error(
      `公式アカウント権限の保存に失敗しました: ${entitlementError.message}`
    );
  }

  return true;
}
