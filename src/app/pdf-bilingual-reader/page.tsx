import type { Metadata } from "next";
import SearchLandingPage from "@/components/seo/SearchLandingPage";
import {
  buildJaSearchDiscoveryStructuredData,
  getJaSearchDiscoveryDefinition,
} from "@/lib/seo/jaSearchDiscovery";

const definition = getJaSearchDiscoveryDefinition("pdf-bilingual-reader");

export const metadata: Metadata = {
  title: definition.title,
  description: definition.description,
  alternates: {
    canonical: "/pdf-bilingual-reader",
    languages: {
      ja: "/pdf-bilingual-reader",
      en: "/en/pdf-epub-bilingual-reader",
      ko: "/ko/pdf-epub-bilingual-reader",
      "x-default": "/pdf-bilingual-reader",
    },
  },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    locale: "ja_JP",
    siteName: "LIB read",
    url: "/pdf-bilingual-reader",
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

export default function PdfBilingualReaderPage() {
  const structuredData = buildJaSearchDiscoveryStructuredData("pdf-bilingual-reader");
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
