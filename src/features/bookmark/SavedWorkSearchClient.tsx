"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import PublicWorkBoardCard from "@/components/public/PublicWorkBoardCard";
import { supabase } from "@/lib/supabaseClient";

type SavedFilter = "bookmarked-works" | "followed-authors" | "liked-works" | "liked-readers";
type WorkRow = { id: string; title?: string | null; description?: string | null; summary?: string | null; author_id?: string | null; updated_at?: string | null; created_at?: string | null; tags?: unknown; publication_status?: string | null };
type AuthorRow = { id: string; display_name?: string | null; username?: string | null };
type Item = { seriesId: string; title: string; summary: string; authorId: string | null; authorName: string; tags: string[]; addedAt: string; updatedAt: string; workHref: string };

function text(...values: unknown[]): string { for (const value of values) if (typeof value === "string" && value.trim()) return value.trim(); return ""; }
function tags(value: unknown): string[] { if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean); if (typeof value === "string") return value.split(/[\n,、]/u).map((item) => item.trim()).filter(Boolean); return []; }
function timestamp(value: string): number { const parsed = new Date(value).getTime(); return Number.isNaN(parsed) ? 0 : parsed; }

async function fetchSeriesByIds(seriesIds: string[]): Promise<{ rows: WorkRow[]; error: string }> {
  if (!seriesIds.length) return { rows: [], error: "" };
  const selections = [
    "id, title, description, summary, author_id, updated_at, created_at, tags, publication_status",
    "id, title, description, summary, author_id, created_at, tags, publication_status",
    "id, title, description, author_id, created_at, tags, publication_status",
    "id, title, description, author_id, tags, publication_status",
  ];
  let lastError = "";
  for (const selection of selections) {
    const result = await supabase.from("series").select(selection).in("id", seriesIds);
    if (!result.error) return { rows: (result.data ?? []) as unknown as WorkRow[], error: "" };
    lastError = result.error.message;
  }
  return { rows: [], error: lastError || "作品情報を取得できない。" };
}

async function fetchSeriesByAuthorIds(authorIds: string[]): Promise<{ rows: WorkRow[]; error: string }> {
  if (!authorIds.length) return { rows: [], error: "" };
  const selections = [
    "id, title, description, summary, author_id, updated_at, created_at, tags, publication_status",
    "id, title, description, summary, author_id, created_at, tags, publication_status",
    "id, title, description, author_id, created_at, tags, publication_status",
  ];
  let lastError = "";
  for (const selection of selections) {
    const result = await supabase.from("series").select(selection).in("author_id", authorIds);
    if (!result.error) return { rows: (result.data ?? []) as unknown as WorkRow[], error: "" };
    lastError = result.error.message;
  }
  return { rows: [], error: lastError || "作品情報を取得できない。" };
}

async function loadFilterTargets(filter: SavedFilter, userId: string): Promise<{ seriesIds: string[]; authorIds: string[]; addedAt: Map<string, string>; error: string }> {
  const addedAt = new Map<string, string>();
  if (filter === "bookmarked-works") {
    const result = await supabase.from("user_series_bookmarks").select("series_id, created_at").eq("user_id", userId);
    if (result.error) return { seriesIds: [], authorIds: [], addedAt, error: result.error.message };
    const seriesIds = ((result.data ?? []) as Array<Record<string, unknown>>).map((row) => { const id = text(row.series_id); if (id) addedAt.set(id, text(row.created_at)); return id; }).filter(Boolean);
    return { seriesIds, authorIds: [], addedAt, error: "" };
  }
  if (filter === "followed-authors") {
    const result = await supabase.from("author_follows").select("followed_author_id, created_at").eq("follower_user_id", userId);
    if (result.error) return { seriesIds: [], authorIds: [], addedAt, error: result.error.message };
    return { seriesIds: [], authorIds: ((result.data ?? []) as Array<Record<string, unknown>>).map((row) => text(row.followed_author_id)).filter(Boolean), addedAt, error: "" };
  }
  if (filter === "liked-works") {
    const result = await supabase.from("user_series_reactions").select("series_id, created_at").eq("user_id", userId).eq("reaction_type", "support");
    if (result.error) return { seriesIds: [], authorIds: [], addedAt, error: result.error.message };
    const seriesIds = ((result.data ?? []) as Array<Record<string, unknown>>).map((row) => { const id = text(row.series_id); if (id) addedAt.set(id, text(row.created_at)); return id; }).filter(Boolean);
    return { seriesIds, authorIds: [], addedAt, error: "" };
  }
  const result = await supabase.from("reader_card_likes").select("series_id, created_at").eq("user_id", userId);
  if (result.error) return { seriesIds: [], authorIds: [], addedAt, error: result.error.message };
  const seriesIds = ((result.data ?? []) as Array<Record<string, unknown>>).map((row) => { const id = text(row.series_id); if (id) addedAt.set(id, text(row.created_at)); return id; }).filter(Boolean);
  return { seriesIds, authorIds: [], addedAt, error: "" };
}

export default function SavedWorkSearchClient({ filter, order }: { filter: SavedFilter; order: "updated" | "added" }) {
  const [items, setItems] = useState<Item[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      setLoaded(false); setError("");
      const { data: authData } = await supabase.auth.getUser();
      const user = authData.user;
      if (!user) { if (active) { setIsLoggedIn(false); setItems([]); setLoaded(true); } return; }
      const targets = await loadFilterTargets(filter, user.id);
      if (targets.error) { if (active) { setError(`保存条件の取得に失敗: ${targets.error}`); setIsLoggedIn(true); setLoaded(true); } return; }
      const seriesResult = targets.authorIds.length ? await fetchSeriesByAuthorIds(Array.from(new Set(targets.authorIds))) : await fetchSeriesByIds(Array.from(new Set(targets.seriesIds)));
      if (seriesResult.error) { if (active) { setError(`作品情報を取得できない: ${seriesResult.error}`); setIsLoggedIn(true); setLoaded(true); } return; }
      const rows = seriesResult.rows;
      const authorIds = Array.from(new Set(rows.map((row) => text(row.author_id)).filter(Boolean)));
      const { data: authorData } = authorIds.length ? await supabase.from("users").select("id, display_name, username").in("id", authorIds) : { data: [] as AuthorRow[] };
      const authorMap = new Map<string, AuthorRow>(); for (const author of (authorData ?? []) as AuthorRow[]) authorMap.set(author.id, author);
      const next = rows.map((row) => { const authorId = text(row.author_id) || null; const author = authorId ? authorMap.get(authorId) : undefined; const isOwnPrivate = authorId === user.id && text(row.publication_status).toLowerCase() !== "public"; return { seriesId: row.id, title: text(row.title) || "無題", summary: text(row.summary, row.description) || "あらすじはまだ登録されていない。", authorId, authorName: text(author?.display_name, author?.username) || "作者名未設定", tags: tags(row.tags), addedAt: targets.addedAt.get(row.id) || "", updatedAt: text(row.updated_at, row.created_at, targets.addedAt.get(row.id)), workHref: isOwnPrivate ? `/read/${row.id}/1` : `/works/${row.id}` }; });
      if (active) { setIsLoggedIn(true); setItems(next); setLoaded(true); }
    }
    void load(); return () => { active = false; };
  }, [filter]);

  const sorted = useMemo(() => [...items].sort((a, b) => timestamp(order === "updated" ? b.updatedAt : b.addedAt) - timestamp(order === "updated" ? a.updatedAt : a.addedAt)), [items, order]);
  if (!loaded) return <div className="mt-6 rounded-[28px] border border-black/10 bg-neutral-50 p-6 text-sm text-neutral-600">検索結果を読み込み中...</div>;
  if (!isLoggedIn) return <div className="mt-6 rounded-[28px] border border-dashed border-black/15 bg-neutral-50 p-6 text-sm leading-7 text-neutral-600">この検索条件を使うにはログインが必要。<Link href="/login?next=/search" className="ml-2 underline underline-offset-4">ログインする</Link></div>;
  if (!sorted.length) return <div className="mt-6 rounded-[28px] border border-dashed border-black/15 bg-neutral-50 p-6 text-sm leading-7 text-neutral-600">{error || "この条件に合う作品がまだない。"}</div>;
  return <div className="mt-6 grid gap-3 md:grid-cols-2">{sorted.map((item) => <PublicWorkBoardCard key={item.seriesId} title={item.title} workHref={item.workHref} authorName={item.authorName} authorHref={item.authorId ? `/authors/${encodeURIComponent(item.authorId)}` : undefined} latestPostedLabel={order === "updated" ? "更新順" : "追加順"} summary={item.summary} tags={item.tags} />)}</div>;
}
