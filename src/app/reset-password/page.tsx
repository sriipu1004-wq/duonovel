import { Suspense } from "react";
import ResetPasswordPageClient from "./ResetPasswordPageClient";

function ResetPasswordPageFallback() {
  return (
    <main className="min-h-screen bg-white px-6 py-8 text-black">
      <div className="mx-auto w-full max-w-3xl">
        <section className="rounded-[32px] border border-black/10 bg-white p-8 shadow-sm">
          <p className="text-sm text-neutral-600">読み込み中...</p>
        </section>
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<ResetPasswordPageFallback />}>
      <ResetPasswordPageClient />
    </Suspense>
  );
}
