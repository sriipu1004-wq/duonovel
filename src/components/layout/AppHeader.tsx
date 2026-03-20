import Link from "next/link";

export default function AppHeader() {
  return (
    <header className="border-b border-black/10 bg-white/95 backdrop-blur dark:border-white/10 dark:bg-black/70">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-neutral-900 transition hover:bg-black/5 dark:text-white dark:hover:bg-white/10"
          aria-label="ホームへ戻る"
        >
          <span className="text-base leading-none">🏠</span>
          <span>デュオノベル</span>
        </Link>

        <div className="text-xs text-neutral-500 dark:text-neutral-400">
          Home
        </div>
      </div>
    </header>
  );
}