import Link from "next/link";
import { getSavedFilterLabel, type SavedFilterKey } from "@/lib/searchSavedFilters";

type Item = {
  key: SavedFilterKey;
  eyebrow: string;
  title: string;
  description: string;
  href: string;
};

const ITEMS: Item[] = [
  {
    key: "bookmarked-works",
    eyebrow: "SEARCH FILTER",
    title: getSavedFilterLabel("bookmarked-works"),
    description: "ブックマークした作品だけで検索する。",
    href: "/search?saved=bookmarked-works&order=updated",
  },
  {
    key: "followed-authors",
    eyebrow: "SEARCH FILTER",
    title: getSavedFilterLabel("followed-authors"),
    description: "フォロー中の作者の公開作品だけで検索する。",
    href: "/search?saved=followed-authors&order=updated",
  },
  {
    key: "liked-works",
    eyebrow: "SEARCH FILTER",
    title: getSavedFilterLabel("liked-works"),
    description: "いいねした作品だけで検索する。",
    href: "/search?saved=liked-works&order=updated",
  },
  {
    key: "liked-readers",
    eyebrow: "SEARCH FILTER",
    title: getSavedFilterLabel("liked-readers"),
    description: "いいねした朗読がある作品だけで検索する。",
    href: "/search?saved=liked-readers&order=updated",
  },
];

export default function SavedSearchLinksSection() {
  return (
    <section className="rounded-[28px] border border-black/10 bg-white p-5 shadow-sm">
      <p className="text-xs tracking-[0.18em] text-neutral-500">SAVED SEARCH FILTERS</p>
      <h2 className="mt-2 text-xl font-semibold text-black">保存条件で探す</h2>
      <p className="mt-2 text-sm leading-7 text-neutral-600">
        特殊タグのように保存条件を検索へ適用し、通常の絞り込みと組み合わせて使う。
      </p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {ITEMS.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            className="rounded-2xl border border-black/10 bg-neutral-50 p-3 transition hover:border-sky-200 hover:bg-sky-50"
          >
            <p className="text-[10px] tracking-[0.16em] text-neutral-500">{item.eyebrow}</p>
            <h3 className="mt-1 text-sm font-semibold text-black">{item.title}</h3>
            <p className="mt-1 text-xs leading-5 text-neutral-600">{item.description}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
