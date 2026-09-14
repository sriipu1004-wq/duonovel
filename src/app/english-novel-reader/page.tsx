import type { Metadata } from "next";
import SearchLandingPage from "@/components/seo/SearchLandingPage";
import { getJaSearchDiscoveryDefinition } from "@/lib/seo/jaSearchDiscovery";

const definition = getJaSearchDiscoveryDefinition("english-novel-reader");

export const metadata: Metadata = {
  title: definition.title,
  description: definition.description,
  alternates: {
    canonical: "/english-novel-reader",
  },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    locale: "ja_JP",
    siteName: "LIB read",
    url: "/english-novel-reader",
    title: definition.title,
    description: definition.description,
    images: ["/opengraph-image"],
  },
  twitter: {
    card: "summary_large_image",
    title: definition.title,
    description: definition.description,
    images: ["/opengraph-image"],
  },
};

export default function EnglishNovelReaderPage() {
  return <SearchLandingPage config={definition.config} />;
}
