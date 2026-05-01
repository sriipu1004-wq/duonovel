import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

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

type RawMetricRow = Record<string, unknown> & {
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
  dailyRows: PopularityDailyRow[];
};

const TOKYO_TIMEZONE = "Asia/Tokyo";

function pickText(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return "";
}

function pickSeriesId(row: PopularityDailyRow | RawMetricRow): string | null {
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

function getMetricBucketDate(row: RawMetricRow): string {
  const raw = pickText(row.created_at, row.createdAt);

  if (!raw) {
    return toTokyoDateInput(Date.now());
  }

  const timestamp = new Date(raw).getTime();

  if (!Number.isFinite(timestamp) || Number.isNaN(timestamp)) {
    return toTokyoDateInput(Date.now());
  }

  return toTokyoDateInput(timestamp);
}

function addDailyCount(args: {
  map: Map<string, PopularityDailyRow>;
  row: RawMetricRow;
  field:
    | "like_count"
    | "bookmark_count"
    | "view_count"
    | "narration_play_count";
}) {
  const seriesId = pickSeriesId(args.row);
  if (!seriesId) {
    return;
  }

  const bucketDate = getMetricBucketDate(args.row);
  const key = `${seriesId}:${bucketDate}`;
  const current = args.map.get(key) ?? {
    series_id: seriesId,
    bucket_date: bucketDate,
    like_count: 0,
    bookmark_count: 0,
    view_count: 0,
    narration_play_count: 0,
  };

  const rawCurrentValue = current[args.field];
  const currentValue =
    typeof rawCurrentValue === "number" && Number.isFinite(rawCurrentValue)
      ? rawCurrentValue
      : 0;

  current[args.field] = currentValue + 1;
  args.map.set(key, current);
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

async function fetchSeriesPopularityDatasetUncached(
  seriesIdsKey: string
): Promise<SeriesPopularityDataset> {
  const normalizedSeriesIds = Array.from(
    new Set(
      seriesIdsKey
        .split(",")
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

  const adminSupabase = createAdminClient();

  const [
    likesResult,
    bookmarksResult,
    viewsResult,
    narrationPlaysResult,
  ] = await Promise.all([
    adminSupabase
      .from("user_series_reactions")
      .select("series_id, created_at")
      .in("series_id", normalizedSeriesIds)
      .eq("reaction_type", "support"),
    adminSupabase
      .from("user_series_bookmarks")
      .select("series_id, created_at")
      .in("series_id", normalizedSeriesIds),
    adminSupabase
      .from("series_view_events")
      .select("series_id, created_at")
      .in("series_id", normalizedSeriesIds),
    adminSupabase
      .from("recording_play_events")
      .select("series_id, created_at")
      .in("series_id", normalizedSeriesIds),
  ]);

  const dailyMap = new Map<string, PopularityDailyRow>();

  for (const row of (likesResult.data ?? []) as RawMetricRow[]) {
    addDailyCount({ map: dailyMap, row, field: "like_count" });
  }

  for (const row of (bookmarksResult.data ?? []) as RawMetricRow[]) {
    addDailyCount({ map: dailyMap, row, field: "bookmark_count" });
  }

  for (const row of (viewsResult.data ?? []) as RawMetricRow[]) {
    addDailyCount({ map: dailyMap, row, field: "view_count" });
  }

  for (const row of (narrationPlaysResult.data ?? []) as RawMetricRow[]) {
    addDailyCount({ map: dailyMap, row, field: "narration_play_count" });
  }

  return {
    seriesIds: normalizedSeriesIds,
    dailyRows: Array.from(dailyMap.values()),
  };
}

const getCachedSeriesPopularityDataset = unstable_cache(
  fetchSeriesPopularityDatasetUncached,
  ["series-popularity-raw-metrics"],
  {
    revalidate: 15,
  }
);

export async function fetchSeriesPopularityDataset(
  seriesIds: string[]
): Promise<SeriesPopularityDataset> {
  const normalizedSeriesIds = Array.from(
    new Set(
      seriesIds
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
    )
  ).sort((left, right) => left.localeCompare(right));

  return getCachedSeriesPopularityDataset(normalizedSeriesIds.join(","));
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