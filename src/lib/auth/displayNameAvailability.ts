import { normalizeDisplayName } from "@/lib/auth/accountSignupConsent";

type SupabaseLike = {
  from: (table: string) => any;
};

export type PublicUserProfileRow = Record<string, unknown> & {
  id: string;
  display_name?: string | null;
  username?: string | null;
  pen_name?: string | null;
  name?: string | null;
};

function normalizeLookupKey(value: string): string {
  return normalizeDisplayName(value).toLowerCase();
}

function matchesDisplayName(
  row: PublicUserProfileRow,
  normalizedDisplayName: string
): boolean {
  const lookupKey = normalizeLookupKey(normalizedDisplayName);

  return [
    row.display_name,
    row.username,
    row.pen_name,
    row.name,
  ].some((value) => {
    if (typeof value !== "string" || value.trim().length === 0) {
      return false;
    }

    return normalizeLookupKey(value) === lookupKey;
  });
}

export async function findDisplayNameConflict(args: {
  supabase: SupabaseLike;
  displayName: string;
  excludeUserId?: string | null;
}): Promise<PublicUserProfileRow | null> {
  const normalizedDisplayName = normalizeDisplayName(args.displayName);

  if (!normalizedDisplayName) {
    return null;
  }

  const collected = new Map<string, PublicUserProfileRow>();
  let successfulQueryCount = 0;

  const columns = ["display_name", "username", "pen_name", "name"] as const;

  for (const column of columns) {
    const { data, error } = await args.supabase
      .from("users")
      .select("*")
      .ilike(column, normalizedDisplayName)
      .limit(10);

    if (error) {
      continue;
    }

    successfulQueryCount += 1;

    for (const row of (data ?? []) as PublicUserProfileRow[]) {
      if (!row?.id) {
        continue;
      }

      collected.set(row.id, row);
    }
  }

  if (successfulQueryCount === 0) {
    throw new Error("display_name_lookup_failed");
  }

  const trimmedExcludeUserId = (args.excludeUserId ?? "").trim();

  for (const row of collected.values()) {
    if (trimmedExcludeUserId && row.id === trimmedExcludeUserId) {
      continue;
    }

    if (matchesDisplayName(row, normalizedDisplayName)) {
      return row;
    }
  }

  return null;
}