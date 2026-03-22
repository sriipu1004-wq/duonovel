import { Suspense } from "react";
import LoginPageClient from "./LoginPageClient";

function LoginPageFallback() {
  return (
    <main className="min-h-screen bg-[#050510] px-6 py-8 text-[#f5f5f5]">
      <div className="mx-auto w-full max-w-3xl">
        <section className="overflow-hidden rounded-[32px] border border-white/10 bg-white/[0.04] shadow-2xl">
          <div className="px-6 py-8 sm:px-8 sm:py-10">
            <p className="text-xs tracking-[0.24em] text-neutral-500">AUTH</p>
            <h1 className="mt-3 text-3xl font-bold leading-tight text-white sm:text-4xl">
              最小ログイン導線
            </h1>
            <p className="mt-4 text-sm leading-7 text-neutral-300">
              読み込み中...
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginPageFallback />}>
      <LoginPageClient />
    </Suspense>
  );
}