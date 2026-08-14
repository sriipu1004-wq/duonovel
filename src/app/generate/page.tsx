import type { Metadata } from "next";
import TimeFitStoryGeneratorClient from "./TimeFitStoryGeneratorClient";

export const metadata: Metadata = {
  title: "5分・10分・15分のAI短編生成 | LIB read",
  description:
    "空き時間とジャンルを選ぶだけで、約5分・10分・15分・20分で読める・聴けるAI短編を生成します。",
  alternates: {
    canonical: "/generate",
  },
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    type: "website",
    locale: "ja_JP",
    siteName: "LIB read",
    url: "/generate",
    title: "5分・10分・15分のAI短編生成 | LIB read",
    description:
      "空き時間とジャンルを選ぶだけで、読める・聴けるAI短編を生成します。",
    images: ["/opengraph-image"],
  },
  twitter: {
    card: "summary_large_image",
    title: "5分・10分・15分のAI短編生成 | LIB read",
    description:
      "空き時間とジャンルを選ぶだけで、読める・聴けるAI短編を生成します。",
    images: ["/opengraph-image"],
  },
};

export default function GeneratePage() {
  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto w-full max-w-2xl px-4 pb-24 pt-10 sm:px-6">
        <TimeFitStoryGeneratorClient />
      </div>
    </main>
  );
}
