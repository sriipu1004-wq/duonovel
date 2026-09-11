"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  READING_BOOKMARK_CHANGED_EVENT,
  READING_HISTORY_CHANGED_EVENT,
  applyReadingModeToHref,
  formatReadingCoordinates,
  hasSameReadingCoordinates,
  readReadingBookmark,
  readReadingHistory,
  type ReadingBookmark,
  type ReadingHistory,
} from "@/lib/playback/readingBookmark";
import {
  buildPrivateLibraryReadHref,
  formatCharacterCount,
} from "@/lib/library/privateLibrary";

export type PrivateLibraryUnitListItem = {
  id: string;
  chapter_number: number;
  title: string;
  section_number: number;
  part_number: number;
  part_count: number;
  source_char_count: number;
  progress_ratio: number | string;
  is_completed: boolean;
  has_ready_translation: boolean;
};

export default function PrivateLibrarySectionList({
  workId,
  units,
  currentPage,
  unitsPerPage,
}: {
  workId: string;
  units: PrivateLibraryUnitListItem[];
  currentPage: number;
  unitsPerPage: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const seriesId = `private-library:${workId}`;
  const listRef = useRef<HTMLUListElement | null>(null);
  const autoLocatedSeriesRef = useRef<string | null>(null);
  const [bookmarkEpisodeNumber, setBookmarkEpisodeNumber] = useState<
    number | null
  >(null);
  const [bookmarkLocation, setBookmarkLocation] =
    useState<ReadingBookmark | null>(null);
  const [historyLocation, setHistoryLocation] =
    useState<ReadingHistory | null>(null);

  useEffect(() => {
    function syncBookmark() {
      const bookmark = readReadingBookmark(seriesId);
      setBookmarkLocation(bookmark);
      setHistoryLocation(readReadingHistory(seriesId));
      setBookmarkEpisodeNumber(bookmark?.episodeNumber ?? null);
    }
    syncBookmark();
    window.addEventListener(READING_BOOKMARK_CHANGED_EVENT, syncBookmark);
    window.addEventListener(READING_HISTORY_CHANGED_EVENT, syncBookmark);
    window.addEventListener("storage", syncBookmark);
    return () => {
      window.removeEventListener(READING_BOOKMARK_CHANGED_EVENT, syncBookmark);
      window.removeEventListener(READING_HISTORY_CHANGED_EVENT, syncBookmark);
      window.removeEventListener("storage", syncBookmark);
    };
  }, [seriesId]);

  useEffect(() => {
    const preferredEpisodeNumber =
      bookmarkEpisodeNumber ?? historyLocation?.episodeNumber ?? null;
    if (preferredEpisodeNumber === null) return;
    if (autoLocatedSeriesRef.current === seriesId) return;
    autoLocatedSeriesRef.current = seriesId;
    const localTarget = listRef.current?.querySelector<HTMLElement>(
      `[data-unit-number="${preferredEpisodeNumber}"]`
    );
    if (localTarget) {
      window.requestAnimationFrame(() =>
        localTarget.scrollIntoView({ behavior: "auto", block: "start" })
      );
      return;
    }

    const targetPage = Math.floor((preferredEpisodeNumber - 1) / unitsPerPage) + 1;
    if (targetPage === currentPage) return;
    const query = new URLSearchParams(searchParams.toString());
    query.set("page", String(targetPage));
    router.replace(`${pathname}?${query.toString()}`);
  }, [
    bookmarkEpisodeNumber,
    currentPage,
    pathname,
    router,
    searchParams,
    unitsPerPage,
    workId,
    historyLocation?.episodeNumber,
  ]);

  return (
    <div className="px-5 py-6 sm:px-8">
      <div className="overflow-hidden rounded-[20px] border border-black/10">
        <ul
          ref={listRef}
          className="max-h-[760px] divide-y divide-black/10 overflow-y-auto overscroll-contain"
        >
          {units.map((unit) => {
            const hasBookmark = bookmarkEpisodeNumber === unit.chapter_number;
            const bookmark =
              bookmarkLocation?.episodeNumber === unit.chapter_number
                ? bookmarkLocation
                : null;
            const history =
              historyLocation?.episodeNumber === unit.chapter_number
                ? historyLocation
                : null;
            const location = bookmark ?? history;
            const href = buildPrivateLibraryReadHref(
              workId,
              unit.chapter_number
            );
            return (
              <li key={unit.id} data-unit-number={unit.chapter_number}>
                <Link
                  href={location ? applyReadingModeToHref(href, location) : href}
                  className="flex items-center justify-between gap-4 bg-white px-4 py-4 transition hover:bg-neutral-50"
                >
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium text-black">
                        {unit.title}
                      </span>
                      {hasBookmark ||
                      (!bookmarkLocation &&
                        history?.episodeNumber === unit.chapter_number) ? (
                        <span className="rounded-full bg-sky-600 px-2.5 py-1 text-[11px] font-semibold text-white">
                          続きを読む
                        </span>
                      ) : null}
                      {bookmark ? (
                        <span className="rounded-full bg-violet-100 px-2.5 py-1 text-[11px] font-semibold text-violet-700">
                          栞・{formatReadingCoordinates(bookmark)}
                        </span>
                      ) : null}
                      {history &&
                      (!bookmark || !hasSameReadingCoordinates(bookmark, history)) ? (
                        <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-semibold text-neutral-700">
                          最終閲覧・{formatReadingCoordinates(history)}
                        </span>
                      ) : null}
                    </span>
                    {unit.is_completed || Number(unit.progress_ratio) > 0 ? (
                      <span className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                        <span
                          className={
                            unit.is_completed
                              ? "rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700"
                              : "rounded-full bg-sky-50 px-2 py-0.5 text-sky-700"
                          }
                        >
                          {unit.is_completed
                            ? "読了"
                            : `読書中 ${Math.max(1, Math.round(Number(unit.progress_ratio) * 100))}%`}
                        </span>
                        {unit.has_ready_translation ? (
                          <span className="rounded-full bg-violet-50 px-2 py-0.5 text-violet-700">
                            対訳あり
                          </span>
                        ) : null}
                      </span>
                    ) : unit.has_ready_translation ? (
                      <span className="mt-2 block text-[11px] text-violet-700">
                        対訳あり
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-xs text-neutral-500">
                    {formatCharacterCount(unit.source_char_count)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
