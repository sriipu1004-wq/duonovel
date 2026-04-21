type SupabaseLike = {
  from: (table: string) => any;
};

export type ReaderCardLikeSnapshot = {
  likeCount: number;
  isLiked: boolean;
};

function normalizeCount(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export async function fetchReaderCardLikeSnapshotMap(args: {
  supabase: SupabaseLike;
  seriesId: string;
  readerKeys: string[];
  currentUserId?: string | null;
}): Promise<Map<string, ReaderCardLikeSnapshot>> {
  const trimmedSeriesId = args.seriesId.trim();
  const uniqueReaderKeys = Array.from(
    new Set(args.readerKeys.map((value) => value.trim()).filter(Boolean))
  );
  const trimmedCurrentUserId = (args.currentUserId ?? "").trim();

  const result = new Map<string, ReaderCardLikeSnapshot>();

  if (!trimmedSeriesId || uniqueReaderKeys.length === 0) {
    return result;
  }

  const { data, error } = await args.supabase
    .from("reader_card_likes")
    .select("reader_key, user_id")
    .eq("series_id", trimmedSeriesId)
    .in("reader_key", uniqueReaderKeys);

  if (error) {
    throw new Error(`reader_card_likes lookup failed: ${error.message}`);
  }

  for (const readerKey of uniqueReaderKeys) {
    result.set(readerKey, {
      likeCount: 0,
      isLiked: false,
    });
  }

  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const readerKey =
      typeof row.reader_key === "string" ? row.reader_key.trim() : "";
    const userId = typeof row.user_id === "string" ? row.user_id.trim() : "";

    if (!readerKey) {
      continue;
    }

    const current = result.get(readerKey) ?? {
      likeCount: 0,
      isLiked: false,
    };

    current.likeCount = normalizeCount(current.likeCount) + 1;
    current.isLiked =
      current.isLiked || (!!trimmedCurrentUserId && userId === trimmedCurrentUserId);

    result.set(readerKey, current);
  }

  return result;
}