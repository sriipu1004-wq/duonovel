"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import PublicWorkBoardCard from "@/components/public/PublicWorkBoardCard";
import { supabase } from "@/lib/supabaseClient";

type WorkRow = {
  id: string;
  title?: string | null;
  description?: string | null;
  summary?: string | null;
  author_id?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
  tags?: unknown;
};

type AuthorRow = { id: string; display_name?: string | null; username?: string | null };

type BookmarkRow = { series_id: string; created_at?: string | null };

type Item = {
  seriesId: string;
  title: string;
  summary: string;
  authorId: string | null;
  authorName: string;
  tags: string[];
  addedAt: string;
  updatedAt: string;
};

function text(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function tags(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  if (typeof value === "string") return value.split(/[\n,、]/u).map((item) => item.trim()).filter(Boolean);
  return [];
}

function timestamp(value: string): number {
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

export default function SavedWorkSearchClient({ order }: { order: "updated" | "added" }) {
  const [items, setItems] = useState<Item[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      setLoaded(false);
      setError("");
      const { data: bookmarkData, error: bookmarkError } = await supabase
        .from("user_series_bookmarks")
        .select("series_id, created_at");
      if (bookmarkError) {
        if (active) {
          setError("ブックマーク一覧を取得できない。ログイン状態を確認してもう一度試す。");
          setLoaded(true);
        }
        return;
      }
      const bookmarks = (bookmarkData ?? []) as BookmarkRow[];
      if (bookmarks.length === 0) {
        if (active) {
          setItems([]);
          setLoaded(true);
        }
        return;
      }
      const seriesIds = Array.from(new Set(bookmarks.map((row) => row.series_id)));
      const { data: seriesData, error: seriesError } = await supabase
        .from("series")
        .select("id, title, description, summary, author_id, updated_at, created_at, tags")
        .in("id", seriesIds);
      if (seriesError) {
        if (active) {
          setError("作品情報を取得できない。");
          setLoaded(true);
        }
        return;
      }
      const rows = (seriesData ?? []) as WorkRow[];
      const authorIds = Array.from(new Set(rows.map((row) => text(row.author_id)).filter(Boolean)));
      const { data: authorData } = authorIds.length > 0
        ? await supabase.from("users").select("id, display_name, username").in("id", authorIds)
        : { data: [] as AuthorRow[] };
      const authorMap = new Map<string, AuthorRow>();
      for (const author of (authorData ?? []) as AuthorRow[]) authorMap.set(author.id, author);
      const bookmarkMap = new Map(bookmarks.map((bookmark) => [bookmark.series_id, text(bookmark.created_at)]));
      const next = rows.map((row) => {
        const authorId = text(row.author_id) || null;
        const author = authorId ? authorMap.get(authorId) : undefined;
        return {
          seriesId: row.id,
          title: text(row.title) || "無題",
          summary: text(row.summary, row.description) || "あらすじはまだ登録されていない。",
          authorId,
          authorName: text(author?.display_name, author?.username) || "作者名未設定",
          tags: tags(row.tags),
          addedAt: bookmarkMap.get(row.id) || "",
          updatedAt: text(row.updated_at, row.created_at),
        };
      });
      if (active) {
        setItems(next);
        setLoaded(true);
      }
    }
    void load();
    return () => { active = false; };
  }, []);

  const sorted = useMemo(() => [...items].sort((a, b) => timestamp(order === "updated" ? b.updatedAt : b.addedAt) - timestamp(order === "updated" ? a.updatedAt : a.addedAt)), [items, order]);

  if (!loaded) return <div className="mt-6 rounded-[28px] border border-black/10 bg-neutral-50 p-6 text-sm text-neutral-600">ブックマーク作品を読み込み中...</div>;
  if (sorted.length === 0) return <div className="mt-6 rounded-[28px] border border-dashed border-black/15 bg-neutral-50 p-6 text-sm leading-7 text-neutral-600">{error || <>まだブックマーク作品がない。<Link href="/login" className="ml-2 underline underline-offset-4">ログインする</Link></>}</div>;

  return <div className="mt-6 grid gap-3 md:grid-cols-2">{sorted.map((item) => <PublicWorkBoardCard key={item.seriesId} title={item.title} workHref={`/works/${item.seriesId}`} authorName={item.authorName} authorHref={item.authorId ? `/authors/${encodeURIComponent(item.authorId)}` : undefined} latestPostedLabel={order === "updated" ? "更新順" : "追加順"} summary={item.summary} tags={item.tags} />)}</div>;
}
