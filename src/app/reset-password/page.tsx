import { Suspense } from "react";
import ResetPasswordPageClient from "./ResetPasswordPageClient";
import { getUiLocale } from "@/i18n/server";
import { accountDictionaries } from "@/i18n/dictionaries/account";

function ResetPasswordPageFallback({ label }: { label: string }) {
  return (
    <main className="min-h-screen bg-white px-6 py-8 text-black">
      <div className="mx-auto w-full max-w-3xl">
        <section className="rounded-[32px] border border-black/10 bg-white p-8 shadow-sm">
          <p className="text-sm text-neutral-600">{label}</p>
        </section>
      </div>
    </main>
  );
}

export default async function ResetPasswordPage() {
  const locale = await getUiLocale();
  const dictionary = accountDictionaries[locale];

  return (
    <Suspense fallback={<ResetPasswordPageFallback label={dictionary.loading} />}>
      <ResetPasswordPageClient />
    </Suspense>
  );
}
