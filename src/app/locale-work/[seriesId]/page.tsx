import type { Metadata } from "next";
import { notFound } from "next/navigation";
import WorkPage from "../../works/[seriesId]/page";
import WorkTranslationAvailability from "@/features/works/WorkTranslationAvailability";
import { getUiLocale } from "@/i18n/server";
import { workDictionaries } from "@/i18n/dictionaries/work";
import { localizePath } from "@/i18n/navigation";
import { getCachedPublicBaseWorkCards } from "@/lib/publicWorks";

type WorkPageProps = Parameters<typeof WorkPage>[0];

export async function generateMetadata({
  params,
}: Pick<WorkPageProps, "params">): Promise<Metadata> {
  const locale = await getUiLocale();
  const dictionary = workDictionaries[locale];
  const { seriesId } = await params;

  const works = await getCachedPublicBaseWorkCards({
    ignoreContentLanguageFilter: true,
    prioritizeForUiLocale: false,
  });
  const work = works.find((item) => item.seriesId === seriesId);

  if (!work) {
    return {
      title: `${dictionary.notFound} | LIB read`,
      robots: { index: false, follow: false },
    };
  }

  const title = work.title || dictionary.untitled;
  const summary = work.summary.trim() || dictionary.noSummary;
  const encodedSeriesId = encodeURIComponent(seriesId);
  const canonical = localizePath(`/works/${encodedSeriesId}`, locale);

  return {
    title: `${title} | LIB read`,
    description: summary.slice(0, 160),
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
      title: `${title} | LIB read`,
      description: summary.slice(0, 160),
      images: ["/opengraph-image"],
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | LIB read`,
      description: summary.slice(0, 160),
      images: ["/opengraph-image"],
    },
  };
}

export default async function LocaleWorkPage(props: WorkPageProps) {
  const locale = await getUiLocale();
  if (locale === "ja") notFound();
  const { seriesId } = await props.params;

  return (
    <>
      <WorkTranslationAvailability seriesId={seriesId} />
      <WorkPage {...props} />
    </>
  );
}
