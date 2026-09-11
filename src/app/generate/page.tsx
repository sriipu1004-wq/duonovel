import type { Metadata } from "next";
import TimeFitStoryGeneratorClient from "./TimeFitStoryGeneratorClient";
import { getUiLocale } from "@/i18n/server";
import { generateDictionaries } from "@/i18n/dictionaries/generate";
import { localizePath } from "@/i18n/navigation";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getUiLocale();
  const dictionary = generateDictionaries[locale];
  const canonical = localizePath("/generate", locale);
  const title = `${dictionary.title} | LIB read`;

  return {
    title,
    description: dictionary.description,
    alternates: {
      canonical,
      languages: {
        ja: "/generate",
        en: "/en/generate",
        ko: "/ko/generate",
        "x-default": "/generate",
      },
    },
    robots: { index: true, follow: true },
    openGraph: {
      type: "website",
      locale: locale === "ja" ? "ja_JP" : locale === "en" ? "en_US" : "ko_KR",
      siteName: "LIB read",
      url: canonical,
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

export default function GeneratePage() {
  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto w-full max-w-2xl px-4 pb-24 pt-10 sm:px-6">
        <TimeFitStoryGeneratorClient />
      </div>
    </main>
  );
}
