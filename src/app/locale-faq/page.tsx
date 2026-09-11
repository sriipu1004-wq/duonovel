import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getUiLocale } from "@/i18n/server";
import { helpDictionaries } from "@/i18n/dictionaries/help";
import { localizePath } from "@/i18n/navigation";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getUiLocale();
  const dictionary = helpDictionaries[locale];
  return {
    title: `${dictionary.faqTitle} | LIB read`,
    description: dictionary.faqLead,
    robots: { index: false, follow: true },
  };
}

export default async function LocaleFaqPage() {
  const locale = await getUiLocale();
  if (locale === "ja") notFound();
  const dictionary = helpDictionaries[locale];

  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
        <p className="text-xs tracking-[0.2em] text-neutral-500">FAQ</p>
        <h1 className="mt-3 text-3xl font-bold sm:text-4xl">{dictionary.faqTitle}</h1>
        <p className="mt-4 text-sm leading-7 text-neutral-600">{dictionary.faqLead}</p>
        <div className="mt-8 grid gap-4">
          {dictionary.faqItems.map((item) => (
            <section key={item.title} className="rounded-[24px] border border-black/10 bg-neutral-50 p-5">
              <h2 className="text-base font-semibold">{item.title}</h2>
              <p className="mt-2 text-sm leading-7 text-neutral-600">{item.body}</p>
            </section>
          ))}
        </div>
        <nav className="mt-8 flex flex-wrap gap-3 text-sm">
          <Link className="rounded-full border border-black/10 px-4 py-2" href={localizePath("/", locale)}>{dictionary.home}</Link>
          <Link className="rounded-full border border-black/10 px-4 py-2" href={localizePath("/search", locale)}>{dictionary.search}</Link>
          <Link className="rounded-full border border-black/10 px-4 py-2" href={localizePath("/subscription", locale)}>{dictionary.subscription}</Link>
        </nav>
      </div>
    </main>
  );
}
