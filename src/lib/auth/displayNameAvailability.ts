import { normalizeDisplayName } from "@/lib/auth/accountSignupConsent";

type AdminSupabaseLike = {
  auth: {
    admin: {
      listUsers: (args: { page: number; perPage: number }) => Promise<{
        data?: {
          users?: Array<{
            id: string;
            user_metadata?: Record<string, unknown> | null;
          }>;
        } | null;
        error?: { message?: string } | null;
      }>;
    };
  };
};

export type PublicUserProfileRow = Record<string, unknown> & {
  id: string;
  display_name?: string | null;
};

function normalizeLookupKey(value: string): string {
  return normalizeDisplayName(value).toLowerCase();
}

function readText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readAuthAccountDisplayName(metadata: unknown): string {
  if (!metadata || typeof metadata !== "object") {
    return "";
  }

  const record = metadata as Record<string, unknown>;

  return (
    readText(record.display_name_candidate) ||
    readText(record.display_name)
  );
}

export async function findDisplayNameConflict(args: {
  supabase: AdminSupabaseLike;
  displayName: string;
  excludeUserId?: string | null;
}): Promise<PublicUserProfileRow | null> {
  const normalizedDisplayName = normalizeDisplayName(args.displayName);

  if (!normalizedDisplayName) {
    return null;
  }

  const lookupKey = normalizeLookupKey(normalizedDisplayName);
  const trimmedExcludeUserId = (args.excludeUserId ?? "").trim();

  const perPage = 1000;

  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await args.supabase.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      throw new Error(error.message || "display_name_lookup_failed");
    }

    const users = data?.users ?? [];

    for (const user of users) {
      if (!user?.id) {
        continue;
      }

      if (trimmedExcludeUserId && user.id === trimmedExcludeUserId) {
        continue;
      }

      const displayName = readAuthAccountDisplayName(user.user_metadata);

      if (!displayName) {
        continue;
      }

      if (normalizeLookupKey(displayName) === lookupKey) {
        return {
          id: user.id,
          display_name: displayName,
        };
      }
    }

    if (users.length < perPage) {
      break;
    }
  }

  return null;
}
