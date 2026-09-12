import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PublicTopPage from "../page";
import { getUiLocale } from "@/i18n/server";
import { localizePath } from "@/i18n/navigation";

const SITE_URL = "https://www.syosetu-libread.com";
type PublicTopProps = Parameters<typeof PublicTopPage>[0];

const searchLandingCopy = {
  en: {
    title: "Bilingual Long-Form Novel Reader",
    description:
      "LIB read is a bilingual long-form reading platform for novels and web novels. Keep the original text beside a translation, continue across chapters, import TXT/EPUB/DOCX/text PDFs privately, use read-aloud, and browse public works.",
  },
  ko: {
    title: "장편소설·웹소설 대역 리더",
    description:
      "LIB read는 장편소설과 웹소설을 위한 다국어 독서 플랫폼입니다. 원문과 번역을 함께 유지하고 장과 화를 넘어 이어 읽으며 TXT·EPUB·DOCX·텍스트 PDF 개인 서재, 읽어주기, 공개 작품을 이용할 수 있습니다.",
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
