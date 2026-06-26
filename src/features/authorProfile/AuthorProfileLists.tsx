"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

export type AuthorWork = {
  id: string;
  title: string;
  summary: string;
  episode: number | null;
  updatedAt: string;
  popularity: number;
  narrationCount?: number;
  likes?: number;
  plays?: number;
};

type Order = "updated" | "popular";

function time(value: string) {
  const result = new Date(value).getTime();
  return Number.isNaN(result) ? 0 : result;
}

function List({
  title,
  eyebrow,
  items,
  listHref,
  storageKey,
  narration,
}: {
  title: string;
  eyebrow: string;
  items: AuthorWork[];
  listHref: string;
  storageKey: string;
  narration?: boolean;
}) {
  const [order, setOrder] = useState<Order>("updated");
  useEffect(() => {
    const stored = window.localStorage.getItem(storageKey);
    if (stored === "updated" || stored === "popular") setOrder(stored);
  }, [storageKey]);
  function setStoredOrder(next: Order) {
    setOrder(next);
    window.localStorage.setItem(storageKey, next);
  }
  const shown = useMemo(() => [...items].sort((a, b) => order === "updated" ? time(b.updatedAt) - time(a.updatedAt) : b.popularity - a.popularity).slice(0, 5), [items, order]);
  return <section className="rounded-[28px] border border-black/10 bg-white p-5 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-xs tracking-[0.18em] text-neutral-500">{eyebrow}</p><h2 className="mt-2 text-xl font-semibold text-black">{title}</h2></div>
      <div className="flex flex-wrap items-center gap-2"><span className="text-xs text-neutral-500">{order === "updated" ? "更新順" : "人気順"}</span><button type="button" onClick={() => setStoredOrder("updated")} className={order === "updated" ? "rounded-full bg-black px-3 py-1.5 text-xs text-white" : "rounded-full border border-black/10 px-3 py-1.5 text-xs"}>更新順</button><button type="button" onClick={() => setStoredOrder("popular")} className={order === "popular" ? "rounded-full bg-black px-3 py-1.5 text-xs text-white" : "rounded-full border border-black/10 px-3 py-1.5 text-xs"}>人気順</button><Link href={listHref} className="rounded-full border border-black/10 px-3 py-1.5 text-xs text-neutral-800">一覧を表示</Link></div>
    </div>
    <div className="mt-4 grid gap-3">
      {shown.length === 0 ? <div className="rounded-2xl border border-dashed border-black/15 bg-neutral-50 p-4 text-sm text-neutral-600">まだ公開中の作品がない。</div> : shown.map((item) => <article key={item.id} className="rounded-2xl border border-black/10 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-lg font-semibold text-black">{item.title}</h3><p className="mt-2 line-clamp-2 text-sm leading-7 text-neutral-600">{item.summary}</p>{narration ? <p className="mt-2 text-xs text-neutral-500">朗読 {item.narrationCount ?? 0}件 / いいね {item.likes ?? 0} / 再生 {item.plays ?? 0}</p> : null}</div><div className="flex gap-2"><Link href={`/works/${item.id}`} className="rounded-full border border-black/10 px-3 py-1.5 text-sm">作品ページ</Link>{item.episode !== null ? <Link href={`/read/${item.id}/${item.episode}`} className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-sm">{narration ? "聞く" : "読む"}</Link> : null}</div></div></article>)}
    </div>
  </section>;
}

export default function AuthorProfileLists({ authorId, works, narrations }: { authorId: string; works: AuthorWork[]; narrations: AuthorWork[] }) {
  return <div className="mt-6 grid gap-6"><List title="この作者の公開作品" eyebrow="WORKS" items={works} listHref={`/search/author/${encodeURIComponent(authorId)}`} storageKey={`libread:author:${authorId}:works-order`} /><List title="この作者の朗読作品" eyebrow="NARRATIONS" items={narrations} listHref={`/search/reader/${encodeURIComponent(authorId)}`} storageKey={`libread:author:${authorId}:narrations-order`} narration /></div>;
}
