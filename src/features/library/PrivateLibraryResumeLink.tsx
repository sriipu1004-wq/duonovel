"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  READING_BOOKMARK_CHANGED_EVENT,
  READING_HISTORY_CHANGED_EVENT,
  applyReadingModeToHref,
  formatReadingCoordinates,
  readPreferredReadingPosition,
  type ReadingBookmark,
  type ReadingHistory,
} from "@/lib/playback/readingBookmark";
import { buildPrivateLibraryReadHref } from "@/lib/library/privateLibrary";

export default function PrivateLibraryResumeLink({
  workId,
  fallbackChapterNumber,
  hasReadingHistory,
}: {
  workId: string;
  fallbackChapterNumber: number;
  hasReadingHistory: boolean;
}) {
  const seriesId = `private-library:${workId}`;
  const [location, setLocation] = useState<
    ReadingBookmark | ReadingHistory | null
  >(null);

  useEffect(() => {
    const sync = () => setLocation(readPreferredReadingPosition(seriesId));
    sync();
    window.addEventListener(READING_BOOKMARK_CHANGED_EVENT, sync);
    window.addEventListener(READING_HISTORY_CHANGED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(READING_BOOKMARK_CHANGED_EVENT, sync);
      window.removeEventListener(READING_HISTORY_CHANGED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [seriesId]);

  const chapterNumber = location?.episodeNumber ?? fallbackChapterNumber;
  const baseHref = buildPrivateLibraryReadHref(workId, chapterNumber);
  const href = location ? applyReadingModeToHref(baseHref, location) : baseHref;
  const title = location
    ? `第${chapterNumber}話・${formatReadingCoordinates(location)}から再開`
    : undefined;

  return (
    <Link
      href={href}
      title={title}
      className="rounded-full bg-black px-4 py-2 text-sm font-semibold text-white transition hover:bg-neutral-800"
    >
      {location || hasReadingHistory ? "続きから読む" : "読み始める"}
    </Link>
  );
}
