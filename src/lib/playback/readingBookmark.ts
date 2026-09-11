export type ReadingBookmark = {
  seriesId: string;
  episodeNumber: number;
  positionIndex: number;
  unitIndex: number;
  paragraphIndex?: number;
  sentenceIndex?: number;
  mode?: ReadingMode;
  sourceLanguage?: string;
  targetLanguage?: string;
  episodeTitle?: string;
  currentTime?: number;
  duration?: number;
  readerKey?: string;
  readerName?: string;
  savedAt: string;
};

export type ReadingMode = "standard" | "bilingual";

export type ReadingHistory = {
  seriesId: string;
  episodeNumber: number;
  positionIndex: number;
  paragraphIndex?: number;
  sentenceIndex?: number;
  mode: ReadingMode;
  sourceLanguage?: string;
  targetLanguage?: string;
  savedAt: string;
};

export const READING_BOOKMARK_CHANGED_EVENT =
  "duonovel:reading-bookmark-changed";
export const READING_HISTORY_CHANGED_EVENT =
  "duonovel:reading-history-changed";

export function readingBookmarkStorageKey(seriesId: string): string {
  return `duonovel:bookmark:${seriesId}`;
}

export function readingHistoryStorageKey(seriesId: string): string {
  return `duonovel:reading-history:${seriesId}`;
}

function safeIndex(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
}

function optionalIndex(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readingMode(value: unknown): ReadingMode {
  return value === "bilingual" ? "bilingual" : "standard";
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
      ...(optionalIndex(parsed.paragraphIndex) !== undefined
        ? { paragraphIndex: optionalIndex(parsed.paragraphIndex) }
        : {}),
      ...(optionalIndex(parsed.sentenceIndex) !== undefined
        ? { sentenceIndex: optionalIndex(parsed.sentenceIndex) }
        : {}),
      mode: readingMode(parsed.mode),
      ...(optionalText(parsed.sourceLanguage)
        ? { sourceLanguage: optionalText(parsed.sourceLanguage) }
        : {}),
      ...(optionalText(parsed.targetLanguage)
        ? { targetLanguage: optionalText(parsed.targetLanguage) }
        : {}),
      ...(optionalText(parsed.episodeTitle)
        ? { episodeTitle: optionalText(parsed.episodeTitle) }
        : {}),
      ...(optionalNumber(parsed.currentTime) !== undefined
        ? { currentTime: optionalNumber(parsed.currentTime) }
        : {}),
      ...(optionalNumber(parsed.duration) !== undefined
        ? { duration: optionalNumber(parsed.duration) }
        : {}),
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

export function readReadingHistory(seriesId: string): ReadingHistory | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(readingHistoryStorageKey(seriesId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ReadingHistory> | null;
    if (!parsed || parsed.seriesId !== seriesId) return null;
    const episodeNumber = Number(parsed.episodeNumber);
    if (!Number.isFinite(episodeNumber) || episodeNumber < 1) return null;

    return {
      seriesId,
      episodeNumber: Math.floor(episodeNumber),
      positionIndex: safeIndex(parsed.positionIndex),
      ...(optionalIndex(parsed.paragraphIndex) !== undefined
        ? { paragraphIndex: optionalIndex(parsed.paragraphIndex) }
        : {}),
      ...(optionalIndex(parsed.sentenceIndex) !== undefined
        ? { sentenceIndex: optionalIndex(parsed.sentenceIndex) }
        : {}),
      mode: readingMode(parsed.mode),
      ...(optionalText(parsed.sourceLanguage)
        ? { sourceLanguage: optionalText(parsed.sourceLanguage) }
        : {}),
      ...(optionalText(parsed.targetLanguage)
        ? { targetLanguage: optionalText(parsed.targetLanguage) }
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

export function writeReadingHistory(
  history: Omit<ReadingHistory, "savedAt"> & { savedAt?: string }
): ReadingHistory {
  const normalized: ReadingHistory = {
    ...history,
    episodeNumber: Math.max(1, Math.floor(history.episodeNumber)),
    positionIndex: safeIndex(history.positionIndex),
    ...(optionalIndex(history.paragraphIndex) !== undefined
      ? { paragraphIndex: optionalIndex(history.paragraphIndex) }
      : {}),
    ...(optionalIndex(history.sentenceIndex) !== undefined
      ? { sentenceIndex: optionalIndex(history.sentenceIndex) }
      : {}),
    mode: readingMode(history.mode),
    savedAt: history.savedAt ?? new Date().toISOString(),
  };

  try {
    window.localStorage.setItem(
      readingHistoryStorageKey(history.seriesId),
      JSON.stringify(normalized)
    );
    window.dispatchEvent(
      new CustomEvent(READING_HISTORY_CHANGED_EVENT, { detail: normalized })
    );
  } catch {
    // Reading history is a best-effort device-local enhancement.
  }
  return normalized;
}

export function readPreferredReadingPosition(
  seriesId: string
): ReadingBookmark | ReadingHistory | null {
  const bookmark = readReadingBookmark(seriesId);
  const history = readReadingHistory(seriesId);
  if (!bookmark) return history;
  // Resume at the explicit bookmark, using the most recently used reading mode.
  if (history && Date.parse(history.savedAt) >= Date.parse(bookmark.savedAt)) {
    return { ...bookmark, mode: history.mode, sourceLanguage: history.sourceLanguage, targetLanguage: history.targetLanguage };
  }
  return bookmark;
}

export function hasSameReadingCoordinates(
  left: Pick<ReadingBookmark | ReadingHistory, "episodeNumber" | "positionIndex" | "paragraphIndex" | "sentenceIndex">,
  right: Pick<ReadingBookmark | ReadingHistory, "episodeNumber" | "positionIndex" | "paragraphIndex" | "sentenceIndex">
): boolean {
  if (left.episodeNumber !== right.episodeNumber) return false;
  if (
    left.paragraphIndex !== undefined &&
    right.paragraphIndex !== undefined &&
    left.sentenceIndex !== undefined &&
    right.sentenceIndex !== undefined
  ) {
    return (
      left.paragraphIndex === right.paragraphIndex &&
      left.sentenceIndex === right.sentenceIndex
    );
  }
  return left.positionIndex === right.positionIndex;
}

export function formatReadingCoordinates(
  location: Pick<ReadingBookmark | ReadingHistory, "positionIndex" | "paragraphIndex" | "sentenceIndex">
): string {
  if (location.paragraphIndex !== undefined) {
    const sentence =
      location.sentenceIndex !== undefined
        ? `・第${location.sentenceIndex + 1}文`
        : "";
    return `第${location.paragraphIndex + 1}段落${sentence}`;
  }
  return `文位置 ${location.positionIndex + 1}`;
}

export function resolveReadingPositionIndex(
  segments: Array<{ paragraphIndex?: number; sentenceIndex?: number }>,
  location: Pick<ReadingBookmark | ReadingHistory, "positionIndex" | "paragraphIndex" | "sentenceIndex">
): number {
  if (
    location.paragraphIndex !== undefined &&
    location.sentenceIndex !== undefined
  ) {
    const savedIndex = Math.min(
      Math.max(0, location.positionIndex),
      Math.max(0, segments.length - 1)
    );
    const savedSegment = segments[savedIndex];
    if (
      savedSegment?.paragraphIndex === location.paragraphIndex &&
      savedSegment.sentenceIndex === location.sentenceIndex
    ) {
      return savedIndex;
    }
    const exactIndex = segments.findIndex(
      (segment) =>
        segment.paragraphIndex === location.paragraphIndex &&
        segment.sentenceIndex === location.sentenceIndex
    );
    if (exactIndex >= 0) return exactIndex;
  }
  return Math.min(
    Math.max(0, location.positionIndex),
    Math.max(0, segments.length - 1)
  );
}

export function applyReadingModeToHref(
  href: string,
  location: Pick<ReadingBookmark | ReadingHistory, "mode" | "sourceLanguage" | "targetLanguage"> &
    Partial<Pick<ReadingHistory, "positionIndex" | "paragraphIndex" | "sentenceIndex">>
): string {
  const url = new URL(href, "https://libread.local");
  url.searchParams.set("readingMode", location.mode ?? "standard");
  for (const [key, value] of [
    ["resumeIndex", location.positionIndex],
    ["resumeParagraph", location.paragraphIndex],
    ["resumeSentence", location.sentenceIndex],
  ] as const) {
    if (value !== undefined) url.searchParams.set(key, String(safeIndex(value)));
    else url.searchParams.delete(key);
  }
  if (location.mode === "bilingual" && location.targetLanguage) {
    url.searchParams.set("bilingual", "1");
    if (location.sourceLanguage) {
      url.searchParams.set("sourceLanguage", location.sourceLanguage);
    }
    url.searchParams.set("targetLanguage", location.targetLanguage);
    url.searchParams.set("lockLanguage", "1");
  } else {
    url.searchParams.delete("bilingual");
    url.searchParams.delete("sourceLanguage");
    url.searchParams.delete("targetLanguage");
    url.searchParams.delete("autoGenerate");
    url.searchParams.delete("lockLanguage");
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

// Explicit location links must win over an older bookmark in the same chapter.
export function readRequestedReadingPosition(
  seriesId: string,
  episodeNumber: number
): ReadingHistory | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const positionIndex = optionalIndex(params.get("resumeIndex"));
  if (positionIndex === undefined) return null;
  return {
    seriesId,
    episodeNumber,
    positionIndex,
    paragraphIndex: optionalIndex(params.get("resumeParagraph")),
    sentenceIndex: optionalIndex(params.get("resumeSentence")),
    mode: params.get("bilingual") === "1" ? "bilingual" : "standard",
    sourceLanguage: params.get("sourceLanguage") ?? undefined,
    targetLanguage: params.get("targetLanguage") ?? undefined,
    savedAt: new Date(0).toISOString(),
  };
}

export function readEpisodeReadingPosition(seriesId: string, episodeNumber: number) {
  const requested = readRequestedReadingPosition(seriesId, episodeNumber);
  if (requested) return requested;
  const bookmark = readReadingBookmark(seriesId);
  if (bookmark?.episodeNumber === episodeNumber) return bookmark;
  const history = readReadingHistory(seriesId);
  return history?.episodeNumber === episodeNumber ? history : null;
}
