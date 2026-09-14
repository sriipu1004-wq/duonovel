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
    title: "LIB read | 時間指定AI短編を読む・聴く",
    description:
      "空き時間に合わせてAI短編を生成し、その場で読む・聴く。LIB readは、小説を読む・聴く・投稿するためのサービスです。",
    ogLocale: "ja_JP",
  },
  en: {
    title: "LIB read | Read, listen, and learn with stories",
    description:
      "Read long-form stories with bilingual text, text-to-speech, AI stories, and your own imported library in one reading service.",
    ogLocale: "en_US",
  },
  ko: {
    title: "LIB read | 소설을 읽고, 듣고, 배우기",
    description:
      "개인 서재, 다국어 대역, 읽어주기, AI 이야기와 웹소설을 한곳에서 이용하는 독서 서비스입니다.",
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
