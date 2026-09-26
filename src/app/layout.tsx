import type { Metadata } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import AppHeader from "@/components/layout/AppHeader";
import AppFooter from "@/components/layout/AppFooter";
import "./globals.css";
import "./bilingualReaderCleanup.css";
import GlobalNavigationProgress from "@/components/navigation/GlobalNavigationProgress";
import { getUiLocale } from "@/i18n/server";
import { UiLocaleProvider } from "@/i18n/UiLocaleProvider";
import type { UiLocale } from "@/i18n/config";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL = new URL("https://www.syosetu-libread.com");

const metadataByLocale: Record<UiLocale, { title: string; description: string; ogLocale: string }> = {
  ja: {
    title: "LIB read | 長編・Web小説を原文付きで多言語読書",
    description:
      "長編小説・Web小説をOriginal・Bilingual・Translation onlyで読む多言語読書サービス。AI翻訳とHuman translationは別管理・別許可で、個人本棚・読み上げ・投稿にも対応します。",
    ogLocale: "ja_JP",
  },
  en: {
    title: "LIB read | Multilingual Long-Form & Web Novel Reader",
    description:
      "Read long-form fiction and web novels as Original, Bilingual, or Translation only. AI and Human translation have separate provenance and author permissions, with private library import, read-aloud, and publishing also available.",
    ogLocale: "en_US",
  },
  ko: {
    title: "LIB read | 다국어 장편소설·웹소설 리더",
    description:
      "장편소설과 웹소설을 원문·대역·번역만 보기로 읽는 다국어 독서 서비스입니다. AI 번역과 Human translation은 출처와 작가 허가가 분리되며 개인 서재, 읽어주기, 작품 게시도 지원합니다.",
    ogLocale: "ko_KR",
  },
};

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getUiLocale();
  const localized = metadataByLocale[locale];

  return {
    metadataBase: SITE_URL,
    title: localized.title,
    description: localized.description,
    robots: {
      index: false,
      follow: true,
    },
    openGraph: {
      type: "website",
      locale: localized.ogLocale,
      siteName: "LIB read",
      title: localized.title,
      description: localized.description,
      images: [
        {
          url: "/opengraph-image",
          width: 1200,
          height: 630,
          alt: localized.title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: localized.title,
      description: localized.description,
      images: ["/opengraph-image"],
    },
    other: {
      "google-adsense-account": "ca-pub-7690891889566825",
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getUiLocale();

  return (
    <html lang={locale}>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <UiLocaleProvider locale={locale}>
          <div className="min-h-screen bg-background text-foreground">
            <Suspense fallback={null}>
              <GlobalNavigationProgress />
            </Suspense>
            <AppHeader />
            {children}
            <AppFooter />
          </div>
        </UiLocaleProvider>
        <Analytics />
      </body>
    </html>
  );
}
