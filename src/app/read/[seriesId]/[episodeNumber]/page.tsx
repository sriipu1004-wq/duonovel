import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import WebSpeechEpisodePlayback from "@/features/playback/WebSpeechEpisodePlayback";
import {
  getEpisodeBody,
  getEpisodeNumber,
  getSeriesSummary,
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
    return value
      .map((item) => String(item).trim())
      .filter(Boolean);
  }

  if (typeof value === "string" && value.trim()) {
    return value
      .split(/[\n,、]/u)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function getAiGeneratedReadAttribution(value: unknown): {
  authorName: string;
  editorName: string;
} | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const series = value as Record<string, unknown>;
  const tags = parseTagList(series.tags);
  const settings = parseRecord(
    series.effect_settings ?? series.effectSettings
  );

  const isAiGenerated =
    tags.includes("AI生成") ||
    settings?.source === "time_fit_ai_story" ||
    settings?.aiGenerated === true ||
    settings?.authorName === "AI生成";

  if (!isAiGenerated) {
    return null;
  }

  return {
    authorName: "AI生成",
    editorName:
      pickText(settings?.editorName, settings?.editor_name) ||
      "編集者未設定",
  };
}

function getStoryFormat(value: unknown): "short" | "long" {
  if (!value || typeof value !== "object") {
    return "long";
  }

  const series = value as Record<string, unknown>;
  const tags = parseTagList(series.tags);
  const settings = parseRecord(
    series.effect_settings ?? series.effectSettings
  );

  if (
    tags.includes("AI生成") ||
    settings?.source === "time_fit_ai_story" ||
    settings?.aiGenerated === true ||
    settings?.authorName === "AI生成"
  ) {
    return "short";
  }

  return settings?.storyFormat === "short" ? "short" : "long";
}

function getRecordingReaderName(recording: RecordingRow): string {
  return (
    pickText(
      recording.reader_name,
      recording.narrator_name,
      recording.display_name,
      recording.speaker_name
    ) || "朗読者未設定"
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
  if (!requestedReaderKey && !requestedReaderName) {
    return false;
  }

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

  return `/read/${seriesId}/${episodeNumber}${
    queryString ? `?${queryString}` : ""
  }`;
}

async function getNormalAuthorName(series: SeriesRow): Promise<string> {
  const authorId =
    pickText(series.author_id, series["user_id"], series["userId"]) || "";

  if (!authorId) {
    return pickText(series["author_name"]) || "作者名未設定";
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

    if (displayName) {
      return displayName;
    }
  }

  return pickText(series["author_name"]) || "作者名未設定";
}

export default async function ReadEpisodePage({
  params,
  searchParams,
}: PageProps) {
  const { seriesId, episodeNumber } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const parsedEpisodeNumber = parseEpisodeNumber(episodeNumber);

  if (!parsedEpisodeNumber) {
    notFound();
  }

  const payload = await getCachedPublicReadPagePayload(
    seriesId,
    parsedEpisodeNumber
  );

  if (!payload) {
    notFound();
  }

  const { series, episode, publicEpisodes } = payload;
  const availableHumanRecordings = payload.allEpisodeRecordings.filter(
    (recording) => !isLegacyGeneratedRecording(recording)
  );
  const humanNarrationOptions = availableHumanRecordings
    .map((recording) => {
      const recordingId = recording.id;
      const readerKey = getRecordingReaderKey(recording);
      const readerName = getRecordingReaderName(recording);
      const audioStoragePath = pickText(
        recording.audio_storage_path,
        recording.audioStoragePath
      );

      return {
        recordingId,
        readerKey,
        readerName,
        audioStoragePath,
        readerAuthorHref: buildReaderAuthorHref(readerKey, readerName),
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
    ? getRecordingReaderName(selectedRecording)
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
  const storySummary = getSeriesSummary(series);
  const seriesTitle = pickText(series.title) || "無題";
  const episodeTitle =
    pickText(episode.title, episode["episode_title"]) ||
    `第${currentEpisodeNumber}話`;
  const body = getEpisodeBody(episode) || "本文がまだ登録されていません。";

  const aiGeneratedAttribution = getAiGeneratedReadAttribution(series);
  const workAuthorName = aiGeneratedAttribution
    ? aiGeneratedAttribution.authorName
    : await getNormalAuthorName(series);
  const workEditorName = aiGeneratedAttribution?.editorName ?? "";

  const prevEpisodeHref =
    prevEpisodeNumber !== null
      ? buildReadHref(
          seriesId,
          prevEpisodeNumber,
          selectedReaderKey,
          selectedReaderName
        )
      : null;
  const nextEpisodeHref =
    nextEpisodeNumber !== null
      ? buildReadHref(
          seriesId,
          nextEpisodeNumber,
          selectedReaderKey,
          selectedReaderName
        )
      : null;
  const workIndexHref = isShortStory
    ? null
    : buildWorksHref(
        seriesId,
        selectedReaderKey,
        selectedReaderName
      );
  const currentReadHref = buildReadHref(
    seriesId,
    currentEpisodeNumber,
    selectedReaderKey,
    selectedReaderName
  );
  const loginHref = `/login?next=${encodeURIComponent(currentReadHref)}`;
  const readerAuthorHref =
    selectedReaderKey || selectedReaderName
      ? buildReaderAuthorHref(selectedReaderKey, selectedReaderName)
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
      loginHref={loginHref}
      showComments={isSeriesEpisodeCommentVisible(series)}
      effectSettings={effectSettings}
    />
  );
}
