"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  readReadingBookmark,
  readReadingHistory,
  READING_BOOKMARK_CHANGED_EVENT,
  READING_HISTORY_CHANGED_EVENT,
} from "@/lib/playback/readingBookmark";
import {
  applyLocalReadEpisode,
  firstNewEpisodeNumber,
  type FollowingUpdateItem,
} from "@/lib/updates/followingUpdates";
import type { FollowingUpdatesCopy } from "@/i18n/dictionaries/home";

function fill(template: string, value: number): string {
  return template.replace("{n}", String(value));
}

function refineWithLocalHistory(items: FollowingUpdateItem[]): FollowingUpdateItem[] {
  const refined: FollowingUpdateItem[] = [];
  for (const item of items) {
    // The reader already keeps the last position per work in this browser;
    // no new identifier is created here.
    const furthest = Math.max(
      readReadingHistory(item.seriesId)?.episodeNumber ?? 0,
      readReadingBookmark(item.seriesId)?.episodeNumber ?? 0
    );
    const next = applyLocalReadEpisode(item, furthest);
    if (next) refined.push(next);
  }
  return refined;
}

export default function FollowingUpdatesList({
  items,
  copy,
  dateLocale,
}: {
  items: FollowingUpdateItem[];
  copy: FollowingUpdatesCopy;
  dateLocale: string;
}) {
  const [visibleItems, setVisibleItems] = useState(items);

  useEffect(() => {
    const refresh = () => setVisibleItems(refineWithLocalHistory(items));
    refresh();
    window.addEventListener(READING_HISTORY_CHANGED_EVENT, refresh);
    window.addEventListener(READING_BOOKMARK_CHANGED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(READING_HISTORY_CHANGED_EVENT, refresh);
      window.removeEventListener(READING_BOOKMARK_CHANGED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [items]);

  if (visibleItems.length === 0) {
    return (
      <div className="mt-6 rounded-[24px] border border-dashed border-black/15 bg-neutral-50 px-5 py-6 text-sm leading-7 text-neutral-600">
        {copy.empty}
      </div>
    );
  }

  const dateFormat = new Intl.DateTimeFormat(dateLocale, {
    month: "2-digit",
    day: "2-digit",
  });

  return (
    <ul className="mt-6 grid gap-3 sm:grid-cols-2">
      {visibleItems.map((item) => {
        const startEpisode = firstNewEpisodeNumber(item);
        const latest = item.newEpisodes[0];
        return (
          <li
            key={item.seriesId}
            className="rounded-[24px] border border-black/10 bg-white p-4"
          >
            <div className="flex flex-wrap gap-2 text-[11px] text-neutral-600">
              {item.reasons.map((reason) => (
                <span
                  key={reason}
                  className="rounded-full border border-black/10 bg-neutral-50 px-2.5 py-1"
                >
                  {reason === "bookmark" ? copy.reasonBookmark : copy.reasonAuthor}
                </span>
              ))}
              <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-sky-800">
                {fill(copy.newCount, item.newEpisodes.length)}
              </span>
            </div>
            <h3 className="mt-2 text-base font-semibold text-black">
              <Link href={`/works/${item.seriesId}`} className="hover:underline">
                {item.title}
              </Link>
            </h3>
            {item.authorName ? (
              <p className="mt-1 text-xs text-neutral-500">{item.authorName}</p>
            ) : null}
            {latest ? (
              <p className="mt-2 text-sm text-neutral-700">
                {fill(copy.episode, latest.episodeNumber)}
                {latest.title ? <span className="ml-2">{latest.title}</span> : null}
                {latest.postedAtValue > 0 ? (
                  <span className="ml-2 text-xs text-neutral-500">
                    {dateFormat.format(new Date(latest.postedAtValue))}
                  </span>
                ) : null}
              </p>
            ) : null}
            {startEpisode !== null ? (
              <Link
                href={`/read/${item.seriesId}/${startEpisode}`}
                className="mt-3 inline-flex rounded-full bg-black px-4 py-2 text-sm font-semibold text-white transition hover:bg-neutral-800"
              >
                {fill(copy.readFrom, startEpisode)}
              </Link>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
