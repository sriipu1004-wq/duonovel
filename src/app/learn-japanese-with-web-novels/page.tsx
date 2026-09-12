import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SearchLandingPage from "@/components/seo/SearchLandingPage";
import { getUiLocale } from "@/i18n/server";
import {
  buildSearchDiscoveryMetadata,
  buildSearchDiscoveryStructuredData,
  getSearchDiscoveryDefinition,
} from "@/lib/seo/searchDiscovery";

const SLUG = "learn-japanese-with-web-novels" as const;

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getUiLocale();
  if (locale === "ja") return { robots: { index: false, follow: false } };
  return buildSearchDiscoveryMetadata(SLUG, locale);
}

export default async function LearnJapaneseWithWebNovelsPage() {
  const locale = await getUiLocale();
  if (locale === "ja") notFound();
  const definition = getSearchDiscoveryDefinition(SLUG, locale);
  const structuredData = buildSearchDiscoveryStructuredData(SLUG, locale);

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
