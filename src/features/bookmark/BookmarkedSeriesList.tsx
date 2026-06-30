"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type BookmarkOrder = "updated" | "added";
type BookmarkedSeriesListProps = { userId: string; surface?: "dark" | "light"; limit?: number; storageKey?: string; showOrderControls?: boolean };
type BookmarkRow = { id: string; series_id: string; created_at?: string | null };
type SeriesRow = { id: string; title?: string | null; description?: string | null; summary?: string | null; updated_at?: string | null; created_at?: string | null };
type BookmarkedSeriesItem = { bookmarkId: string; addedAt: string; updatedAt: string; seriesId: string; title: string; summary: string };

function pickText(...values: unknown[]): string { for (const value of values) if (typeof value === "string" && value.trim()) return value.trim(); return ""; }
function toTime(value: string): number { const timestamp = new Date(value).getTime(); return Number.isNaN(timestamp) ? 0 : timestamp; }
function formatDate(value: string): string { const date = new Date(value); return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("ja-JP"); }
function sortItems(items: BookmarkedSeriesItem[], order: BookmarkOrder) { return [...items].sort((a, b) => toTime(order === "updated" ? b.updatedAt : b.addedAt) - toTime(order === "updated" ? a.updatedAt : a.addedAt)); }

async function fetchBookmarkSeries(seriesIds: string[]): Promise<{ rows: SeriesRow[]; errorMessage: string }> {
  const selections = [
    "id, title, description, summary, updated_at, created_at",
    "id, title, description, summary, created_at",
    "id, title, description, created_at",
    "id, title, description",
  ];
  let lastError = "";
  for (const selection of selections) {
    const result = await supabase.from("series").select(selection).in("id", seriesIds);
    if (!result.error) return { rows: (result.data ?? []) as unknown as SeriesRow[], errorMessage: "" };
    lastError = result.error.message;
  }
  return { rows: [], errorMessage: lastError || "作品情報を取得できない。" };
}

export default function BookmarkedSeriesList({ userId, surface = "dark", limit, storageKey = "libread:mypage:bookmark-order", showOrderControls = false }: BookmarkedSeriesListProps) {
  const [items, setItems] = useState<BookmarkedSeriesItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [order, setOrder] = useState<BookmarkOrder>("updated");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [workingBookmarkId, setWorkingBookmarkId] = useState<string | null>(null);
  const isLight = surface === "light";

  useEffect(() => { try { const stored = window.localStorage.getItem(storageKey); if (stored === "updated" || stored === "added") setOrder(stored); } catch {} }, [storageKey]);
  const changeOrder = useCallback((nextOrder: BookmarkOrder) => { setOrder(nextOrder); try { window.localStorage.setItem(storageKey, nextOrder); } catch {} }, [storageKey]);

  const loadBookmarks = useCallback(async () => {
    setLoaded(false); setErrorMessage(null);
    const { data: bookmarkData, error: bookmarkError } = await supabase.from("user_series_bookmarks").select("id, series_id, created_at").eq("user_id", userId);
    if (bookmarkError) { setErrorMessage(`ブックマーク一覧の取得に失敗: ${bookmarkError.message}`); setItems([]); setLoaded(true); return; }
    const bookmarks = (bookmarkData ?? []) as BookmarkRow[];
    if (!bookmarks.length) { setItems([]); setLoaded(true); return; }
    const { rows, errorMessage: seriesError } = await fetchBookmarkSeries(Array.from(new Set(bookmarks.map((row) => row.series_id))));
    if (seriesError) { setErrorMessage(`作品情報の取得に失敗: ${seriesError}`); setItems([]); setLoaded(true); return; }
    const seriesMap = new Map(rows.map((row) => [row.id, row]));
    setItems(bookmarks.map((bookmark) => {
      const series = seriesMap.get(bookmark.series_id);
      return { bookmarkId: bookmark.id, addedAt: pickText(bookmark.created_at), updatedAt: pickText(series?.updated_at, series?.created_at, bookmark.created_at), seriesId: bookmark.series_id, title: pickText(series?.title) || "無題", summary: pickText(series?.summary, series?.description) || "あらすじはまだ登録されていない。" };
    }));
    setLoaded(true);
  }, [userId]);

  useEffect(() => { void loadBookmarks(); }, [loadBookmarks]);
  async function handleRemove(bookmarkId: string) {
    const previousItems = items; setWorkingBookmarkId(bookmarkId); setErrorMessage(null); setItems((current) => current.filter((item) => item.bookmarkId !== bookmarkId));
    const { error } = await supabase.from("user_series_bookmarks").delete().eq("id", bookmarkId).eq("user_id", userId);
    if (error) { setItems(previousItems); setErrorMessage(`ブックマーク解除に失敗: ${error.message}`); }
    setWorkingBookmarkId(null);
  }

  const visibleItems = limit ? sortItems(items, order).slice(0, limit) : sortItems(items, order);
  const shellClass = isLight ? "border border-black/10 bg-neutral-50 text-neutral-600" : "border border-white/10 bg-white/[0.03] text-neutral-400";
  if (!loaded) return <div className={`mt-4 rounded-2xl p-4 text-sm ${shellClass}`}>ブックマーク一覧を読み込み中...</div>;

  return <div className="mt-4">
    {showOrderControls ? <div className="mb-3 flex flex-wrap items-center justify-end gap-2 text-xs"><span className="text-neutral-500">並び順</span>{(["updated", "added"] as const).map((key) => <button key={key} type="button" onClick={() => changeOrder(key)} className={["rounded-full border px-3 py-1.5 transition", order === key ? isLight ? "border-black bg-black text-white" : "border-white bg-white text-black" : isLight ? "border-black/10 bg-white text-neutral-700 hover:bg-neutral-50" : "border-white/10 bg-white/5 text-neutral-300 hover:bg-white hover:text-black"].join(" ")}>{key === "updated" ? "更新順" : "追加順"}</button>)}</div> : null}
    {visibleItems.length === 0 ? <div className={`rounded-2xl border border-dashed p-4 ${isLight ? "border-black/15 bg-neutral-50" : "border-white/10 bg-white/[0.03]"}`}><p className={isLight ? "text-sm font-semibold text-black" : "text-sm font-semibold text-white"}>まだブックマーク作品がない</p><p className={`mt-2 text-sm leading-7 ${isLight ? "text-neutral-600" : "text-neutral-400"}`}>作品ページからブックマークした作品がここに並ぶ。</p>{errorMessage ? <p className="mt-3 text-xs leading-6 text-amber-700">{errorMessage}</p> : null}</div> : <div className="space-y-3">{errorMessage ? <p className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">{errorMessage}</p> : null}{visibleItems.map((item) => <article key={item.bookmarkId} className={`rounded-2xl border p-4 ${isLight ? "border-black/10 bg-white" : "border-white/10 bg-white/[0.03]"}`}><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-[11px] tracking-[0.18em] text-neutral-500">BOOKMARK</p><h3 className={`mt-1 text-base font-semibold ${isLight ? "text-black" : "text-white"}`}>{item.title}</h3><p className="mt-1 text-xs text-neutral-500">{order === "updated" ? `更新: ${formatDate(item.updatedAt)}` : `追加: ${formatDate(item.addedAt)}`}</p></div><div className="flex flex-wrap gap-2"><Link href={`/works/${item.seriesId}`} className={isLight ? "rounded-full border border-black/10 bg-white px-3 py-1.5 text-sm text-neutral-800 transition hover:bg-neutral-50" : "rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-neutral-200 transition hover:bg-white hover:text-black"}>作品ページへ</Link><button type="button" onClick={() => handleRemove(item.bookmarkId)} disabled={workingBookmarkId === item.bookmarkId} className={isLight ? "rounded-full border border-black/10 bg-neutral-50 px-3 py-1.5 text-sm text-neutral-700 transition hover:bg-neutral-100 disabled:opacity-70" : "rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-sm text-neutral-300 transition hover:bg-white hover:text-black disabled:opacity-70"}>{workingBookmarkId === item.bookmarkId ? "解除中..." : "解除"}</button></div></div><p className={`mt-3 line-clamp-2 whitespace-pre-wrap text-sm leading-7 ${isLight ? "text-neutral-600" : "text-neutral-400"}`}>{item.summary}</p></article>)}</div>}
  </div>;
}
