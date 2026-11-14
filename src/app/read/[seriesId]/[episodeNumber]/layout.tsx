import type { ReactNode } from "react";
import R18ContentGate from "@/components/content/R18ContentGate";
import ReadBilingualShell from "@/features/playback/ReadBilingualShell";
import ReaderSettingsTopBridge from "@/features/playback/ReaderSettingsTopBridge";
import {
  getEpisodeBody,
  getEpisodeNumber,
  getSeriesPublicationStatus,
  isEpisodePubliclyVisible,
  pickText,
  type SeriesRow,
} from "@/features/write/writeShared";
import {
  getSeriesContentWarnings,
  isR18Series,
  type SeriesContentWarning,
} from "@/lib/contentRating";
import { getCachedPublicReadPagePayload } from "@/lib/publicRead";
import {
  isEpisodeTranslationAllowlisted,
  isSeriesTranslationEligibleIncludingOfficial,
} from "@/lib/translation/episodeTranslationServer";
import {
  hasCurrentPublishedHumanTranslation,
  isHumanTranslationPermissionOpen,
} from "@/lib/translation/humanTranslationServer";
import { inferSeriesSourceLanguage } from "@/lib/translation/seriesSourceLanguage";
import { getUiLocale } from "@/i18n/server";
import { readPublicDomainMetadata } from "@/lib/publicDomainMetadata";
import {
  readerCanonicalPath,
  resolvePublicWorkAttribution,
} from "@/lib/seo/publicWorkSeo";
import ShareButtons from "@/components/share/ShareButtons";
import { shouldShowShareButtons } from "@/lib/share/shareLinks";
import type { UiLocale } from "@/i18n/config";
import { getNormalAuthorName } from "@/lib/readerAuthorName";
import {
  readPageDictionaries,
  type ReadPageDictionary,
} from "@/i18n/dictionaries/readPage";

type ReadEpisodeLayoutProps = {
  children: ReactNode;
  params: Promise<{ seriesId: string; episodeNumber: string }>;
};

function parseEpisodeNumber(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}


async function resolveReadAttribution(
  series: SeriesRow,
  dictionary: ReadPageDictionary
): Promise<{
  authorName: string;
  editorName: string;
  publisherName: string;
}> {
  // Owner decision 2026-11-15 「原作者を作者にする」: a Public Domain work's
  // author is its original author; the hosting account is shown as 「掲載」.
  // The account name comes from users.display_name, the same lookup as the
  // Reader page (series has no author_name column in Production). Non Public
  // Domain works keep their previous attribution source unchanged.
  const publicDomain = readPublicDomainMetadata(
    series["effect_settings"] ?? series["effectSettings"]
  );
  const attribution = resolvePublicWorkAttribution({
    publicDomainOriginalAuthor: publicDomain?.originalAuthor,
    accountAuthorName: publicDomain
      ? await getNormalAuthorName(series, "")
      : pickText(series["author_name"]) || "",
  });
  return {
    authorName: attribution.authorName || dictionary.authorUnset,
    editorName: "",
    publisherName: attribution.publisherName ?? "",
  };
}

function withSettingsTopBridge(content: ReactNode) {
  return (
    <>
      <ReaderSettingsTopBridge />
      {content}
    </>
  );
}

function WarningBadges({
  warnings,
  dictionary,
}: {
  warnings: SeriesContentWarning[];
  dictionary: ReadPageDictionary;
}) {
  if (warnings.length === 0) return null;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-wrap gap-2 px-3 pt-3 sm:px-6">
      {warnings.includes("sexual_r18") ? (
        <span className="inline-flex rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
          {dictionary.sexualR18Warning}
        </span>
      ) : null}
      {warnings.includes("violence") ? (
        <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
          {dictionary.violenceWarning}
        </span>
      ) : null}
    </div>
  );
}

function withContentWarningSurface(
  content: ReactNode,
  series: SeriesRow,
  dictionary: ReadPageDictionary,
  footer: ReactNode = null
) {
  const warnings = getSeriesContentWarnings(series);
  const r18 = isR18Series(series);

  if (warnings.length === 0) {
    return (
      <>
        {content}
        {footer}
      </>
    );
  }

  return (
    <div
      data-content-rating={r18 ? "r18" : "general"}
      data-ad-eligible={r18 ? "false" : undefined}
    >
      <WarningBadges warnings={warnings} dictionary={dictionary} />
      {content}
      {footer}
    </div>
  );
}

/**
 * P9 share buttons at the end of the Reader, outside ReadBilingualShell so
 * they stay in Original, Bilingual and Translation modes. Shown only for a
 * public series, a publicly visible episode and a non-R18 work. The shared
 * URL is the canonical Reader copy (owner decision 「元のページにまとめる」).
 */
function buildReaderShareSection(input: {
  series: SeriesRow;
  episode: Parameters<typeof isEpisodePubliclyVisible>[0];
  seriesId: string;
  episodeNumber: number;
  locale: UiLocale;
  seriesTitle: string;
  authorName: string;
}): ReactNode {
  const visible = shouldShowShareButtons({
    isPublic:
      getSeriesPublicationStatus(input.series) === "public" &&
      isEpisodePubliclyVisible(input.episode),
    isR18: isR18Series(input.series),
  });
  if (!visible) return null;
  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-56 pt-6 sm:px-6">
      <ShareButtons
        path={readerCanonicalPath(
          input.seriesId,
          input.episodeNumber,
          inferSeriesSourceLanguage(input.series, getEpisodeBody(input.episode))
        )}
        placement="reader"
        locale={input.locale}
        title={input.seriesTitle}
        authorName={input.authorName}
        className="rounded-[24px] border border-black/10 bg-white p-4"
      />
    </div>
  );
}

export default async function ReadEpisodeLayout({
  children,
  params,
}: ReadEpisodeLayoutProps) {
  const locale = await getUiLocale();
  const dictionary = readPageDictionaries[locale];
  const { seriesId, episodeNumber } = await params;
  const parsedEpisodeNumber = parseEpisodeNumber(episodeNumber);

  if (!parsedEpisodeNumber) {
    return withSettingsTopBridge(children);
  }

  let payload: Awaited<ReturnType<typeof getCachedPublicReadPagePayload>>;

  try {
    payload = await getCachedPublicReadPagePayload(
      seriesId,
      parsedEpisodeNumber
    );
  } catch {
    return withSettingsTopBridge(children);
  }

  if (!payload) {
    return withSettingsTopBridge(children);
  }

  if (payload.r18Blocked) {
    return (
      <R18ContentGate
        signedIn={payload.viewerSignedIn}
        returnHref={`/read/${encodeURIComponent(seriesId)}/${parsedEpisodeNumber}`}
        locale={locale}
      />
    );
  }

  const currentEpisodeNumber =
    getEpisodeNumber(payload.episode) || parsedEpisodeNumber;
  let aiTranslationEligible = false;
  let humanTranslationAvailable = false;
  const humanTranslationPermissionOpen =
    isHumanTranslationPermissionOpen(payload.series);

  try {
    aiTranslationEligible =
      payload.isOwner ||
      (await isSeriesTranslationEligibleIncludingOfficial(payload.series)) ||
      isEpisodeTranslationAllowlisted({
        episodeId: payload.episode.id,
        seriesId,
        episodeNumber: currentEpisodeNumber,
      });
    if (!aiTranslationEligible && !humanTranslationPermissionOpen) {
      humanTranslationAvailable = await hasCurrentPublishedHumanTranslation({
        episodeId: payload.episode.id,
        body: getEpisodeBody(payload.episode),
      });
    }
  } catch {
    return withSettingsTopBridge(children);
  }

  const translationEligible =
    aiTranslationEligible ||
    humanTranslationPermissionOpen ||
    humanTranslationAvailable;

  const seriesTitle = pickText(payload.series.title) || dictionary.untitled;
  // Without the translation shell the layout does not resolve the account
  // name; keep that path free of an extra read and share with the Public
  // Domain original author only (no author for user-posted works).
  const publicDomainForShare = readPublicDomainMetadata(
    payload.series["effect_settings"] ?? payload.series["effectSettings"]
  );
  const shareSectionFor = (authorName: string) =>
    buildReaderShareSection({
      series: payload.series,
      episode: payload.episode,
      seriesId,
      episodeNumber: currentEpisodeNumber,
      locale,
      seriesTitle,
      authorName,
    });

  if (!translationEligible) {
    return withContentWarningSurface(
      <>
        {withSettingsTopBridge(children)}
        {shareSectionFor(publicDomainForShare?.originalAuthor ?? "")}
      </>,
      payload.series,
      dictionary
    );
  }

  const attribution = await resolveReadAttribution(payload.series, dictionary);
  const shareAuthorName =
    attribution.authorName === dictionary.authorUnset ? "" : attribution.authorName;
  const episodeBody = getEpisodeBody(payload.episode);
  const sourceLanguage = inferSeriesSourceLanguage(payload.series, episodeBody);

  if (!sourceLanguage) {
    return withContentWarningSurface(
      <>
        {withSettingsTopBridge(children)}
        {shareSectionFor(shareAuthorName)}
      </>,
      payload.series,
      dictionary
    );
  }

  const previousEpisode = payload.previousEpisode;
  const nextEpisode = payload.nextEpisode;
  const hasMultipleEpisodes = Boolean(previousEpisode || nextEpisode);

  return withContentWarningSurface(
    withSettingsTopBridge(
      <ReadBilingualShell
        translationEligible={translationEligible}
        aiTranslationEligible={aiTranslationEligible}
        humanTranslationPermissionOpen={humanTranslationPermissionOpen}
        seriesId={seriesId}
        episodeId={payload.episode.id}
        episodeNumber={currentEpisodeNumber}
        seriesTitle={pickText(payload.series.title) || dictionary.untitled}
        episodeTitle={
          pickText(payload.episode.title, payload.episode["episode_title"]) ||
          dictionary.episode(currentEpisodeNumber)
        }
        workAuthorName={attribution.authorName}
        workEditorName={attribution.editorName}
        workPublisherName={attribution.publisherName}
        sourceLanguage={sourceLanguage}
        hasMultipleEpisodes={hasMultipleEpisodes}
        workIndexHref={
          hasMultipleEpisodes ? `/works/${encodeURIComponent(seriesId)}` : null
        }
        prevEpisodeHref={
          previousEpisode
            ? `/read/${encodeURIComponent(seriesId)}/${getEpisodeNumber(previousEpisode)}`
            : null
        }
        nextEpisodeHref={
          nextEpisode
            ? `/read/${encodeURIComponent(seriesId)}/${getEpisodeNumber(nextEpisode)}`
            : null
        }
      >
        {children}
      </ReadBilingualShell>
    ),
    payload.series,
    dictionary,
    shareSectionFor(shareAuthorName)
  );
}
