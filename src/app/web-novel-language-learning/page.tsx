import type { Metadata } from "next";
import SearchLandingPage from "@/components/seo/SearchLandingPage";
import {
  buildJaSearchDiscoveryStructuredData,
  getJaSearchDiscoveryDefinition,
} from "@/lib/seo/jaSearchDiscovery";

const definition = getJaSearchDiscoveryDefinition("web-novel-language-learning");

export const metadata: Metadata = {
  title: definition.title,
  description: definition.description,
  alternates: {
    canonical: "/web-novel-language-learning",
  },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    locale: "ja_JP",
    siteName: "LIB read",
    url: "/web-novel-language-learning",
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

export default function WebNovelLanguageLearningPage() {
  const structuredData = buildJaSearchDiscoveryStructuredData("web-novel-language-learning");
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <SearchLandingPage config={definition.config} />
    </>
  );
}
