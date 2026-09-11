import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getUiLocale } from "@/i18n/server";
import { homeDictionaries } from "@/i18n/dictionaries/home";
import { localizePath } from "@/i18n/navigation";

const SITE_URL = "https://www.syosetu-libread.com";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getUiLocale();
  if (locale === "ja") return {};

  const dictionary = homeDictionaries[locale];
  const canonical = localizePath("/", locale);
  const title = `${dictionary.title} | LIB read`;

  return {
    title,
    description: dictionary.description,
    alternates: {
      canonical,
      languages: {
        ja: "/",
        en: "/en",
        ko: "/ko",
        "x-default": "/",
      },
    },
    robots: { index: true, follow: true },
    openGraph: {
      type: "website",
      locale: locale === "en" ? "en_US" : "ko_KR",
      siteName: "LIB read",
      url: `${SITE_URL}${canonical}`,
      title,
      description: dictionary.description,
      images: ["/opengraph-image"],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: dictionary.description,
      images: ["/opengraph-image"],
    },
  };
}

export default async function LocalizedHomePage() {
  const locale = await getUiLocale();
  if (locale === "ja") notFound();

  const dictionary = homeDictionaries[locale];
  const featureCards = [
    {
      title: dictionary.bilingualTitle,
      body: dictionary.bilingualBody,
      href: localizePath("/search", locale),
    },
    {
      title: dictionary.libraryTitle,
      body: dictionary.libraryBody,
      href: localizePath("/library", locale),
    },
    {
      title: dictionary.aiTitle,
      body: dictionary.aiBody,
      href: localizePath("/generate", locale),
    },
  ];

  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto w-full max-w-7xl px-4 pb-20 pt-8 sm:px-6 lg:px-8">
        <section className="border-b border-black/10 pb-12">
          <div className="max-w-5xl">
            <p className="text-[11px] tracking-[0.24em] text-neutral-500">{dictionary.eyebrow}</p>
            <h1 className="mt-5 text-4xl font-bold leading-tight sm:text-5xl">{dictionary.title}</h1>
            <p className="mt-5 max-w-4xl text-xl font-medium leading-9 text-neutral-800">{dictionary.lead}</p>
            <p className="mt-5 max-w-4xl text-sm leading-8 text-neutral-600 sm:text-base">{dictionary.description}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={localizePath("/generate", locale)} className="rounded-full bg-black px-5 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800">{dictionary.generate}</Link>
              <Link href={localizePath("/library", locale)} className="rounded-full border border-violet-200 bg-violet-50 px-5 py-3 text-sm font-semibold text-violet-900 transition hover:bg-violet-100">{dictionary.library}</Link>
              <Link href={localizePath("/search", locale)} className="rounded-full border border-black/10 bg-neutral-100 px-5 py-3 text-sm font-semibold text-neutral-800 transition hover:bg-neutral-200">{dictionary.explore}</Link>
              <Link href={localizePath("/register", locale)} className="rounded-full border border-sky-200 bg-sky-50 px-5 py-3 text-sm font-semibold text-sky-900 transition hover:bg-sky-100">{dictionary.signup}</Link>
            </div>
          </div>
        </section>

        <section className="pt-12">
          <p className="text-xs tracking-[0.2em] text-neutral-500">FEATURES</p>
          <h2 className="mt-3 text-2xl font-bold sm:text-3xl">{dictionary.features}</h2>
          <div className="mt-7 grid gap-4 md:grid-cols-3">
            {featureCards.map((feature) => (
              <Link key={feature.title} href={feature.href} className="rounded-[28px] border border-black/10 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                <h3 className="text-lg font-semibold">{feature.title}</h3>
                <p className="mt-3 text-sm leading-7 text-neutral-600">{feature.body}</p>
              </Link>
            ))}
          </div>
        </section>

        <section className="mt-12 rounded-[28px] border border-black/10 bg-neutral-50 p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">{dictionary.works}</h2>
              <p className="mt-2 text-sm leading-7 text-neutral-600">{dictionary.worksBody}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href={localizePath("/search", locale)} className="rounded-full bg-black px-5 py-2.5 text-sm font-semibold text-white">{dictionary.explore}</Link>
              <Link href={localizePath("/guide", locale)} className="rounded-full border border-black/10 bg-white px-5 py-2.5 text-sm font-semibold text-neutral-800">{dictionary.guide}</Link>
              <Link href={localizePath("/subscription", locale)} className="rounded-full border border-black/10 bg-white px-5 py-2.5 text-sm font-semibold text-neutral-800">{dictionary.subscription}</Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
