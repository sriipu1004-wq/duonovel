import { normalizeDisplayName } from "@/lib/auth/accountSignupConsent";
import type { createAdminClient } from "@/lib/supabase/admin";

type AdminSupabase = ReturnType<typeof createAdminClient>;

export type PublicUserProfileRow = Record<string, unknown> & {
  id: string;
  display_name?: string | null;
};

function normalizeLookupKey(value: string): string {
  return normalizeDisplayName(value).toLowerCase();
}

export async function findDisplayNameConflict(args: {
  supabase: AdminSupabase;
  displayName: string;
  excludeUserId?: string | null;
}): Promise<PublicUserProfileRow | null> {
  const normalizedDisplayName = normalizeDisplayName(args.displayName);

  if (!normalizedDisplayName) {
    return null;
  }

  const lookupKey = normalizeLookupKey(normalizedDisplayName);
  const trimmedExcludeUserId = (args.excludeUserId ?? "").trim();

  let query = args.supabase
    .from("users")
    .select("id, display_name")
    .eq("display_name_key", lookupKey);

  if (trimmedExcludeUserId) {
    query = query.neq("id", trimmedExcludeUserId);
  }

  const { data, error } = await query.limit(1).maybeSingle();

  if (error) {
    throw new Error(error.message || "display_name_lookup_failed");
  }

  if (!data?.id) {
    return null;
  }

  return {
    id: String(data.id),
    display_name:
      typeof data.display_name === "string" ? data.display_name : null,
  };
}
