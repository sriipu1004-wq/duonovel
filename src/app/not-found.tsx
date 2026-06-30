import Link from "next/link";

export default function NotFound() {
  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-16 sm:px-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
          404
        </p>
        <div className="space-y-4">
          <h1 className="text-3xl font-bold tracking-tight text-black">
            ページが見つかりません
          </h1>
          <p className="max-w-2xl text-sm leading-7 text-neutral-700">
            URLが変更されたか、公開されていないページにアクセスした可能性があります。
          </p>
        </div>
        <div className="flex flex-wrap gap-3 text-sm">
          <Link
            href="/"
            className="rounded-full bg-black px-5 py-3 font-semibold text-white transition hover:bg-neutral-800"
          >
            トップへ戻る
          </Link>
          <Link
            href="/search"
            className="rounded-full border border-black/15 px-5 py-3 font-semibold text-black transition hover:bg-black/5"
          >
            作品を探す
          </Link>
          <Link
            href="/generate"
            className="rounded-full border border-black/15 px-5 py-3 font-semibold text-black transition hover:bg-black/5"
          >
            AI生成を試す
          </Link>
        </div>
      </div>
    </main>
  );
}
