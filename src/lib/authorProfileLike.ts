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

export type AuthorProfileLikeSnapshot = {
  likeCount: number;
  isLiked: boolean;
};

function normalizeCount(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export async function fetchAuthorProfileLikeSnapshot(args: {
  supabase: SupabaseLike;
  authorId: string;
  currentUserId?: string | null;
}): Promise<AuthorProfileLikeSnapshot> {
  const trimmedAuthorId = args.authorId.trim();
  const trimmedCurrentUserId = (args.currentUserId ?? "").trim();

  const [countResult, likedResult] = await Promise.all([
    fromTable(args.supabase, "author_profile_likes")
      .select("id", { count: "exact", head: true })
      .eq("author_id", trimmedAuthorId),
    trimmedCurrentUserId
      ? fromTable(args.supabase, "author_profile_likes")
          .select("id")
          .eq("author_id", trimmedAuthorId)
          .eq("user_id", trimmedCurrentUserId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (countResult.error) {
    throw new Error(`author_profile_likes count lookup failed: ${countResult.error.message}`);
  }

  if (likedResult.error) {
    throw new Error(`author_profile_likes liked lookup failed: ${likedResult.error.message}`);
  }

  return {
    likeCount: normalizeCount(countResult.count),
    isLiked: !!likedResult.data,
  };
}