import { notFound } from "next/navigation";
import ManualEpisodeTranslationEditor from "@/features/translation/ManualEpisodeTranslationEditor";
import { requireLoggedInUser } from "@/lib/auth/requireLoggedInUser";
import { getCachedPublicReadPagePayload } from "@/lib/publicRead";
import {
  isEpisodeTranslationAllowlisted,
  isSeriesTranslationEligibleIncludingOfficial,
} from "@/lib/translation/episodeTranslationServer";
import {
  isPublicTranslationTargetLanguage,
  parseSupportedLanguageTag,
  type PublicTranslationTargetLanguage,
} from "@/lib/translation/languageRegistry";
import { inferSeriesSourceLanguage } from "@/lib/translation/seriesSourceLanguage";
import { getEpisodeBody, pickText } from "@/features/write/writeShared";
import { getUiLocale } from "@/i18n/server";
import { localizePath } from "@/i18n/navigation";

type PageProps = {
  params: Promise<{ seriesId: string; episodeNumber: string }>;
  searchParams: Promise<{ targetLanguage?: string }>;
};

function defaultTargetLanguage(
  sourceLanguage: string,
  uiLocale: "ja" | "en" | "ko"
): PublicTranslationTargetLanguage {
  if (
    uiLocale !== sourceLanguage &&
    isPublicTranslationTargetLanguage(uiLocale)
  ) {
    return uiLocale;
  }
  return sourceLanguage === "ja" ? "en" : "ja";
}

export default async function HumanTranslationPage({
  params,
  searchParams,
}: PageProps) {
  const { seriesId, episodeNumber: episodeNumberRaw } = await params;
  const episodeNumber = Number(episodeNumberRaw);
  if (!Number.isInteger(episodeNumber) || episodeNumber < 1) notFound();

  const query = await searchParams;
  const requestedTargetLanguage = parseSupportedLanguageTag(query.targetLanguage);
  const returnPath = `/translate/${seriesId}/${episodeNumber}${
    requestedTargetLanguage ? `?targetLanguage=${requestedTargetLanguage}` : ""
  }`;
  await requireLoggedInUser(returnPath);

  const payload = await getCachedPublicReadPagePayload(seriesId, episodeNumber);
  if (!payload || payload.r18Blocked) notFound();

  const body = getEpisodeBody(payload.episode);
  const sourceLanguage = inferSeriesSourceLanguage(payload.series, body);
  if (!sourceLanguage) notFound();

  const eligible =
    (await isSeriesTranslationEligibleIncludingOfficial(payload.series)) ||
    isEpisodeTranslationAllowlisted({
      episodeId: payload.episode.id,
      seriesId,
      episodeNumber,
    });
  if (!eligible) notFound();

  const locale = await getUiLocale();
  const targetLanguage =
    requestedTargetLanguage &&
    requestedTargetLanguage !== sourceLanguage &&
    isPublicTranslationTargetLanguage(requestedTargetLanguage)
      ? requestedTargetLanguage
      : defaultTargetLanguage(sourceLanguage, locale);

  const readPath =
    `/read/${seriesId}/${episodeNumber}?readingMode=bilingual&bilingual=1&sourceLanguage=${encodeURIComponent(
      sourceLanguage
    )}&targetLanguage=${encodeURIComponent(targetLanguage)}`;

  return (
    <ManualEpisodeTranslationEditor
      episodeId={payload.episode.id}
      sourceLanguage={sourceLanguage}
      targetLanguage={targetLanguage}
      readHref={localizePath(readPath, locale)}
      workHref={localizePath(`/works/${seriesId}`, locale)}
      seriesTitle={pickText(payload.series.title) || "LIB read"}
      episodeTitle={pickText(payload.episode.title) || `#${episodeNumber}`}
    />
  );
}
