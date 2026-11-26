type QueryResult = {
  data?: unknown;
  count?: number | null;
  error: { message: string } | null;
};

type AwaitableQuery = {
  then: (
    onfulfilled: (value: QueryResult) => unknown,
    onrejected?: (reason: unknown) => unknown
  ) => unknown;
};

type FilterQuery = AwaitableQuery & {
  eq: (column: string, value: unknown) => FilterQuery;
  maybeSingle: () => AwaitableQuery;
};

type TableQuery = {
  select: (
    columns: string,
    options?: { count?: "exact"; head?: boolean }
  ) => FilterQuery;
};

// The real Supabase client is accepted as-is. `from()` stays `unknown` here because
// structurally comparing the client's generic select/then types against TableQuery
// hits TS2589 (excessively deep instantiation); the query shape used below is
// re-attached in one place instead of leaking `any`.
type SupabaseLike = {
  from: (table: string) => unknown;
};

function fromTable(supabase: SupabaseLike, table: string): TableQuery {
  return supabase.from(table) as TableQuery;
}

export type AuthorFollowSnapshot = {
  followerCount: number;
  followingCount: number;
  isFollowing: boolean;
};

function normalizeCount(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export async function fetchAuthorFollowSnapshot(args: {
  supabase: SupabaseLike;
  authorId: string;
  currentUserId?: string | null;
}): Promise<AuthorFollowSnapshot> {
  const trimmedAuthorId = args.authorId.trim();
  const trimmedCurrentUserId = (args.currentUserId ?? "").trim();

  const [followersResult, followingResult, currentFollowResult] =
    await Promise.all([
      fromTable(args.supabase, "author_follows")
        .select("id", { count: "exact", head: true })
        .eq("followed_author_id", trimmedAuthorId),
      fromTable(args.supabase, "author_follows")
        .select("id", { count: "exact", head: true })
        .eq("follower_user_id", trimmedAuthorId),
      trimmedCurrentUserId
        ? fromTable(args.supabase, "author_follows")
            .select("id")
            .eq("follower_user_id", trimmedCurrentUserId)
            .eq("followed_author_id", trimmedAuthorId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

  if (followersResult.error) {
    throw new Error(`author_follows follower count lookup failed: ${followersResult.error.message}`);
  }

  if (followingResult.error) {
    throw new Error(`author_follows following count lookup failed: ${followingResult.error.message}`);
  }

  if (currentFollowResult.error) {
    throw new Error(`author_follows current follow lookup failed: ${currentFollowResult.error.message}`);
  }

  return {
    followerCount: normalizeCount(followersResult.count),
    followingCount: normalizeCount(followingResult.count),
    isFollowing: !!currentFollowResult.data,
  };
}