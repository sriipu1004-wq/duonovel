import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PublicTopPage from "../page";
import { getUiLocale } from "@/i18n/server";
import { localizePath } from "@/i18n/navigation";

const SITE_URL = "https://www.syosetu-libread.com";
type PublicTopProps = Parameters<typeof PublicTopPage>[0];

const searchLandingCopy = {
  en: {
    title: "Multilingual Long-Form & Web Novel Reader",
    description:
      "Read long-form fiction and web novels as Original, Bilingual, or Translation only. Authors control AI and Human translation separately; AI translation can use a work glossary, bounded previous-episode context, and saved translation reuse.",
  },
  ko: {
    title: "다국어 장편소설·웹소설 리더",
    description:
      "장편소설과 웹소설을 원문·대역·번역만 보기로 읽을 수 있습니다. 작가는 AI 번역과 Human translation을 별도로 허용하며, AI 번역은 작품 단위 용어집·제한된 이전 회차 문맥·저장된 번역 재사용을 이용할 수 있습니다.",
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
