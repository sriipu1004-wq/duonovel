import { notFound } from "next/navigation";
import EpisodePlayback from "@/features/playback/EpisodePlayback";
import {
  isSeriesEpisodeCommentVisible,
  getEpisodeBody,
  getEpisodeNumber,
  pickText,
  type RecordingPermissionMode,
} from "@/features/write/writeShared";
import {
  mergeEffectSettings,
  parseEffectSettingsFromRow,
} from "@/lib/effects/effectSettings";
import type {
  NemoGeneratedAudioSegment,
  NemoGeneratedSentenceTiming,
} from "@/lib/recording/nemoTiming";
import {
  buildNemoTimingPublicUrlFromAudioPublicUrl,
  parseNemoGeneratedAudioSegments,
  parseNemoGeneratedSentenceTimings,
} from "@/lib/recording/nemoTiming";
import { normalizeRecordingPermissionMode } from "@/lib/recording/recordingEntry";
import { resolveNemoAutoGenerationConfig } from "@/lib/recording/nemoAutoGeneration";
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
    startAt?: string;
    autoplay?: string;
  }>;
};

async function fetchGeneratedPlaybackAssets(
  audioPublicUrl?: string | null
): Promise<{
  sentenceTimings: NemoGeneratedSentenceTiming[];
  audioSegments: NemoGeneratedAudioSegment[];
}> {
  const timingUrl = buildNemoTimingPublicUrlFromAudioPublicUrl(
    audioPublicUrl ?? ""
  );

  if (!timingUrl) {
    return {
      sentenceTimings: [],
      audioSegments: [],
    };
  }

  try {
    const response = await fetch(timingUrl, {
      next: { revalidate: 30 },
    });

    if (!response.ok) {
      return {
        sentenceTimings: [],
        audioSegments: [],
      };
    }

    const payload = await response.json();

    return {
      sentenceTimings: parseNemoGeneratedSentenceTimings(payload),
      audioSegments: parseNemoGeneratedAudioSegments(payload),
    };
  } catch {
    return {
      sentenceTimings: [],
      audioSegments: [],
    };
  }
}

function parseEpisodeNumber(value: string): number {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function parseStartAt(value?: string): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
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

function getRecordingReaderId(recording: RecordingRow): string {
  return pickText(
    recording.reader_id,
    recording.reader_user_id,
    recording.readerUserId
  );
}

function doesRecordingMatchRequestedReader(
  recording: RecordingRow,
  requestedReaderKey?: string,
  requestedReaderName?: string
): boolean {
  const hasRequestedReader = Boolean(
    pickText(requestedReaderKey, requestedReaderName)
  );

  if (!hasRequestedReader) {
    return false;
  }

  const readerKey = getRecordingReaderKey(recording);
  const readerName = getRecordingReaderName(recording);

  if (requestedReaderKey) {
    if (readerKey === requestedReaderKey || readerName === requestedReaderKey) {
      return true;
    }
  }

  if (requestedReaderName) {
    if (readerName === requestedReaderName) {
      return true;
    }
  }

  return false;
}

function resolveCurrentEpisodeAutoNarrationBadge(args: {
  permissionMode: RecordingPermissionMode;
  hasConfig: boolean;
  hasCurrentEpisodeNemoRecording: boolean;
}): {
  label: string;
  className: string;
} {
  const { permissionMode, hasConfig, hasCurrentEpisodeNemoRecording } = args;

  if (permissionMode !== "open") {
    return {
      label: "自動朗読停止",
      className: "border-black/10 bg-neutral-50 text-neutral-500",
    };
  }

  if (!hasConfig) {
    return {
      label: "自動朗読未設定",
      className: "border-amber-200 bg-amber-50 text-amber-700",
    };
  }

  if (hasCurrentEpisodeNemoRecording) {
    return {
      label: "自動朗読生成済み",
      className: "border-sky-200 bg-sky-50 text-black",
    };
  }

  return {
    label: "自動朗読生成待ち",
    className: "border-black/10 bg-neutral-50 text-neutral-500",
  };
}

function isNemoReaderName(name: string): boolean {
  return name.startsWith("VOICEVOX Nemo");
}

function isAivisReaderName(name: string): boolean {
  return name.startsWith("Aivis ");
}

function getCanonicalAivisReaderKey(name: string): string {
  return `aivis:${name}`;
}

function getCanonicalNemoReaderKey(name: string): string {
  return `nemo:${name}`;
}

function getRecordingReaderKey(recording: RecordingRow): string {
  const voiceModelKey = pickText(
    recording.voice_model_id,
    recording.voiceModelId
  );

  if (voiceModelKey) {
    return voiceModelKey;
  }

  const name = getRecordingReaderName(recording);

  if (isNemoReaderName(name)) {
    return getCanonicalNemoReaderKey(name);
  }

  if (isAivisReaderName(name)) {
    return getCanonicalAivisReaderKey(name);
  }

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

  const initialStartAt = parseStartAt(resolvedSearchParams?.startAt);
  const initialAutoPlay = resolvedSearchParams?.autoplay === "1";

  const payload = await getCachedPublicReadPagePayload(
    seriesId,
    parsedEpisodeNumber
  );

  if (!payload) {
    notFound();
  }

  const { series, episode, publicEpisodes } = payload;
  const allEpisodeRecordings = payload.allEpisodeRecordings.filter(
    (recording) => !isNemoReaderName(getRecordingReaderName(recording))
  );

  const recordingPermissionMode = normalizeRecordingPermissionMode(
    series.recording_permission_mode
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

  const requestedReaderName = pickText(resolvedSearchParams?.readerName);
  const requestedReaderKey =
    requestedReaderName && isNemoReaderName(requestedReaderName)
      ? getCanonicalNemoReaderKey(requestedReaderName)
      : requestedReaderName && isAivisReaderName(requestedReaderName)
        ? getCanonicalAivisReaderKey(requestedReaderName)
        : pickText(
            resolvedSearchParams?.readerKey,
            requestedReaderName
          );

  const requestedReaderSpecified = Boolean(
    pickText(requestedReaderKey, requestedReaderName)
  );

  let selectedRecording: RecordingRow | null = null;

  if (requestedReaderSpecified) {
    selectedRecording =
      allEpisodeRecordings.find((recording) =>
        doesRecordingMatchRequestedReader(
          recording,
          requestedReaderKey,
          requestedReaderName
        )
      ) ?? null;
  }

  const selectedReaderKey = selectedRecording
    ? getRecordingReaderKey(selectedRecording)
    : requestedReaderKey;

  const selectedReaderName = selectedRecording
    ? getRecordingReaderName(selectedRecording)
    : requestedReaderName;

  const nemoAutogenConfig = resolveNemoAutoGenerationConfig();

  const hasCurrentEpisodeNemoRecording = !!nemoAutogenConfig
    ? allEpisodeRecordings.some(
        (recording) =>
          getRecordingReaderId(recording) === nemoAutogenConfig.userId ||
          getRecordingReaderName(recording) === nemoAutogenConfig.narratorName
      )
    : false;

  const autoNarrationBadge = resolveCurrentEpisodeAutoNarrationBadge({
    permissionMode: recordingPermissionMode,
    hasConfig: !!nemoAutogenConfig,
    hasCurrentEpisodeNemoRecording,
  });

  const recordingAvailable = !!selectedRecording;
  const audioStoragePath = pickText(
    selectedRecording?.audio_storage_path,
    selectedRecording?.audioStoragePath
  );

  const shouldFetchGeneratedPlaybackAssets =
    recordingAvailable && Boolean(audioStoragePath);

  const {
    sentenceTimings: generatedSentenceTimings,
    audioSegments: generatedAudioSegments,
  } = shouldFetchGeneratedPlaybackAssets
    ? await fetchGeneratedPlaybackAssets(audioStoragePath)
    : {
        sentenceTimings: [],
        audioSegments: [],
      };

  const seriesTitle = pickText(series.title) || "無題";
  const commentsVisible = isSeriesEpisodeCommentVisible(series);
  const episodeTitle =
    pickText(episode.title, episode["episode_title"]) ||
    `第${currentEpisodeNumber}話`;

  const body = getEpisodeBody(episode) || "本文がまだ登録されていません。";

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

  const workIndexHref = buildWorksHref(
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
    selectedReaderName || selectedReaderKey
      ? buildReaderAuthorHref(selectedReaderKey, selectedReaderName)
      : undefined;  

  const seriesEffectSettings = parseEffectSettingsFromRow(
    series["effect_settings"],
    series["effectSettings"]
  );

  const episodeEffectSettings = parseEffectSettingsFromRow(
    episode["effect_settings"],
    episode["effectSettings"]
  );

  const effectSettings = mergeEffectSettings(
    seriesEffectSettings,
    episodeEffectSettings
  );

  return (
    <>
      <EpisodePlayback
        seriesId={seriesId}
        episodeId={episode.id}
        recordingId={selectedRecording?.id ?? null}
        episodeNumber={currentEpisodeNumber}
        seriesTitle={seriesTitle}
        episodeTitle={episodeTitle}
        body={body}
        selectedReaderKey={selectedReaderKey || undefined}
        selectedReaderName={selectedReaderName}
        readerAuthorHref={readerAuthorHref}
        recordingAvailable={recordingAvailable}
        audioStoragePath={audioStoragePath}
        generatedSentenceTimings={generatedSentenceTimings}
        generatedAudioSegments={generatedAudioSegments}
        prevEpisodeHref={prevEpisodeHref}
        prevEpisodeNumber={prevEpisodeNumber}
        nextEpisodeHref={nextEpisodeHref}
        nextEpisodeNumber={nextEpisodeNumber}
        workIndexHref={workIndexHref}
        initialStartAt={initialStartAt}
        initialAutoPlay={initialAutoPlay}
        loginHref={loginHref}
        showComments={commentsVisible}
        effectSettings={effectSettings}
        autoNarrationStatusLabel={autoNarrationBadge.label}
        autoNarrationStatusClassName={autoNarrationBadge.className}
        stopNarrationByDefault={!requestedReaderSpecified}
      />
    </>
  );
}