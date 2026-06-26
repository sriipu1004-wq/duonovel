import Link from "next/link";
import { getSavedFilterLabel, type SavedFilterKey } from "@/lib/searchSavedFilters";

type Item = {
  key: SavedFilterKey | "bookmarks";
  eyebrow: string;
  title: string;
  description: string;
  href: string;
};

const ITEMS: Item[] = [
  { key: "bookmarks", eyebrow: "BOOKMARKS", title: "ブックマーク作品", description: "保存した作品だけを表示。", href: "/search/saved" },
  { key: "followed-authors", eyebrow: "FOLLOWED AUTHORS", title: getSavedFilterLabel("followed-authors"), description: "フォロー中の作者の作品だけを表示。", href: "/search?saved=followed-authors" },
  { key: "liked-works", eyebrow: "LIKED WORKS", title: getSavedFilterLabel("liked-works"), description: "いいねした作品だけを表示。", href: "/search?saved=liked-works" },
  { key: "liked-readers", eyebrow: "LIKED READERS", title: getSavedFilterLabel("liked-readers"), description: "いいねした朗読がある作品だけを表示。", href: "/search?saved=liked-readers" },
];

export default function SavedSearchLinksSection() {
  return (
    <section className="rounded-[28px] border border-black/10 bg-white p-5 shadow-sm">
      <p className="text-xs tracking-[0.18em] text-neutral-500">SAVED LISTS</p>
      <h2 className="mt-2 text-xl font-semibold text-black">保存一覧から探す</h2>
      <p className="mt-2 text-sm leading-7 text-neutral-600">保存・フォロー・いいねを起点に、作品一覧を絞り込む。</p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {ITEMS.map((item) => (
          <Link key={item.key} href={item.href} className="rounded-2xl border border-black/10 bg-neutral-50 p-3 transition hover:bg-white">
            <p className="text-[10px] tracking-[0.16em] text-neutral-500">{item.eyebrow}</p>
            <h3 className="mt-1 text-sm font-semibold text-black">{item.title}</h3>
            <p className="mt-1 text-xs leading-5 text-neutral-600">{item.description}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
