import { supabase } from "@/lib/supabaseClient";
import { normalizeDisplayName } from "@/lib/auth/accountSignupConsent";

export async function syncPublicUserProfile(
  userId: string,
  displayName: string
): Promise<void> {
  const trimmedDisplayName = normalizeDisplayName(displayName);
  const nowIso = new Date().toISOString();

  const updatePayloads: Array<Record<string, unknown>> = [
    { display_name: trimmedDisplayName, updated_at: nowIso },
    { display_name: trimmedDisplayName },
  ];

  for (const payload of updatePayloads) {
    const result = await supabase
      .from("users")
      .update(payload)
      .eq("id", userId)
      .select("id, display_name")
      .maybeSingle();

    if (!result.error && result.data?.id) {
      return;
    }
  }

  const upsertPayloads: Array<Record<string, unknown>> = [
    { id: userId, display_name: trimmedDisplayName, updated_at: nowIso },
    { id: userId, display_name: trimmedDisplayName },
  ];

  let lastErrorMessage = "ユーザー名の保存に失敗した。";

  for (const payload of upsertPayloads) {
    const result = await supabase
      .from("users")
      .upsert(payload, { onConflict: "id" })
      .select("id, display_name")
      .maybeSingle();

    if (result.error) {
      lastErrorMessage = result.error.message;
      continue;
    }

    if (result.data?.id) {
      return;
    }
  }

  throw new Error(lastErrorMessage);
}