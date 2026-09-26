import type { Metadata } from "next";
import PublicTopPageLegacy from "./PublicTopPageLegacy";

const HOME_DESCRIPTION =
  "長編・Web小説をOriginal・Bilingual・Translation onlyで読む多言語読書プラットフォーム。作者がAI翻訳とHuman translationを別々に許可でき、AI翻訳は作品用語集と限定コンテキスト、保存済み翻訳の再利用に対応します。";

export const metadata: Metadata = {
  title: "長編・Web小説を原文付きで多言語読書 | LIB read",
  description: HOME_DESCRIPTION,
  alternates: {
    canonical: "/",
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
    locale: "ja_JP",
    siteName: "LIB read",
    url: "/",
    title: "長編・Web小説を原文付きで多言語読書 | LIB read",
    description: HOME_DESCRIPTION,
    images: ["/opengraph-image"],
  },
  twitter: {
    card: "summary_large_image",
    title: "長編・Web小説を原文付きで多言語読書 | LIB read",
    description: HOME_DESCRIPTION,
    images: ["/opengraph-image"],
  },
};

type PageProps = Parameters<typeof PublicTopPageLegacy>[0];

export default function PublicTopPage(props: PageProps) {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "LIB read",
    url: "https://www.syosetu-libread.com/",
    inLanguage: "ja",
    description: HOME_DESCRIPTION,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <PublicTopPageLegacy {...props} />
    </>
  );
}
