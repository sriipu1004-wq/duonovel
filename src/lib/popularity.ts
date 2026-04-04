import { supabase } from "@/lib/supabaseClient";

type PopularitySourceRow = Record<string, unknown> & {
  series_id?: string | null;
  seriesId?: string | null;
  created_at?: string | null;
  createdAt?: string | null;
};

export type PopularityWindow = {
  startAtValue?: number | null;
  endAtValue?: number | null;
};

export type SeriesPopularityMetrics = {
  seriesId: string;
  likeCount: number;
  bookmarkCount: number;
  viewCount: number;
  narrationPlayCount: number;
  popularityScore: number;
};

export type SeriesPopularityDataset = {
  seriesIds: string[];
  reactionRows: PopularitySourceRow[];
  bookmarkRows: PopularitySourceRow[];
  viewRows: PopularitySourceRow[];
  narrationRows: PopularitySourceRow[];
  canUseReactionCreatedAt: boolean;
  canUseBookmarkCreatedAt: boolean;
};

function pickSeriesId(row: PopularitySourceRow): string | null {
  const value = row.series_id ?? row.seriesId;

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function pickCreatedAtValue(row: PopularitySourceRow): number | null {
  const value = row.created_at ?? row.createdAt;

  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

function hasWindow(window?: PopularityWindow): boolean {
  return (
    typeof window?.startAtValue === "number" ||
    typeof window?.endAtValue === "number"
  );
}

function buildCountMap(
  rows: PopularitySourceRow[],
  window?: PopularityWindow
): Map<string, number> {
  const countMap = new Map<string, number>();
  const useWindow = hasWindow(window);

  const startAt =
    typeof window?.startAtValue === "number"
      ? window.startAtValue
      : Number.NEGATIVE_INFINITY;

  const endAt =
    typeof window?.endAtValue === "number"
      ? window.endAtValue
      : Number.POSITIVE_INFINITY;

  for (const row of rows) {
    const seriesId = pickSeriesId(row);
    if (!seriesId) {
      continue;
    }

    if (useWindow) {
      const createdAtValue = pickCreatedAtValue(row);
      if (createdAtValue === null) {
        continue;
      }

      if (createdAtValue < startAt || createdAtValue > endAt) {
        continue;
      }
    }

    countMap.set(seriesId, (countMap.get(seriesId) ?? 0) + 1);
  }

  return countMap;
}

export function calculatePopularityScore(input: {
  likeCount: number;
  bookmarkCount: number;
  viewCount: number;
}): number {
  return input.viewCount / 100 + input.likeCount + input.bookmarkCount / 3;
}

async function fetchReactionRows(seriesIds: string[]): Promise<{
  rows: PopularitySourceRow[];
  canUseCreatedAt: boolean;
}> {
  if (seriesIds.length === 0) {
    return {
      rows: [],
      canUseCreatedAt: false,
    };
  }

  const withCreatedAt = await supabase
    .from("user_series_reactions")
    .select("series_id, created_at")
    .eq("reaction_type", "support")
    .in("series_id", seriesIds);

  if (!withCreatedAt.error) {
    return {
      rows: (withCreatedAt.data ?? []) as PopularitySourceRow[],
      canUseCreatedAt: true,
    };
  }

  const fallback = await supabase
    .from("user_series_reactions")
    .select("series_id")
    .eq("reaction_type", "support")
    .in("series_id", seriesIds);

  if (fallback.error) {
    return {
      rows: [],
      canUseCreatedAt: false,
    };
  }

  return {
    rows: (fallback.data ?? []) as PopularitySourceRow[],
    canUseCreatedAt: false,
  };
}

async function fetchBookmarkRows(seriesIds: string[]): Promise<{
  rows: PopularitySourceRow[];
  canUseCreatedAt: boolean;
}> {
  if (seriesIds.length === 0) {
    return {
      rows: [],
      canUseCreatedAt: false,
    };
  }

  const withCreatedAt = await supabase
    .from("user_series_bookmarks")
    .select("series_id, created_at")
    .in("series_id", seriesIds);

  if (!withCreatedAt.error) {
    return {
      rows: (withCreatedAt.data ?? []) as PopularitySourceRow[],
      canUseCreatedAt: true,
    };
  }

  const fallback = await supabase
    .from("user_series_bookmarks")
    .select("series_id")
    .in("series_id", seriesIds);

  if (fallback.error) {
    return {
      rows: [],
      canUseCreatedAt: false,
    };
  }

  return {
    rows: (fallback.data ?? []) as PopularitySourceRow[],
    canUseCreatedAt: false,
  };
}

async function fetchViewRows(seriesIds: string[]): Promise<PopularitySourceRow[]> {
  if (seriesIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("series_view_events")
    .select("series_id, created_at")
    .in("series_id", seriesIds);

  if (error) {
    return [];
  }

  return (data ?? []) as PopularitySourceRow[];
}

async function fetchNarrationRows(
  seriesIds: string[]
): Promise<PopularitySourceRow[]> {
  if (seriesIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("recording_play_events")
    .select("series_id, created_at")
    .in("series_id", seriesIds);

  if (error) {
    return [];
  }

  return (data ?? []) as PopularitySourceRow[];
}

export async function fetchSeriesPopularityDataset(
  seriesIds: string[]
): Promise<SeriesPopularityDataset> {
  const normalizedSeriesIds = Array.from(
    new Set(
      seriesIds
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
    )
  );

  if (normalizedSeriesIds.length === 0) {
    return {
      seriesIds: [],
      reactionRows: [],
      bookmarkRows: [],
      viewRows: [],
      narrationRows: [],
      canUseReactionCreatedAt: false,
      canUseBookmarkCreatedAt: false,
    };
  }

  const [reactionResult, bookmarkResult, viewRows, narrationRows] =
    await Promise.all([
      fetchReactionRows(normalizedSeriesIds),
      fetchBookmarkRows(normalizedSeriesIds),
      fetchViewRows(normalizedSeriesIds),
      fetchNarrationRows(normalizedSeriesIds),
    ]);

  return {
    seriesIds: normalizedSeriesIds,
    reactionRows: reactionResult.rows,
    bookmarkRows: bookmarkResult.rows,
    viewRows,
    narrationRows,
    canUseReactionCreatedAt: reactionResult.canUseCreatedAt,
    canUseBookmarkCreatedAt: bookmarkResult.canUseCreatedAt,
  };
}

export function createEmptyPopularityMetrics(
  seriesId: string
): SeriesPopularityMetrics {
  return {
    seriesId,
    likeCount: 0,
    bookmarkCount: 0,
    viewCount: 0,
    narrationPlayCount: 0,
    popularityScore: 0,
  };
}

export function buildSeriesPopularityMap(
  dataset: SeriesPopularityDataset,
  window?: PopularityWindow
): Map<string, SeriesPopularityMetrics> {
  const useWindow = hasWindow(window);

  const reactionCountMap =
    useWindow && !dataset.canUseReactionCreatedAt
      ? new Map<string, number>()
      : buildCountMap(dataset.reactionRows, useWindow ? window : undefined);

  const bookmarkCountMap =
    useWindow && !dataset.canUseBookmarkCreatedAt
      ? new Map<string, number>()
      : buildCountMap(dataset.bookmarkRows, useWindow ? window : undefined);

  const viewCountMap = buildCountMap(
    dataset.viewRows,
    useWindow ? window : undefined
  );

  const narrationCountMap = buildCountMap(
    dataset.narrationRows,
    useWindow ? window : undefined
  );

  const result = new Map<string, SeriesPopularityMetrics>();

  for (const seriesId of dataset.seriesIds) {
    const likeCount = reactionCountMap.get(seriesId) ?? 0;
    const bookmarkCount = bookmarkCountMap.get(seriesId) ?? 0;
    const viewCount = viewCountMap.get(seriesId) ?? 0;
    const narrationPlayCount = narrationCountMap.get(seriesId) ?? 0;

    result.set(seriesId, {
      seriesId,
      likeCount,
      bookmarkCount,
      viewCount,
      narrationPlayCount,
      popularityScore: calculatePopularityScore({
        likeCount,
        bookmarkCount,
        viewCount,
      }),
    });
  }

  return result;
}