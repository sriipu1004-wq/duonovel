export type ReadingBookmark = {
  seriesId: string;
  episodeNumber: number;
  positionIndex: number;
  unitIndex: number;
  readerKey?: string;
  readerName?: string;
  savedAt: string;
};

export const READING_BOOKMARK_CHANGED_EVENT =
  "duonovel:reading-bookmark-changed";

export function readingBookmarkStorageKey(seriesId: string): string {
  return `duonovel:bookmark:${seriesId}`;
}

function safeIndex(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
}

export function readReadingBookmark(seriesId: string): ReadingBookmark | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(readingBookmarkStorageKey(seriesId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ReadingBookmark> | null;
    if (!parsed || parsed.seriesId !== seriesId) return null;

    const episodeNumber = Number(parsed.episodeNumber);
    if (!Number.isFinite(episodeNumber) || episodeNumber < 1) return null;
    const positionIndex = safeIndex(parsed.positionIndex ?? parsed.unitIndex);

    return {
      seriesId,
      episodeNumber: Math.floor(episodeNumber),
      positionIndex,
      unitIndex: positionIndex,
      ...(typeof parsed.readerKey === "string" && parsed.readerKey
        ? { readerKey: parsed.readerKey }
        : {}),
      ...(typeof parsed.readerName === "string" && parsed.readerName
        ? { readerName: parsed.readerName }
        : {}),
      savedAt:
        typeof parsed.savedAt === "string" && parsed.savedAt
          ? parsed.savedAt
          : new Date(0).toISOString(),
    };
  } catch {
    return null;
  }
}

export function writeReadingBookmark(
  bookmark: Omit<ReadingBookmark, "unitIndex" | "savedAt"> & {
    unitIndex?: number;
    savedAt?: string;
  }
): ReadingBookmark {
  const positionIndex = safeIndex(
    bookmark.positionIndex ?? bookmark.unitIndex
  );
  const normalized: ReadingBookmark = {
    ...bookmark,
    episodeNumber: Math.max(1, Math.floor(bookmark.episodeNumber)),
    positionIndex,
    unitIndex: positionIndex,
    savedAt: bookmark.savedAt ?? new Date().toISOString(),
  };

  window.localStorage.setItem(
    readingBookmarkStorageKey(bookmark.seriesId),
    JSON.stringify(normalized)
  );
  window.dispatchEvent(
    new CustomEvent(READING_BOOKMARK_CHANGED_EVENT, {
      detail: normalized,
    })
  );
  return normalized;
}
