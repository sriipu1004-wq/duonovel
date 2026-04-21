type SupabaseLike = {
  from: (table: string) => any;
};

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
      args.supabase
        .from("author_follows")
        .select("id", { count: "exact", head: true })
        .eq("followed_author_id", trimmedAuthorId),
      args.supabase
        .from("author_follows")
        .select("id", { count: "exact", head: true })
        .eq("follower_user_id", trimmedAuthorId),
      trimmedCurrentUserId
        ? args.supabase
            .from("author_follows")
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