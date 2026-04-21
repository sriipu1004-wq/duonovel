type SupabaseLike = {
  from: (table: string) => any;
};

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
    args.supabase
      .from("author_profile_likes")
      .select("id", { count: "exact", head: true })
      .eq("author_id", trimmedAuthorId),
    trimmedCurrentUserId
      ? args.supabase
          .from("author_profile_likes")
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