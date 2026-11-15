import type { Metadata } from "next";
import { notFound } from "next/navigation";
import WorkPage from "../../works/[seriesId]/page";
import WorkTranslationAvailability from "@/features/works/WorkTranslationAvailability";
import { getUiLocale } from "@/i18n/server";
import { workDictionaries } from "@/i18n/dictionaries/work";
import { localizePath } from "@/i18n/navigation";
import { getPublicWorkMetadataCardById } from "@/lib/publicWorks";
import { isUuid } from "@/lib/uuid";
import { buildLocalizedWorkMetadataText } from "@/lib/seo/publicWorkSeo";
import { workOgImagePath } from "@/lib/og/workOgContent";
import { assertSeriesAvailableInRequestRegion } from "@/lib/rights/regionRestriction.server";

type WorkPageProps = Parameters<typeof WorkPage>[0];

export async function generateMetadata({
  params,
}: Pick<WorkPageProps, "params">): Promise<Metadata> {
  const locale = await getUiLocale();
  const dictionary = workDictionaries[locale];
  const { seriesId } = await params;
  await assertSeriesAvailableInRequestRegion(seriesId);

  // Metadata should fetch one public work rather than refreshing the full
  // catalog. A failed per-work lookup must
  // reveal neither a potentially private work nor an R18-filtered title.
  if (!isUuid(seriesId)) {
    return {
      title: `${dictionary.notFound} | LIB read`,
      robots: { index: false, follow: false },
    };
  }

  let work: Awaited<ReturnType<typeof getPublicWorkMetadataCardById>>;
  try {
    work = await getPublicWorkMetadataCardById(seriesId);
  } catch {
    // A transient single-work read failure must not throw from generateMetadata.
    // Do not serve stale work-specific metadata or expose private/R18 content.
    return {
      title: "LIB read",
      robots: { index: false, follow: false },
    };
  }

  if (!work) {
    return {
      title: `${dictionary.notFound} | LIB read`,
      robots: { index: false, follow: false },
    };
  }

  // P9: the localized Work title/description are written in the UI locale
  // (the card summary carries a Japanese placeholder when none exists).
  const { title: metadataTitle, description: metadataDescription } =
    buildLocalizedWorkMetadataText({
      locale: locale === "ko" ? "ko" : "en",
      title: work.title || dictionary.untitled,
      summary: work.summary,
      authorName: work.authorName,
      isPublicDomain: work.publicDomainRightsChecked === true,
      hasOriginalAuthor: work.originalAuthorAttributed === true,
      sourceLanguage: work.sourceLanguage,
      sourceProvider: work.publicDomainSourceProvider,
    });
  const encodedSeriesId = encodeURIComponent(seriesId);
  const canonical = localizePath(`/works/${encodedSeriesId}`, locale);

  return {
    title: metadataTitle,
    description: metadataDescription,
    alternates: {
      canonical,
      languages: {
        ja: `/works/${encodedSeriesId}`,
        en: `/en/works/${encodedSeriesId}`,
        ko: `/ko/works/${encodedSeriesId}`,
        "x-default": `/works/${encodedSeriesId}`,
      },
    },
    robots: { index: true, follow: true },
    openGraph: {
      type: "article",
      locale: locale === "en" ? "en_US" : "ko_KR",
      siteName: "LIB read",
      url: canonical,
      title: metadataTitle,
      description: metadataDescription,
      images: [workOgImagePath(seriesId)],
    },
    twitter: {
      card: "summary_large_image",
      title: metadataTitle,
      description: metadataDescription,
      images: [workOgImagePath(seriesId)],
    },
  };
}

export default async function LocaleWorkPage(props: WorkPageProps) {
  const locale = await getUiLocale();
  if (locale === "ja") notFound();
  const { seriesId } = await props.params;
  await assertSeriesAvailableInRequestRegion(seriesId);

  if (!isUuid(seriesId)) notFound();

  return (
    <>
      <WorkTranslationAvailability seriesId={seriesId} />
      <WorkPage {...props} />
    </>
  );
}
