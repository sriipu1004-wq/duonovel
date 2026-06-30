"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import SavedWorkSearchClient from "./SavedWorkSearchClient";

type SavedFilter = "bookmarked-works" | "followed-authors" | "liked-works" | "liked-readers";

const FILTERS: Record<SavedFilter, { label: string; description: string }> = {
  "bookmarked-works": { label: "ブックマーク作品", description: "自分がブックマークした作品を表示中。" },
  "followed-authors": { label: "フォローした作者", description: "フォローした作者の公開作品を表示中。" },
  "liked-works": { label: "いいねした作品", description: "自分がいいねした作品を表示中。" },
  "liked-readers": { label: "いいねした朗読", description: "いいねした朗読がある作品を表示中。" },
};

export default function SavedWorkSearchShell() {
  const searchParams = useSearchParams();
  const order = searchParams.get("order") === "added" ? "added" : "updated";
  const rawFilter = searchParams.get("saved");
  const filter: SavedFilter = rawFilter === "followed-authors" || rawFilter === "liked-works" || rawFilter === "liked-readers" ? rawFilter : "bookmarked-works";
  const info = FILTERS[filter];
  const baseHref = `/search?saved=${filter}`;

  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <p className="text-sm text-neutral-500"><Link href="/search" className="hover:text-black">作品を探す</Link><span className="mx-2">/</span><span className="text-neutral-700">保存条件検索</span></p>
        <div className="mt-6 flex flex-wrap items-end justify-between gap-4 border-b border-black/10 pb-4">
          <div>
            <p className="text-xs tracking-[0.18em] text-neutral-500">SEARCH RESULT</p>
            <div className="mt-2 flex flex-wrap items-center gap-2"><h1 className="text-2xl font-semibold">検索結果</h1><span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-900">特殊タグ: {info.label}</span></div>
            <p className="mt-2 text-sm leading-7 text-neutral-600">{info.description}</p>
          </div>
          <div className="flex gap-2 text-sm"><Link href={`${baseHref}&order=updated`} className={order === "updated" ? "rounded-full bg-black px-4 py-2 text-white" : "rounded-full border border-black/10 bg-white px-4 py-2 text-neutral-700"}>更新順</Link><Link href={`${baseHref}&order=added`} className={order === "added" ? "rounded-full bg-black px-4 py-2 text-white" : "rounded-full border border-black/10 bg-white px-4 py-2 text-neutral-700"}>追加順</Link></div>
        </div>
        <SavedWorkSearchClient filter={filter} order={order} />
      </div>
    </main>
  );
}
