import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "準備中 | LIB read",
  description: "このページは現在公開準備中です。",
};

export default function PreparingPage() {
  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10 sm:px-6">
        <section className="rounded-[28px] border border-black/10 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-[11px] tracking-[0.24em] text-neutral-500">
            PREPARING
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700">
              公開準備中
            </span>
            <span className="rounded-full border border-black/10 bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700">
              INTERNAL ROUTE
            </span>
          </div>

          <h1 className="mt-4 text-3xl font-bold leading-tight text-black sm:text-4xl">
            このページは現在準備中
          </h1>

          <p className="mt-5 text-sm leading-8 text-neutral-600 sm:text-[15px]">
            ここはまだ一般公開向けの導線としては開いていないページです。
            公開導線として見せる範囲を整えている途中なので、今は他の公開ページから利用してください。
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-black/10 bg-neutral-50 p-4">
              <p className="text-sm font-semibold text-black">今見られるページ</p>
              <p className="mt-2 text-sm leading-7 text-neutral-600">
                トップ、検索、作品ページ、各話、作者ページ、案内ページ、規約、問い合わせなどの公開導線。
              </p>
            </div>

            <div className="rounded-2xl border border-black/10 bg-neutral-50 p-4">
              <p className="text-sm font-semibold text-black">まだ閉じているページ</p>
              <p className="mt-2 text-sm leading-7 text-neutral-600">
                制作、管理、内部確認用の一部ページ。公開準備が整うまで段階的に制限している。
              </p>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/"
              className="rounded-full bg-black px-5 py-3 text-sm font-medium text-white transition hover:bg-neutral-800"
            >
              トップへ戻る
            </Link>

            <Link
              href="/search"
              className="rounded-full border border-black/10 bg-white px-5 py-3 text-sm font-medium text-neutral-800 transition hover:bg-neutral-50"
            >
              作品を探す
            </Link>

            <Link
              href="/guide"
              className="rounded-full border border-black/10 bg-white px-5 py-3 text-sm font-medium text-neutral-800 transition hover:bg-neutral-50"
            >
              使い方を見る
            </Link>

            <Link
              href="/status"
              className="rounded-full border border-black/10 bg-white px-5 py-3 text-sm font-medium text-neutral-800 transition hover:bg-neutral-50"
            >
              現在の状態を見る
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}