"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  READING_BOOKMARK_CHANGED_EVENT,
  readReadingBookmark,
} from "@/lib/playback/readingBookmark";
import {
  buildPrivateLibraryReadHref,
  formatCharacterCount,
} from "@/lib/library/privateLibrary";

export type PrivateLibrarySectionListItem = {
  section_number: number;
  section_title: string;
  first_unit_number: number;
  part_count: number;
  source_char_count: number;
  progress_ratio: number | string;
  is_completed: boolean;
  has_ready_translation: boolean;
};

export default function PrivateLibrarySectionList({
  workId,
  sections,
}: {
  workId: string;
  sections: PrivateLibrarySectionListItem[];
}) {
  const seriesId = `private-library:${workId}`;
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

  return (
    <div className="grid gap-3 px-5 py-6 sm:px-8">
      {sections.map((section) => {
        const lastUnitNumber =
          section.first_unit_number + Math.max(1, section.part_count) - 1;
        const hasBookmark =
          bookmarkEpisodeNumber !== null &&
          bookmarkEpisodeNumber >= section.first_unit_number &&
          bookmarkEpisodeNumber <= lastUnitNumber;

        return (
          <Link
            key={section.section_number}
            href={buildPrivateLibraryReadHref(
              workId,
              hasBookmark && bookmarkEpisodeNumber
                ? bookmarkEpisodeNumber
                : section.first_unit_number
            )}
            className="flex items-center justify-between gap-4 rounded-2xl border border-black/10 bg-white px-4 py-4 transition hover:bg-neutral-50"
          >
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-2">
                <span className="truncate text-sm font-medium text-black">
                  {section.section_title}
                </span>
                {hasBookmark ? (
                  <span className="rounded-full bg-violet-100 px-2.5 py-1 text-[11px] font-semibold text-violet-700">
                    栞
                  </span>
                ) : null}
              </span>
              {section.part_count > 1 ? (
                <span className="mt-1 block text-[11px] text-neutral-400">
                  読書時に{section.part_count}部分へ自動分割
                </span>
              ) : null}
              {section.is_completed || Number(section.progress_ratio) > 0 ? (
                <span className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                  <span
                    className={
                      section.is_completed
                        ? "rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700"
                        : "rounded-full bg-sky-50 px-2 py-0.5 text-sky-700"
                    }
                  >
                    {section.is_completed
                      ? "読了"
                      : `読書中 ${Math.max(1, Math.round(Number(section.progress_ratio) * 100))}%`}
                  </span>
                  {section.has_ready_translation ? (
                    <span className="rounded-full bg-violet-50 px-2 py-0.5 text-violet-700">
                      対訳あり
                    </span>
                  ) : null}
                </span>
              ) : section.has_ready_translation ? (
                <span className="mt-2 block text-[11px] text-violet-700">
                  対訳あり
                </span>
              ) : null}
            </span>
            <span className="shrink-0 text-xs text-neutral-500">
              {formatCharacterCount(section.source_char_count)}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
