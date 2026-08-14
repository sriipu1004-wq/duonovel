import type { Metadata } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import AppHeader from "@/components/layout/AppHeader";
import AppFooter from "@/components/layout/AppFooter";
import "./globals.css";
import GlobalNavigationProgress from "@/components/navigation/GlobalNavigationProgress";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL = new URL("https://www.syosetu-libread.com");

const defaultTitle = "LIB read | 時間指定AI短編を読む・聴く";
const defaultDescription =
  "空き時間に合わせてAI短編を生成し、その場で読む・聴く。LIB readは、小説を読む・聴く・投稿するためのサービスです。";

export const metadata: Metadata = {
  metadataBase: SITE_URL,
  title: defaultTitle,
  description: defaultDescription,

  // 公開対象は個別ページで明示的にindex化する。
  // それ以外の認証・制作・一時生成・検索結果ページはデフォルトでnoindex。
  robots: {
    index: false,
    follow: true,
  },

  openGraph: {
    type: "website",
    locale: "ja_JP",
    siteName: "LIB read",
    url: "/",
    title: defaultTitle,
    description: defaultDescription,
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "LIB read | 時間指定AI短編を読む・聴く",
      },
    ],
  },

  twitter: {
    card: "summary_large_image",
    title: defaultTitle,
    description: defaultDescription,
    images: ["/opengraph-image"],
  },

  other: {
    "google-adsense-account": "ca-pub-7690891889566825",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <div className="min-h-screen bg-background text-foreground">
          <Suspense fallback={null}>
            <GlobalNavigationProgress />
          </Suspense>
          <AppHeader />
          {children}
          <AppFooter />
        </div>
        <Analytics />
      </body>
    </html>
  );
}
