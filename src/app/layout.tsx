import type { Metadata } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
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

export const metadata: Metadata = {
  title: "LIB read",
  other: {
    "google-adsense-account": "ca-pub-7690891889566825",
  },
  description: "LIB read（ライブリード）は、テキストと朗読を行き来できる小説投稿サイト",
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
      </body>
    </html>
  );
}