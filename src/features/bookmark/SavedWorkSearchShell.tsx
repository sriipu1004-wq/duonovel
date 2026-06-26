"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import SavedWorkSearchClient from "./SavedWorkSearchClient";

export default function SavedWorkSearchShell() {
  const searchParams = useSearchParams();
  const order = searchParams.get("order") === "added" ? "added" : "updated";

  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <p className="text-sm text-neutral-500"><Link href="/search" className="hover:text-black">作品を探す</Link><span className="mx-2">/</span><span className="text-neutral-700">ブックマーク作品</span></p>
        <div className="mt-6 flex flex-wrap items-end justify-between gap-4 border-b border-black/10 pb-4">
          <div><p className="text-xs tracking-[0.18em] text-neutral-500">BOOKMARKS</p><h1 className="mt-2 text-2xl font-semibold">ブックマーク作品</h1><p className="mt-2 text-sm leading-7 text-neutral-600">自分が保存した作品だけを表示する。</p></div>
          <div className="flex gap-2 text-sm"><Link href="/search/saved?order=updated" className={order === "updated" ? "rounded-full bg-black px-4 py-2 text-white" : "rounded-full border border-black/10 bg-white px-4 py-2 text-neutral-700"}>更新順</Link><Link href="/search/saved?order=added" className={order === "added" ? "rounded-full bg-black px-4 py-2 text-white" : "rounded-full border border-black/10 bg-white px-4 py-2 text-neutral-700"}>追加順</Link></div>
        </div>
        <SavedWorkSearchClient order={order} />
      </div>
    </main>
  );
}
