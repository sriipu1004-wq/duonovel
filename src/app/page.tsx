import type { Metadata } from "next";
import PublicTopPageLegacy from "./PublicTopPageLegacy";

const HOME_DESCRIPTION =
  "長編・Web小説を原文・対訳・翻訳のみで読み分ける多言語読書プラットフォーム。作品単位の翻訳用語集、直前公開話の限定コンテキスト、保存済み公開翻訳の再利用に対応します。";

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
  return <PublicTopPageLegacy {...props} />;
}
