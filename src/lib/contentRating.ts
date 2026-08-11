export type SeriesContentRating = "general" | "r18";
export type SeriesContentWarning = "sexual_r18" | "violence";

const CONTENT_WARNING_VALUES = new Set<SeriesContentWarning>([
  "sexual_r18",
  "violence",
]);

function readStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(String).map((item) => item.trim()).filter(Boolean);
  }

  if (typeof value === "string" && value.trim()) {
    return value
      .split(/[\n,、]/u)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

export function normalizeSeriesContentRating(
  value: unknown
): SeriesContentRating {
  return value === "r18" ? "r18" : "general";
}

export function normalizeSeriesContentWarnings(
  value: unknown
): SeriesContentWarning[] {
  return Array.from(
    new Set(
      readStringArray(value).filter((item): item is SeriesContentWarning =>
        CONTENT_WARNING_VALUES.has(item as SeriesContentWarning)
      )
    )
  );
}

export function getSeriesContentWarnings(series: unknown): SeriesContentWarning[] {
  if (!series || typeof series !== "object") return [];
  const row = series as Record<string, unknown>;
  const warnings = normalizeSeriesContentWarnings(
    row.content_warnings ?? row.contentWarnings
  );

  if (
    normalizeSeriesContentRating(row.content_rating ?? row.contentRating) === "r18" &&
    !warnings.includes("sexual_r18")
  ) {
    return ["sexual_r18", ...warnings];
  }

  return warnings;
}

export function getSeriesContentWarningLocks(
  series: unknown
): SeriesContentWarning[] {
  if (!series || typeof series !== "object") return [];
  const row = series as Record<string, unknown>;
  return normalizeSeriesContentWarnings(
    row.content_warning_locks ?? row.contentWarningLocks
  ).filter((warning) => getSeriesContentWarnings(series).includes(warning));
}

export function getSeriesContentRating(
  series: unknown
): SeriesContentRating {
  return getSeriesContentWarnings(series).includes("sexual_r18")
    ? "r18"
    : series && typeof series === "object"
      ? normalizeSeriesContentRating(
          (series as Record<string, unknown>).content_rating ??
            (series as Record<string, unknown>).contentRating
        )
      : "general";
}

export function hasSeriesContentWarning(
  series: unknown,
  warning: SeriesContentWarning
): boolean {
  return getSeriesContentWarnings(series).includes(warning);
}

export function isR18Series(series: unknown): boolean {
  return getSeriesContentRating(series) === "r18";
}

function normalizeSystemWarningTag(tag: string): string {
  return tag.trim().replace(/^#+/u, "").replace(/\s+/gu, "").toLowerCase();
}

export function withSystemContentWarningTags(
  tags: string[],
  warnings: SeriesContentWarning[],
  rating: SeriesContentRating = warnings.includes("sexual_r18") ? "r18" : "general"
): string[] {
  const withoutSystemWarnings = tags.filter((tag) => {
    const normalized = normalizeSystemWarningTag(tag);
    return normalized !== "r18" && normalized !== "暴力描写あり";
  });

  const systemTags: string[] = [];
  if (rating === "r18" || warnings.includes("sexual_r18")) {
    systemTags.push("#R18");
  }
  if (warnings.includes("violence")) {
    systemTags.push("#暴力描写あり");
  }

  return [...systemTags, ...withoutSystemWarnings];
}

export function withSystemContentRatingTag(
  tags: string[],
  rating: SeriesContentRating,
  warnings: SeriesContentWarning[] = []
): string[] {
  const mergedWarnings =
    rating === "r18" && !warnings.includes("sexual_r18")
      ? ["sexual_r18" as const, ...warnings]
      : warnings;
  return withSystemContentWarningTags(tags, mergedWarnings, rating);
}
