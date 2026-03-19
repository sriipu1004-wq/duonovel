"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type ContinueReadingCardProps = {
  seriesId: string;
  fallbackEpisodeNumber?: number | null;
  fallbackReaderKey?: string;
  fallbackReaderName?: string;
};

type BookmarkData = {
  seriesId: string;
  episodeNumber: number;
  episodeTitle?: string;
  currentTime: number;
  duration: number;
  readerKey?: string;
  readerName?: string;
  savedAt: string;
};

function formatTime(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "0:00";

  const totalSeconds = Math.floor(value);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function buildReadHref(
  seriesId: string,
  episodeNumber: number,
  readerKey?: string,
  readerName?: string,
  startAt?: number
): string {
  const query = new URLSearchParams();

  if (readerKey) query.set("readerKey", readerKey);
  if (readerName) query.set("readerName", readerName);
  if (typeof startAt === "number" && Number.isFinite(startAt) && startAt > 0) {
    query.set("startAt", String(Math.floor(startAt)));
  }

  const queryString = query.toString();
  return `/read/${seriesId}/${episodeNumber}${queryString ? `?${queryString}` : ""}`;
}

export default function ContinueReadingCard({
  seriesId,
  fallbackEpisodeNumber,
  fallbackReaderKey,
  fallbackReaderName,
}: ContinueReadingCardProps) {
  const [bookmark, setBookmark] = useState<BookmarkData | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(`duonovel:bookmark:${seriesId}`);
      if (!raw) {
        setBookmark(null);
        setLoaded(true);
        return;
      }

      const parsed = JSON.parse(raw) as BookmarkData;
      if (!parsed || parsed.seriesId !== seriesId) {
        setBookmark(null);
        setLoaded(true);
        return;
      }

      setBookmark(parsed);
      setLoaded(true);
    } catch {
      setBookmark(null);
      setLoaded(true);
    }
  }, [seriesId]);

  const progressText = useMemo(() => {
    if (!bookmark) return "";

    if (bookmark.duration > 0) {
      const percent = Math.min(
        100,
        Math.max(0, Math.floor((bookmark.currentTime / bookmark.duration) * 100))
      );
      return `${formatTime(bookmark.currentTime)} / ${formatTime(bookmark.duration)} ・ ${percent}%`;
    }

    return `${formatTime(bookmark.currentTime)}`;
  }, [bookmark]);

  if (!loaded) {
    return (
      <div className="mt-4 rounded-3xl border border-white/10 bg-white/[0.03] p-4 text-sm text-neutral-400">
        しおりを確認中...
      </div>
    );
  }

  if (!bookmark) {
    return (
      <div className="mt-4 rounded-3xl border border-white/10 bg-white/[0.03] p-4">
        <p className="text-sm text-neutral-500">しおり未保存</p>
        <p className="mt-2 text-sm text-neutral-400">
          まだ保存された続きを読める位置がない。最初の話から始める。
        </p>

        {fallbackEpisodeNumber ? (
          <Link
            href={buildReadHref(
              seriesId,
              fallbackEpisodeNumber,
              fallbackReaderKey,
              fallbackReaderName
            )}
            className="mt-4 inline-flex rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition hover:opacity-90"
          >
            第1話から読む
          </Link>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-3xl border border-white/10 bg-white/[0.03] p-4">
      <p className="text-sm text-neutral-500">保存済みの続き</p>
      <p className="mt-2 text-xl font-semibold text-white">
        第{bookmark.episodeNumber}話
      </p>

      {bookmark.episodeTitle ? (
        <p className="mt-2 text-sm text-neutral-300">{bookmark.episodeTitle}</p>
      ) : null}

      {bookmark.readerName ? (
        <p className="mt-2 text-sm text-neutral-300">
          朗読者固定: {bookmark.readerName}
        </p>
      ) : null}

      <p className="mt-2 text-sm text-neutral-400">{progressText}</p>

      <Link
        href={buildReadHref(
          seriesId,
          bookmark.episodeNumber,
          bookmark.readerKey,
          bookmark.readerName,
          bookmark.currentTime
        )}
        className="mt-4 inline-flex rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition hover:opacity-90"
      >
        続きから読む
      </Link>
    </div>
  );
}