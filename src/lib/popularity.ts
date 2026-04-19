import { supabase } from "@/lib/supabaseClient";

type PopularityDailyRow = Record<string, unknown> & {
  series_id?: string | null;
  seriesId?: string | null;
  bucket_date?: string | null;
  bucketDate?: string | null;
  like_count?: number | null;
  likeCount?: number | null;
  bookmark_count?: number | null;
  bookmarkCount?: number | null;
  view_count?: number | null;
  viewCount?: number | null;
  narration_play_count?: number | null;
  narrationPlayCount?: number | null;
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
  dailyRows: PopularityDailyRow[];
};

const TOKYO_TIMEZONE = "Asia/Tokyo";

function pickSeriesId(row: PopularityDailyRow): string | null {
  const value = row.series_id ?? row.seriesId;

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function pickBucketDate(row: PopularityDailyRow): string {
  const value = row.bucket_date ?? row.bucketDate;
  return typeof value === "string" ? value : "";
}

function pickCount(
  primary: number | null | undefined,
  secondary: number | null | undefined
): number {
  const raw = primary ?? secondary ?? 0;

  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw;
  }

  const parsed = Number(raw);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function toTokyoDateInput(value: number): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: TOKYO_TIMEZONE,
  }).formatToParts(new Date(value));

  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";

  if (!year || !month || !day) {
    return "";
  }

  return `${year}-${month}-${day}`;
}

function hasWindow(window?: PopularityWindow): boolean {
  return (
    typeof window?.startAtValue === "number" ||
    typeof window?.endAtValue === "number"
  );
}

function isRowInWindow(
  row: PopularityDailyRow,
  window?: PopularityWindow
): boolean {
  if (!hasWindow(window)) {
    return true;
  }

  const bucketDate = pickBucketDate(row);
  if (!bucketDate) {
    return false;
  }

  const startDate =
    typeof window?.startAtValue === "number"
      ? toTokyoDateInput(window.startAtValue)
      : "";

  const endDate =
    typeof window?.endAtValue === "number"
      ? toTokyoDateInput(window.endAtValue)
      : "";

  if (startDate && bucketDate < startDate) {
    return false;
  }

  if (endDate && bucketDate > endDate) {
    return false;
  }

  return true;
}

export function calculatePopularityScore(input: {
  likeCount: number;
  bookmarkCount: number;
  viewCount: number;
}): number {
  return input.viewCount / 100 + input.likeCount + input.bookmarkCount / 3;
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
      dailyRows: [],
    };
  }

  const narrow = await supabase
    .from("series_popularity_daily")
    .select(
      "series_id, bucket_date, like_count, bookmark_count, view_count, narration_play_count"
    )
    .in("series_id", normalizedSeriesIds);

  if (!narrow.error) {
    return {
      seriesIds: normalizedSeriesIds,
      dailyRows: (narrow.data ?? []) as PopularityDailyRow[],
    };
  }

  const fallback = await supabase
    .from("series_popularity_daily")
    .select("*")
    .in("series_id", normalizedSeriesIds);

  if (fallback.error) {
    return {
      seriesIds: normalizedSeriesIds,
      dailyRows: [],
    };
  }

  return {
    seriesIds: normalizedSeriesIds,
    dailyRows: (fallback.data ?? []) as PopularityDailyRow[],
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
  const result = new Map<string, SeriesPopularityMetrics>();

  const aggregateMap = new Map<
    string,
    {
      likeCount: number;
      bookmarkCount: number;
      viewCount: number;
      narrationPlayCount: number;
    }
  >();

  for (const row of dataset.dailyRows) {
    if (!isRowInWindow(row, window)) {
      continue;
    }

    const seriesId = pickSeriesId(row);
    if (!seriesId) {
      continue;
    }

    const current = aggregateMap.get(seriesId) ?? {
      likeCount: 0,
      bookmarkCount: 0,
      viewCount: 0,
      narrationPlayCount: 0,
    };

    current.likeCount += pickCount(row.like_count, row.likeCount);
    current.bookmarkCount += pickCount(row.bookmark_count, row.bookmarkCount);
    current.viewCount += pickCount(row.view_count, row.viewCount);
    current.narrationPlayCount += pickCount(
      row.narration_play_count,
      row.narrationPlayCount
    );

    aggregateMap.set(seriesId, current);
  }

  for (const seriesId of dataset.seriesIds) {
    const current = aggregateMap.get(seriesId) ?? {
      likeCount: 0,
      bookmarkCount: 0,
      viewCount: 0,
      narrationPlayCount: 0,
    };

    result.set(seriesId, {
      seriesId,
      likeCount: current.likeCount,
      bookmarkCount: current.bookmarkCount,
      viewCount: current.viewCount,
      narrationPlayCount: current.narrationPlayCount,
      popularityScore: calculatePopularityScore({
        likeCount: current.likeCount,
        bookmarkCount: current.bookmarkCount,
        viewCount: current.viewCount,
      }),
    });
  }

  return result;
}