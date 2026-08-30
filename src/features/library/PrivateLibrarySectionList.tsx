"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  READING_BOOKMARK_CHANGED_EVENT,
  readReadingBookmark,
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
  const [bookmarkEpisodeNumber, setBookmarkEpisodeNumber] = useState<
    number | null
  >(null);

  useEffect(() => {
    function syncBookmark() {
      setBookmarkEpisodeNumber(
        readReadingBookmark(seriesId)?.episodeNumber ?? null
      );
    }
    syncBookmark();
    window.addEventListener(READING_BOOKMARK_CHANGED_EVENT, syncBookmark);
    window.addEventListener("storage", syncBookmark);
    return () => {
      window.removeEventListener(READING_BOOKMARK_CHANGED_EVENT, syncBookmark);
      window.removeEventListener("storage", syncBookmark);
    };
  }, [seriesId]);

  useEffect(() => {
    if (bookmarkEpisodeNumber === null) return;
    const localTarget = listRef.current?.querySelector<HTMLElement>(
      `[data-unit-number="${bookmarkEpisodeNumber}"]`
    );
    if (localTarget) {
      window.requestAnimationFrame(() =>
        localTarget.scrollIntoView({ behavior: "auto", block: "start" })
      );
      return;
    }

    const targetPage = Math.floor((bookmarkEpisodeNumber - 1) / unitsPerPage) + 1;
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
            return (
              <li key={unit.id} data-unit-number={unit.chapter_number}>
                <Link
                  href={buildPrivateLibraryReadHref(workId, unit.chapter_number)}
                  className="flex items-center justify-between gap-4 bg-white px-4 py-4 transition hover:bg-neutral-50"
                >
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium text-black">
                        {unit.title}
                      </span>
                      {hasBookmark ? (
                        <span className="rounded-full bg-sky-600 px-2.5 py-1 text-[11px] font-semibold text-white">
                          続きを読む
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
