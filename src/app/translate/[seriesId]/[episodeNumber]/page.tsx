import type { Metadata } from "next";
import { notFound } from "next/navigation";
import R18ContentGate from "@/components/content/R18ContentGate";
import HumanTranslationEditor from "@/features/translation/HumanTranslationEditor";
import {
  getEpisodeBody,
  getSeriesPublicationStatus,
  isEpisodePubliclyVisible,
  pickText,
  type EpisodeRow,
  type SeriesRow,
} from "@/features/write/writeShared";
import { requireLoggedInUser } from "@/lib/auth/requireLoggedInUser";
import { isR18Series } from "@/lib/contentRating";
import { getCurrentR18ViewerPreference } from "@/lib/contentRatingServer";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  isPublicTranslationTargetLanguage,
  parseSupportedLanguageTag,
  type PublicTranslationTargetLanguage,
} from "@/lib/translation/languageRegistry";
import { inferSeriesSourceLanguage } from "@/lib/translation/seriesSourceLanguage";
import { getUiLocale } from "@/i18n/server";
import { isUuid } from "@/lib/uuid";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

type PageProps = {
  params: Promise<{ seriesId: string; episodeNumber: string }>;
  searchParams?: Promise<{ targetLanguage?: string }>;
};

function defaultTarget(sourceLanguage: string, locale: "ja" | "en" | "ko"): PublicTranslationTargetLanguage {
  const localeLanguage = parseSupportedLanguageTag(locale);
  if (
    localeLanguage &&
    localeLanguage !== sourceLanguage &&
    isPublicTranslationTargetLanguage(localeLanguage)
  ) {
    return localeLanguage;
  }
  return sourceLanguage === "ja" ? "en" : "ja";
}

export default async function HumanTranslationPage({ params, searchParams }: PageProps) {
  const { seriesId, episodeNumber } = await params;
  const parsedEpisodeNumber = Number(episodeNumber);
  if (!isUuid(seriesId) || !Number.isInteger(parsedEpisodeNumber) || parsedEpisodeNumber < 1) notFound();

  const resolvedSearch = searchParams ? await searchParams : undefined;
  const requestedTarget = parseSupportedLanguageTag(resolvedSearch?.targetLanguage);
  const nextPath = `/translate/${seriesId}/${parsedEpisodeNumber}${
    requestedTarget ? `?targetLanguage=${encodeURIComponent(requestedTarget)}` : ""
  }`;
  await requireLoggedInUser(nextPath);

  const admin = createAdminClient();
  const [seriesResult, episodeResult] = await Promise.all([
    admin.from("series").select("*").eq("id", seriesId).maybeSingle(),
    admin
      .from("episodes")
      .select("*")
      .eq("series_id", seriesId)
      .eq("episode_number", parsedEpisodeNumber)
      .maybeSingle(),
  ]);
  if (seriesResult.error || episodeResult.error || !seriesResult.data || !episodeResult.data) notFound();

  const series = seriesResult.data as SeriesRow;
  const episode = episodeResult.data as EpisodeRow;
  if (
    getSeriesPublicationStatus(series) !== "public" ||
    !isEpisodePubliclyVisible(episode)
  ) {
    notFound();
  }

  const locale = await getUiLocale();
  if (isR18Series(series) && !(await getCurrentR18ViewerPreference()).showR18Content) {
    return (
      <R18ContentGate
        signedIn
        returnHref={nextPath}
        locale={locale}
      />
    );
  }

  const body = getEpisodeBody(episode);
  const sourceLanguage = inferSeriesSourceLanguage(series, body);
  if (!sourceLanguage) notFound();

  const targetLanguage =
    requestedTarget &&
    requestedTarget !== sourceLanguage &&
    isPublicTranslationTargetLanguage(requestedTarget)
      ? requestedTarget
      : defaultTarget(sourceLanguage, locale);

  return (
    <HumanTranslationEditor
      seriesId={seriesId}
      episodeId={episode.id}
      episodeNumber={parsedEpisodeNumber}
      seriesTitle={pickText(series.title) || ""}
      episodeTitle={pickText(episode.title, episode.episode_title) || ""}
      sourceLanguage={sourceLanguage}
      initialTargetLanguage={targetLanguage}
    />
  );
}
