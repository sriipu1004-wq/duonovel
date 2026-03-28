"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type BookmarkedSeriesListProps = {
  userId: string;
};

type BookmarkRow = {
  id: string;
  series_id: string;
  created_at?: string | null;
};

type SeriesRow = {
  id: string;
  title?: string | null;
  description?: string | null;
};

type BookmarkedSeriesItem = {
  bookmarkId: string;
  createdAt: string;
  seriesId: string;
  title: string;
  summary: string;
};

function pickText(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return "";
}

function formatDateTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleString("ja-JP");
}

export default function BookmarkedSeriesList({
  userId,
}: BookmarkedSeriesListProps) {
  const [items, setItems] = useState<BookmarkedSeriesItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [workingBookmarkId, setWorkingBookmarkId] = useState<string | null>(null);

  const loadBookmarks = useCallback(async () => {
    setLoaded(false);
    setErrorMessage(null);

    const { data: bookmarkData, error: bookmarkError } = await supabase
      .from("user_series_bookmarks")
      .select("id, series_id, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (bookmarkError) {
      setErrorMessage(`ブックマーク一覧の取得に失敗: ${bookmarkError.message}`);
      setItems([]);
      setLoaded(true);
      return;
    }

    const bookmarks = (bookmarkData ?? []) as BookmarkRow[];

    if (bookmarks.length === 0) {
      setItems([]);
      setLoaded(true);
      return;
    }

    const seriesIds = Array.from(new Set(bookmarks.map((row) => row.series_id)));

    const { data: seriesData, error: seriesError } = await supabase
      .from("series")
      .select("id, title, description")
      .in("id", seriesIds);

    if (seriesError) {
      setErrorMessage(`作品情報の取得に失敗: ${seriesError.message}`);
      setItems([]);
      setLoaded(true);
      return;
    }

    const seriesMap = new Map<string, SeriesRow>();
    for (const row of (seriesData ?? []) as SeriesRow[]) {
      seriesMap.set(row.id, row);
    }

    const nextItems: BookmarkedSeriesItem[] = bookmarks.map((bookmark) => {
      const series = seriesMap.get(bookmark.series_id);

      return {
        bookmarkId: bookmark.id,
        createdAt: typeof bookmark.created_at === "string" ? bookmark.created_at : "",
        seriesId: bookmark.series_id,
        title: pickText(series?.title) || "無題",
        summary: pickText(series?.description) || "あらすじはまだ登録されていない。",
      };
    });

    setItems(nextItems);
    setLoaded(true);
  }, [userId]);

  useEffect(() => {
    void loadBookmarks();
  }, [loadBookmarks]);

  async function handleRemove(bookmarkId: string) {
    const previousItems = items;

    setWorkingBookmarkId(bookmarkId);
    setErrorMessage(null);
    setItems((current) =>
      current.filter((item) => item.bookmarkId !== bookmarkId)
    );

    const { error } = await supabase
      .from("user_series_bookmarks")
      .delete()
      .eq("id", bookmarkId)
      .eq("user_id", userId);

    if (error) {
      setItems(previousItems);
      setErrorMessage(`ブックマーク解除に失敗: ${error.message}`);
      setWorkingBookmarkId(null);
      return;
    }

    setWorkingBookmarkId(null);
  }

  if (!loaded) {
    return (
      <div className="mt-4 rounded-[24px] border border-white/10 bg-white/[0.03] p-4 text-sm text-neutral-400">
        ブックマーク一覧を読み込み中...
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="mt-4 rounded-[24px] border border-dashed border-white/10 bg-white/[0.03] p-4">
        <p className="text-sm font-semibold text-white">まだお気に入り作品がない</p>
        <p className="mt-2 text-sm leading-7 text-neutral-400">
          作品ページから追加した作品がここに並ぶ。
        </p>
        {errorMessage ? (
          <p className="mt-3 text-xs leading-6 text-amber-300">{errorMessage}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-4">
      {errorMessage ? (
        <div className="rounded-[24px] border border-amber-400/20 bg-amber-400/10 p-4 text-sm leading-7 text-amber-200">
          {errorMessage}
        </div>
      ) : null}

      {items.map((item) => (
        <article
          key={item.bookmarkId}
          className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs tracking-[0.18em] text-neutral-500">
                BOOKMARK
              </p>
              <h3 className="mt-2 text-lg font-semibold text-white">
                {item.title}
              </h3>

              {item.createdAt ? (
                <p className="mt-2 text-xs text-neutral-500">
                  保存日時: {formatDateTime(item.createdAt)}
                </p>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href={`/works/${item.seriesId}`}
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
              >
                作品ページへ
              </Link>

              <button
                type="button"
                onClick={() => handleRemove(item.bookmarkId)}
                disabled={workingBookmarkId === item.bookmarkId}
                className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-neutral-300 transition hover:bg-white hover:text-black disabled:opacity-70"
              >
                {workingBookmarkId === item.bookmarkId ? "解除中..." : "解除"}
              </button>
            </div>
          </div>

          <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-neutral-400">
            {item.summary}
          </p>
        </article>
      ))}
    </div>
  );
}