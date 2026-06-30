export const SAVED_FILTER_KEYS = [
  "bookmarked-works",
  "followed-authors",
  "liked-authors",
  "liked-works",
  "liked-readers",
] as const;

export type SavedFilterKey = (typeof SAVED_FILTER_KEYS)[number];

export function resolveSavedFilter(value: string): SavedFilterKey | null {
  if (value === "bookmarked-works") return "bookmarked-works";
  if (value === "followed-authors") return "followed-authors";
  if (value === "liked-authors") return "liked-authors";
  if (value === "liked-works") return "liked-works";
  if (value === "liked-readers") return "liked-readers";
  return null;
}

export function getSavedFilterLabel(value: SavedFilterKey): string {
  if (value === "bookmarked-works") return "ブックマーク作品";
  if (value === "followed-authors") return "フォローした作者";
  if (value === "liked-authors") return "いいねした作者";
  if (value === "liked-works") return "いいねした作品";
  return "いいねした朗読";
}
