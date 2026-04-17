"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type BookmarkedSeriesListProps = {
  userId: string;
  surface?: "dark" | "light";
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
  surface = "dark",
}: BookmarkedSeriesListProps) {
  const [items, setItems] = useState<BookmarkedSeriesItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [workingBookmarkId, setWorkingBookmarkId] = useState<string | null>(null);

  const isLight = surface === "light";

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
    setItems((current) => current.filter((item) => item.bookmarkId !== bookmarkId));

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
      <div
        className={[
          "mt-4 rounded-[24px] p-4 text-sm",
          isLight
            ? "border border-black/10 bg-neutral-50 text-neutral-600"
            : "border border-white/10 bg-white/[0.03] text-neutral-400",
        ].join(" ")}
      >
        ブックマーク一覧を読み込み中...
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div
        className={[
          "mt-4 rounded-[24px] p-4",
          isLight
            ? "border border-dashed border-black/15 bg-neutral-50"
            : "border border-dashed border-white/10 bg-white/[0.03]",
        ].join(" ")}
      >
        <p className={isLight ? "text-sm font-semibold text-black" : "text-sm font-semibold text-white"}>
          まだブックマーク作品がない
        </p>
        <p
          className={[
            "mt-2 text-sm leading-7",
            isLight ? "text-neutral-600" : "text-neutral-400",
          ].join(" ")}
        >
          作品ページからブックマークした作品がここに並ぶ。
        </p>
        {errorMessage ? (
          <p
            className={[
              "mt-3 text-xs leading-6",
              isLight ? "text-amber-700" : "text-amber-300",
            ].join(" ")}
          >
            {errorMessage}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-4">
      {errorMessage ? (
        <div
          className={[
            "rounded-[24px] p-4 text-sm leading-7",
            isLight
              ? "border border-amber-200 bg-amber-50 text-amber-700"
              : "border border-amber-400/20 bg-amber-400/10 text-amber-200",
          ].join(" ")}
        >
          {errorMessage}
        </div>
      ) : null}

      {items.map((item) => (
        <article
          key={item.bookmarkId}
          className={[
            "rounded-[24px] p-4",
            isLight
              ? "border border-black/10 bg-white"
              : "border border-white/10 bg-white/[0.03]",
          ].join(" ")}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p
                className={[
                  "text-xs tracking-[0.18em]",
                  isLight ? "text-neutral-500" : "text-neutral-500",
                ].join(" ")}
              >
                BOOKMARK
              </p>
              <h3
                className={[
                  "mt-2 text-lg font-semibold",
                  isLight ? "text-black" : "text-white",
                ].join(" ")}
              >
                {item.title}
              </h3>

              {item.createdAt ? (
                <p
                  className={[
                    "mt-2 text-xs",
                    isLight ? "text-neutral-500" : "text-neutral-500",
                  ].join(" ")}
                >
                  保存日時: {formatDateTime(item.createdAt)}
                </p>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href={`/works/${item.seriesId}`}
                className={
                  isLight
                    ? "rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-neutral-800 transition hover:bg-neutral-50"
                    : "rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
                }
              >
                作品ページへ
              </Link>

              <button
                type="button"
                onClick={() => handleRemove(item.bookmarkId)}
                disabled={workingBookmarkId === item.bookmarkId}
                className={
                  isLight
                    ? "rounded-full border border-black/10 bg-neutral-50 px-4 py-2 text-sm text-neutral-700 transition hover:bg-neutral-100 disabled:opacity-70"
                    : "rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-neutral-300 transition hover:bg-white hover:text-black disabled:opacity-70"
                }
              >
                {workingBookmarkId === item.bookmarkId ? "解除中..." : "ブックマーク解除"}
              </button>
            </div>
          </div>

          <p
            className={[
              "mt-4 whitespace-pre-wrap text-sm leading-7",
              isLight ? "text-neutral-600" : "text-neutral-400",
            ].join(" ")}
          >
            {item.summary}
          </p>
        </article>
      ))}
    </div>
  );
}