import { createAdminClient } from "@/lib/supabase/admin";
import { pickText, type SeriesRow } from "@/features/write/writeShared";
import { runReadOnlyWithRetry } from "@/lib/reliability/readOnly";

/**
 * Account display name of a series' author (users.display_name), shared by
 * the Reader page and the Reader layout so both modes resolve the same name.
 * series has no author_name column in Production; it is kept only as a
 * legacy fallback.
 */
export async function getNormalAuthorName(
  series: SeriesRow,
  authorUnsetLabel: string
): Promise<string> {
  const authorId =
    pickText(series.author_id, series["user_id"], series["userId"]) || "";
  const fallbackName = pickText(series["author_name"]) || authorUnsetLabel;

  if (!authorId) {
    return fallbackName;
  }

  try {
    const adminSupabase = createAdminClient();
    const result = await runReadOnlyWithRetry(
      async () =>
        await adminSupabase
          .from("users")
          .select("display_name")
          .eq("id", authorId)
          .maybeSingle(),
      { operation: "reader author profile", timeoutMs: 1500, retries: 0 }
    );

    if (!result.error && result.data) {
      const displayName = pickText(result.data.display_name);
      if (displayName) return displayName;
    }
  } catch {
    console.warn("[reader] author profile unavailable");
  }

  return fallbackName;
}
