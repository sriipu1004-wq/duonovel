export type SeriesContentRating = "general" | "r18";

export function normalizeSeriesContentRating(
  value: unknown
): SeriesContentRating {
  return value === "r18" ? "r18" : "general";
}

export function getSeriesContentRating(
  series: unknown
): SeriesContentRating {
  if (!series || typeof series !== "object") return "general";
  const row = series as Record<string, unknown>;
  return normalizeSeriesContentRating(
    row.content_rating ?? row.contentRating
  );
}

export function isR18Series(series: unknown): boolean {
  return getSeriesContentRating(series) === "r18";
}

export function withSystemContentRatingTag(
  tags: string[],
  rating: SeriesContentRating
): string[] {
  const withoutR18 = tags.filter(
    (tag) => tag.trim().replace(/^#+/u, "").toLowerCase() !== "r18"
  );

  return rating === "r18" ? ["#R18", ...withoutR18] : withoutR18;
}
