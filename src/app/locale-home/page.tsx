import type { Metadata } from "next";
import Link from "next/link";
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
    eyebrow: "BILINGUAL WEB NOVEL READER",
    heading: "Read web novels with the original text and translation together",
    body:
      "LIB read is a reading service for people who want to learn through stories instead of replacing the source text with a full translation. Keep the original visible, follow the corresponding translation, listen with read-aloud, and continue long-form reading from where you stopped.",
    search: "Explore public works",
    guide: "How LIB read works",
    generate: "Generate an AI story",
  },
  ko: {
    title: "대역 웹소설 리더·영어/일본어 학습",
    description:
      "웹소설과 가져온 책을 원문과 동기화된 번역문으로 함께 읽을 수 있습니다. 대역 읽기, 읽어주기, PDF·EPUB·TXT·DOCX 가져오기, AI 이야기로 영어와 일본어를 소설을 통해 학습하세요.",
    eyebrow: "대역 웹소설 리더",
    heading: "웹소설의 원문과 번역문을 함께 읽기",
    body:
      "LIB read는 원문을 통째로 번역문으로 바꾸지 않고, 원문과 대응 번역을 함께 보며 이야기를 계속 읽기 위한 서비스입니다. 문장 대응, 읽어주기, 장편 읽던 위치 저장을 이용해 영어와 일본어를 소설로 학습할 수 있습니다.",
    search: "공개 작품 찾기",
    guide: "LIB read 이용 방법",
    generate: "AI 이야기 만들기",
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
      <section className="border-b border-black/10 bg-neutral-50 text-black">
        <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <p className="text-[11px] tracking-[0.22em] text-neutral-500">{copy.eyebrow}</p>
          <h2 className="mt-2 max-w-4xl text-xl font-bold leading-tight sm:text-2xl">{copy.heading}</h2>
          <p className="mt-3 max-w-4xl text-sm leading-7 text-neutral-700">{copy.body}</p>
          <div className="mt-4 flex flex-wrap gap-3 text-sm">
            <Link className="font-medium underline underline-offset-4" href={localizePath("/search", locale)}>{copy.search}</Link>
            <Link className="font-medium underline underline-offset-4" href={localizePath("/guide", locale)}>{copy.guide}</Link>
            <Link className="font-medium underline underline-offset-4" href={localizePath("/generate", locale)}>{copy.generate}</Link>
          </div>
        </div>
      </section>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <PublicTopPage {...props} />
    </>
  );
}
