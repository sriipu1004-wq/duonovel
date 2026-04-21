import Link from "next/link";
import { getSavedFilterLabel, type SavedFilterKey } from "@/lib/searchSavedFilters";

const ITEMS: Array<{
  key: SavedFilterKey;
  eyebrow: string;
  title: string;
  description: string;
}> = [
  {
    key: "followed-authors",
    eyebrow: "FOLLOWED AUTHORS",
    title: getSavedFilterLabel("followed-authors"),
    description: "自分がフォローしている作者の作品だけを検索一覧で出す。",
  },
  {
    key: "liked-authors",
    eyebrow: "LIKED AUTHORS",
    title: getSavedFilterLabel("liked-authors"),
    description: "自分がいいねした作者の作品だけを検索一覧で出す。",
  },
  {
    key: "liked-works",
    eyebrow: "LIKED WORKS",
    title: getSavedFilterLabel("liked-works"),
    description: "自分がいいねした作品だけを検索一覧で出す。",
  },
  {
    key: "liked-readers",
    eyebrow: "LIKED READERS",
    title: getSavedFilterLabel("liked-readers"),
    description: "自分がいいねした朗読が付いている作品だけを検索一覧で出す。",
  },
];

export default function SavedSearchLinksSection() {
  return (
    <section className="rounded-[28px] border border-black/10 bg-white p-5 shadow-sm">
      <p className="text-xs tracking-[0.18em] text-neutral-500">SAVED LISTS</p>
      <h2 className="mt-2 text-xl font-semibold text-black">保存一覧から探す</h2>
      <p className="mt-3 text-sm leading-7 text-neutral-600">
        フォローやいいねを起点に、検索ページで作品一覧を絞り込む。
        検索語、タグ、ジャンルとも組み合わせて使える。
      </p>

      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {ITEMS.map((item) => (
          <article
            key={item.key}
            className="rounded-[24px] border border-black/10 bg-neutral-50 p-4"
          >
            <p className="text-xs tracking-[0.18em] text-neutral-500">
              {item.eyebrow}
            </p>
            <h3 className="mt-2 text-lg font-semibold text-black">
              {item.title}
            </h3>
            <p className="mt-3 text-sm leading-7 text-neutral-600">
              {item.description}
            </p>

            <div className="mt-4">
              <Link
                href={`/search?saved=${encodeURIComponent(item.key)}`}
                className="inline-flex rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-neutral-800 transition hover:bg-neutral-50"
              >
                一覧を見る
              </Link>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}