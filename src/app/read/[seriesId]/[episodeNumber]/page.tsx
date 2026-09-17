import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import WebSpeechEpisodePlayback from "@/features/playback/WebSpeechEpisodePlayback";
import ContinueStoryAction from "@/features/generation/ContinueStoryAction";
import {
  getEpisodeBody,
  getEpisodeNumber,
  getSeriesPublicationStatus,
  getSeriesSummary,
  isEpisodePubliclyVisible,
  isSeriesEpisodeCommentVisible,
  pickText,
  type SeriesRow,
} from "@/features/write/writeShared";
import {
  mergeEffectSettings,
  parseEffectSettingsFromRow,
} from "@/lib/effects/effectSettings";
import {
  getCachedPublicReadPagePayload,
  type PublicReadRecordingRow as RecordingRow,
} from "@/lib/publicRead";
import { buildReaderAuthorHref } from "@/lib/readerAuthorHref";
import { isSubscriber } from "@/lib/aiUsage/aiUsage.server";
import { getUiLocale } from "@/i18n/server";
import { localizePath } from "@/i18n/navigation";
import { readPageDictionaries } from "@/i18n/dictionaries/readPage";
import { inferSeriesSourceLanguage } from "@/lib/translation/seriesSourceLanguage";
import { getSupportedLanguage } from "@/lib/translation/languageRegistry";
import { isUuid } from "@/lib/uuid";

type PageProps = {
  params: Promise<{ seriesId: string; episodeNumber: string }>;
  searchParams?: Promise<{
    readerKey?: string;
    readerName?: string;
    autoplay?: string;
  }>;
};

function parseEpisodeNumber(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function parseRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object") {
    return value as Record<string, unknown>;
  }

  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object") {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }

  return null;
}

function parseTagList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof value === "string" && value.trim()) {
    return value
      .split(/[\n,、]/u)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function isAiGeneratedSeries(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const series = value as Record<string, unknown>;
  const tags = parseTagList(series.tags);
  const settings = parseRecord(series.effect_settings ?? series.effectSettings);
  return (
    tags.includes("AI生成") ||
    settings?.source === "time_fit_ai_story" ||
    settings?.aiGenerated === true ||
    settings?.authorName === "AI生成"
  );
}

function getAiGeneratedReadAttribution(
  value: unknown,
  aiGeneratedLabel: string,
  editorUnsetLabel: string
): { authorName: string; editorName: string } | null {
  if (!value || typeof value !== "object" || !isAiGeneratedSeries(value)) {
    return null;
  }

  const series = value as Record<string, unknown>;
  const settings = parseRecord(series.effect_settings ?? series.effectSettings);

  return {
    authorName: aiGeneratedLabel,
    editorName:
      pickText(settings?.editorName, settings?.editor_name) || editorUnsetLabel,
  };
}

function getStoryFormat(value: unknown): "short" | "long" {
  if (!value || typeof value !== "object") return "long";

  const series = value as Record<string, unknown>;
  const settings = parseRecord(series.effect_settings ?? series.effectSettings);

  if (settings?.storyFormat === "short" || settings?.storyFormat === "long") {
    return settings.storyFormat;
  }

  return isAiGeneratedSeries(value) ? "short" : "long";
}

function getRecordingReaderName(
  recording: RecordingRow,
  fallback = "朗読者未設定"
): string {
  return (
    pickText(
      recording.reader_name,
      recording.narrator_name,
      recording.display_name,
      recording.speaker_name
    ) || fallback
  );
}

function getRecordingReaderKey(recording: RecordingRow): string {
  return (
    pickText(
      recording.reader_id,
      recording.reader_user_id,
      recording.readerUserId,
      recording.reader_name,
      recording.narrator_name,
      recording.display_name,
      recording.speaker_name,
      recording.id
    ) || recording.id
  );
}

function isLegacyGeneratedRecording(recording: RecordingRow): boolean {
  const name = getRecordingReaderName(recording);
  return name.startsWith("Aivis ") || name.startsWith("VOICEVOX Nemo");
}

function doesRecordingMatchRequestedReader(
  recording: RecordingRow,
  requestedReaderKey?: string,
  requestedReaderName?: string
): boolean {
  if (!requestedReaderKey && !requestedReaderName) return false;
  const readerKey = getRecordingReaderKey(recording);
  const readerName = getRecordingReaderName(recording);
  return Boolean(
    (requestedReaderKey &&
      (readerKey === requestedReaderKey || readerName === requestedReaderKey)) ||
      (requestedReaderName && readerName === requestedReaderName)
  );
}

function buildWorksHref(
  seriesId: string,
  readerKey?: string,
  readerName?: string
): string {
  const query = new URLSearchParams();
  query.set("tab", "toc");
  if (readerKey) query.set("readerKey", readerKey);
  if (readerName) query.set("readerName", readerName);
  return `/works/${seriesId}?${query.toString()}`;
}

function buildReadHref(
  seriesId: string,
  episodeNumber: number,
  readerKey?: string,
  readerName?: string
): string {
  const query = new URLSearchParams();
  if (readerKey) query.set("readerKey", readerKey);
  if (readerName) query.set("readerName", readerName);
  const queryString = query.toString();
  return `/read/${seriesId}/${episodeNumber}${queryString ? `?${queryString}` : ""}`;
}

async function getNormalAuthorName(
  series: SeriesRow,
  authorUnsetLabel: string
): Promise<string> {
  const authorId =
    pickText(series.author_id, series["user_id"], series["userId"]) || "";

  if (!authorId) {
    return pickText(series["author_name"]) || authorUnsetLabel;
  }

  const adminSupabase = createAdminClient();
  const { data, error } = await adminSupabase.auth.admin.getUserById(authorId);

  if (!error && data?.user) {
    const metadata = data.user.user_metadata as Record<string, unknown> | null;
    const displayName = pickText(
      metadata?.display_name_candidate,
      metadata?.display_name,
      metadata?.displayName,
      metadata?.name,
      metadata?.full_name
    );
    if (displayName) return displayName;
  }

  return pickText(series["author_name"]) || authorUnsetLabel;
}

export async function generateMetadata({
  params,
}: Pick<PageProps, "params">): Promise<Metadata> {
  const locale = await getUiLocale();
  const readUi = readPageDictionaries[locale];
  const ui = {
    ja: {
      notFound: "公開話が見つかりません",
      publicEpisode: "公開話",
      fallbackDescription: (seriesTitle: string, episodeTitle: string) =>
        `${seriesTitle}の${episodeTitle}を読む・聴く。`,
      author: "作者",
      ogLocale: "ja_JP",
    },
    en: {
      notFound: "Public episode not found",
      publicEpisode: "Public episode",
      fallbackDescription: (seriesTitle: string, episodeTitle: string) =>
        `Read and listen to ${episodeTitle} of ${seriesTitle}.`,
      author: "Author",
      ogLocale: "en_US",
    },
    ko: {
      notFound: "공개 화를 찾을 수 없습니다",
      publicEpisode: "공개 화",
      fallbackDescription: (seriesTitle: string, episodeTitle: string) =>
        `${seriesTitle}의 ${episodeTitle}를 읽고 들을 수 있습니다.`,
      author: "작가",
      ogLocale: "ko_KR",
    },
  }[locale];

  const { seriesId, episodeNumber } = await params;
  const parsedEpisodeNumber = parseEpisodeNumber(episodeNumber);

  if (!isUuid(seriesId) || !parsedEpisodeNumber) {
    return {
      title: `${ui.notFound} | LIB read`,
      robots: { index: false, follow: false },
    };
  }

  try {
    const payload = await getCachedPublicReadPagePayload(
      seriesId,
      parsedEpisodeNumber
    );

    if (!payload) {
      return {
        title: `${ui.notFound} | LIB read`,
        robots: { index: false, follow: false },
      };
    }

    if (payload.r18Blocked) {
      return {
        title: `${ui.publicEpisode} | LIB read`,
        robots: { index: false, follow: false },
      };
    }

    const { series, episode } = payload;
    const currentEpisodeNumber = getEpisodeNumber(episode) || parsedEpisodeNumber;
    const seriesTitle = pickText(series.title) || readUi.untitled;
    const episodeTitle =
      pickText(episode.title, episode["episode_title"]) ||
      readUi.episode(currentEpisodeNumber);
    const summary = getSeriesSummary(series).trim();
    const aiGeneratedAttribution = getAiGeneratedReadAttribution(
      series,
      readUi.aiGenerated,
      readUi.editorUnset
    );
    const authorLabel = aiGeneratedAttribution
      ? aiGeneratedAttribution.authorName
      : await getNormalAuthorName(series, readUi.authorUnset);

    const description = [
      summary || ui.fallbackDescription(seriesTitle, episodeTitle),
      `${ui.author}: ${authorLabel}.`,
    ]
      .filter(Boolean)
      .join(" ")
      .slice(0, 160);

    const baseCanonicalPath =
      "/read/" +
      encodeURIComponent(seriesId) +
      "/" +
      encodeURIComponent(String(currentEpisodeNumber));
    const canonicalPath = localizePath(baseCanonicalPath, locale);
    const metadataTitle = `${seriesTitle} ${episodeTitle} | LIB read`;

    return {
      title: metadataTitle,
      description,
      alternates: {
        canonical: canonicalPath,
        languages: {
          ja: localizePath(baseCanonicalPath, "ja"),
          en: localizePath(baseCanonicalPath, "en"),
          ko: localizePath(baseCanonicalPath, "ko"),
          "x-default": localizePath(baseCanonicalPath, "ja"),
        },
      },
      robots: { index: true, follow: true },
      openGraph: {
        type: "article",
        locale: ui.ogLocale,
        siteName: "LIB read",
        url: canonicalPath,
        title: metadataTitle,
        description,
        images: ["/opengraph-image"],
      },
      twitter: {
        card: "summary_large_image",
        title: metadataTitle,
        description,
        images: ["/opengraph-image"],
      },
    };
  } catch {
    return {
      title: `${ui.publicEpisode} | LIB read`,
      robots: { index: false, follow: false },
    };
  }
}

export default async function ReadEpisodePage({
  params,
  searchParams,
}: PageProps) {
  const locale = await getUiLocale();
  const ui = readPageDictionaries[locale];
  const { seriesId, episodeNumber } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const parsedEpisodeNumber = parseEpisodeNumber(episodeNumber);

  if (!isUuid(seriesId) || !parsedEpisodeNumber) notFound();

  const payload = await getCachedPublicReadPagePayload(
    seriesId,
    parsedEpisodeNumber
  );
  if (!payload) notFound();

  // The parent layout renders the R18 gate. Do not build or serialize the child
  // reader payload at all for a viewer whose R18 preference blocks this work.
  if (payload.r18Blocked) return null;

  const { series, episode, publicEpisodes, isOwner, viewerUserId } = payload;
  const subscriber = viewerUserId ? await isSubscriber(viewerUserId) : false;
  const availableHumanRecordings = payload.allEpisodeRecordings.filter(
    (recording) => !isLegacyGeneratedRecording(recording)
  );
  const humanNarrationOptions = availableHumanRecordings
    .map((recording) => {
      const recordingId = recording.id;
      const readerKey = getRecordingReaderKey(recording);
      const readerName = getRecordingReaderName(recording, ui.readerUnset);
      const audioStoragePath = pickText(
        recording.audio_storage_path,
        recording.audioStoragePath
      );

      return {
        recordingId,
        readerKey,
        readerName,
        audioStoragePath,
        readerAuthorHref: localizePath(
          buildReaderAuthorHref(readerKey, readerName),
          locale
        ),
      };
    })
    .filter((option) => option.audioStoragePath.length > 0);

  const requestedReaderKey = pickText(resolvedSearchParams?.readerKey);
  const requestedReaderName = pickText(resolvedSearchParams?.readerName);

  const selectedRecording =
    requestedReaderKey || requestedReaderName
      ? availableHumanRecordings.find((recording) =>
          doesRecordingMatchRequestedReader(
            recording,
            requestedReaderKey,
            requestedReaderName
          )
        ) ?? null
      : null;

  const selectedReaderKey = selectedRecording
    ? getRecordingReaderKey(selectedRecording)
    : requestedReaderKey;
  const selectedReaderName = selectedRecording
    ? getRecordingReaderName(selectedRecording, ui.readerUnset)
    : requestedReaderName;
  const humanAudioStoragePath = pickText(
    selectedRecording?.audio_storage_path,
    selectedRecording?.audioStoragePath
  );

  const currentEpisodeNumber = getEpisodeNumber(episode) || parsedEpisodeNumber;
  const prevEpisode =
    [...publicEpisodes]
      .reverse()
      .find((item) => getEpisodeNumber(item) < currentEpisodeNumber) ?? null;
  const nextEpisode =
    publicEpisodes.find((item) => getEpisodeNumber(item) > currentEpisodeNumber) ??
    null;
  const prevEpisodeNumber = prevEpisode ? getEpisodeNumber(prevEpisode) : null;
  const nextEpisodeNumber = nextEpisode ? getEpisodeNumber(nextEpisode) : null;

  const storyFormat = getStoryFormat(series);
  const isShortStory = storyFormat === "short";
  const isPublicReadPage =
    getSeriesPublicationStatus(series) === "public" &&
    isEpisodePubliclyVisible(episode);
  const storySummary = getSeriesSummary(series);
  const seriesTitle = pickText(series.title) || ui.untitled;
  const episodeTitle =
    pickText(episode.title, episode["episode_title"]) ||
    ui.episode(currentEpisodeNumber);
  const episodeBody = getEpisodeBody(episode);
  const body = episodeBody || ui.bodyMissing;
  const sourceLanguage = inferSeriesSourceLanguage(series, episodeBody);
  const speechLanguage = sourceLanguage
    ? getSupportedLanguage(sourceLanguage).speechLanguage
    : "ja-JP";

  const aiGeneratedAttribution = getAiGeneratedReadAttribution(
    series,
    ui.aiGenerated,
    ui.editorUnset
  );
  const workAuthorName = aiGeneratedAttribution
    ? aiGeneratedAttribution.authorName
    : await getNormalAuthorName(series, ui.authorUnset);
  const workEditorName = aiGeneratedAttribution?.editorName ?? "";

  const prevEpisodeHref =
    prevEpisodeNumber !== null
      ? localizePath(
          buildReadHref(
            seriesId,
            prevEpisodeNumber,
            selectedReaderKey,
            selectedReaderName
          ),
          locale
        )
      : null;
  const nextEpisodeHref =
    nextEpisodeNumber !== null
      ? localizePath(
          buildReadHref(
            seriesId,
            nextEpisodeNumber,
            selectedReaderKey,
            selectedReaderName
          ),
          locale
        )
      : null;
  const workIndexHref = isShortStory
    ? null
    : localizePath(
        buildWorksHref(seriesId, selectedReaderKey, selectedReaderName),
        locale
      );
  const currentReadHref = localizePath(
    buildReadHref(
      seriesId,
      currentEpisodeNumber,
      selectedReaderKey,
      selectedReaderName
    ),
    locale
  );
  const loginHref = localizePath(
    `/login?next=${encodeURIComponent(currentReadHref)}`,
    locale
  );
  const readerAuthorHref =
    selectedReaderKey || selectedReaderName
      ? localizePath(
          buildReaderAuthorHref(selectedReaderKey, selectedReaderName),
          locale
        )
      : undefined;

  const effectSettings = mergeEffectSettings(
    parseEffectSettingsFromRow(
      series["effect_settings"],
      series["effectSettings"]
    ),
    parseEffectSettingsFromRow(
      episode["effect_settings"],
      episode["effectSettings"]
    )
  );

  return (
    <WebSpeechEpisodePlayback
      seriesId={seriesId}
      episodeId={episode.id}
      episodeNumber={currentEpisodeNumber}
      seriesTitle={seriesTitle}
      episodeTitle={episodeTitle}
      workAuthorName={workAuthorName}
      workEditorName={workEditorName}
      body={body}
      selectedReaderKey={selectedReaderKey || undefined}
      selectedReaderName={selectedReaderName}
      readerAuthorHref={readerAuthorHref}
      humanRecordingId={selectedRecording?.id ?? humanNarrationOptions[0]?.recordingId ?? null}
      humanAudioStoragePath={
        humanAudioStoragePath || humanNarrationOptions[0]?.audioStoragePath || null
      }
      humanNarrationOptions={humanNarrationOptions}
      isShortStory={isShortStory}
      storySummary={storySummary}
      prevEpisodeHref={prevEpisodeHref}
      prevEpisodeNumber={prevEpisodeNumber}
      nextEpisodeHref={nextEpisodeHref}
      nextEpisodeNumber={nextEpisodeNumber}
      workIndexHref={workIndexHref}
      initialAutoPlay={resolvedSearchParams?.autoplay === "1"}
      isSubscriber={subscriber}
      loginHref={loginHref}
      showComments={isPublicReadPage && isSeriesEpisodeCommentVisible(series)}
      effectSettings={effectSettings}
      speechLanguage={speechLanguage}
      ownerActions={
        isOwner &&
        aiGeneratedAttribution &&
        nextEpisodeNumber === null &&
        episodeBody.trim() ? (
          <ContinueStoryAction seriesId={seriesId} isShortStory={isShortStory} />
        ) : null
      }
    />
  );
}
