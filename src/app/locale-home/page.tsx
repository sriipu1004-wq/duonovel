import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PublicTopPage from "../page";
import { getUiLocale } from "@/i18n/server";
import { localizePath } from "@/i18n/navigation";

const SITE_URL = "https://www.syosetu-libread.com";
type PublicTopProps = Parameters<typeof PublicTopPage>[0];

const searchLandingCopy = {
  en: {
    title: "Bilingual Web Novel Reader for English & Japanese Learning",
    description:
      "Read web novels and imported books with the original text and synchronized translations. Use bilingual reading, read-aloud, PDF/EPUB/TXT/DOCX import, and AI stories to study English or Japanese through fiction.",
  },
  ko: {
    title: "대역 웹소설 리더·영어/일본어 학습",
    description:
      "웹소설과 가져온 책을 원문과 동기화된 번역문으로 함께 읽을 수 있습니다. 대역 읽기, 읽어주기, PDF·EPUB·TXT·DOCX 가져오기, AI 이야기로 영어와 일본어를 소설을 통해 학습하세요.",
  },
} as const;

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getUiLocale();
  if (locale === "ja") return {};

  const copy = searchLandingCopy[locale];
  const canonical = localizePath("/", locale);
  const title = `${copy.title} | LIB read`;

  return {
    title,
    description: copy.description,
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
      description: copy.description,
      images: ["/opengraph-image"],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: copy.description,
      images: ["/opengraph-image"],
    },
  };
}

export default async function LocalizedHomePage(props: PublicTopProps) {
  const locale = await getUiLocale();
  if (locale === "ja") notFound();

  const copy = searchLandingCopy[locale];
  const canonical = `${SITE_URL}${localizePath("/", locale)}`;
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "LIB read",
    url: canonical,
    inLanguage: locale,
    description: copy.description,
  };

  // Keep every locale on the same PublicTopPage component. Locale-specific
  // differences belong in dictionaries/metadata so layout and behavior fixes
  // automatically apply to Japanese, English, and Korean together.
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <PublicTopPage {...props} />
    </>
  );
}
