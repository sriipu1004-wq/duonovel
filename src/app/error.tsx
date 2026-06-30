"use client";

import { useEffect } from "react";
import Link from "next/link";

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-16 sm:px-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
          Error
        </p>
        <div className="space-y-4">
          <h1 className="text-3xl font-bold tracking-tight text-black">
            ページを表示できませんでした
          </h1>
          <p className="max-w-2xl text-sm leading-7 text-neutral-700">
            一時的な問題が発生した可能性があります。再試行しても解決しない場合は、時間をおいてからアクセスしてください。
          </p>
        </div>
        <div className="flex flex-wrap gap-3 text-sm">
          <button
            type="button"
            onClick={reset}
            className="rounded-full bg-black px-5 py-3 font-semibold text-white transition hover:bg-neutral-800"
          >
            もう一度試す
          </button>
          <Link
            href="/"
            className="rounded-full border border-black/15 px-5 py-3 font-semibold text-black transition hover:bg-black/5"
          >
            トップへ戻る
          </Link>
          <Link
            href="/contact"
            className="rounded-full border border-black/15 px-5 px-5 py-3 font-semibold text-black transition hover:bg-black/5"
          >
            お問い合わせ
          </Link>
        </div>
      </div>
    </main>
  );
}
