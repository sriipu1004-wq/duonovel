import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import EpisodePlayback from "@/features/playback/EpisodePlayback";
import {
  isEpisodePubliclyVisible,
  isSeriesEpisodeCommentVisible,
  getEpisodeBody,
  getEpisodeNumber,
  getSeriesPublicationStatus,
  pickText,
  sortEpisodes,
  type EpisodeRow,
  type SeriesRow,
} from "@/features/write/writeShared";
import {
  mergeBgmSettings,
  parseBgmSettingsFromRow,
} from "@/lib/bgm/bgmSettings";
import {
  mergeEffectSettings,
  parseEffectSettingsFromRow,
} from "@/lib/effects/effectSettings";
import type { NemoGeneratedSentenceTiming } from "@/lib/recording/nemoTiming";
import {
  buildNemoTimingPublicUrlFromAudioPublicUrl,
  parseNemoGeneratedSentenceTimings,
} from "@/lib/recording/nemoTiming";

type PageProps = {
  params: Promise<{ seriesId: string; episodeNumber: string }>;
  searchParams?: Promise<{
    readerKey?: string;
    readerName?: string;
    startAt?: string;
    autoplay?: string;
  }>;
};

type RecordingRow = Record<string, unknown> & {
  id: string;
  episode_id?: string | null;
  episodeId?: string | null;
  reader_id?: string | null;
  reader_user_id?: string | null;
  readerUserId?: string | null;
  reader_name?: string | null;
  narrator_name?: string | null;
  display_name?: string | null;
  speaker_name?: string | null;
  audio_storage_path?: string | null;
  audioStoragePath?: string | null;
  is_public?: boolean | null;
  public?: boolean | null;
};

async function fetchGeneratedSentenceTimings(
  audioPublicUrl?: string | null
): Promise<NemoGeneratedSentenceTiming[]> {
  const timingUrl = buildNemoTimingPublicUrlFromAudioPublicUrl(
    audioPublicUrl ?? ""
  );

  if (!timingUrl) {
    return [];
  }

  try {
    const response = await fetch(timingUrl, {
      cache: "no-store",
    });

    if (!response.ok) {
      return [];
    }

    const payload = await response.json();
    return parseNemoGeneratedSentenceTimings(payload);
  } catch {
    return [];
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

function isPublicRecording(recording: RecordingRow): boolean {
  if (recording.is_public === false) return false;
  if (recording.public === false) return false;
  return true;
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

async function fetchEpisodeBySeriesAndNumber(
  seriesId: string,
  episodeNumber: number
): Promise<EpisodeRow | null> {
  const tries = [
    () =>
      supabase
        .from("episodes")
        .select("*")
        .eq("series_id", seriesId)
        .eq("episode_number", episodeNumber)
        .maybeSingle(),
    () =>
      supabase
        .from("episodes")
        .select("*")
        .eq("series_id", seriesId)
        .eq("episodeNumber", episodeNumber)
        .maybeSingle(),
    () =>
      supabase
        .from("episodes")
        .select("*")
        .eq("seriesId", seriesId)
        .eq("episode_number", episodeNumber)
        .maybeSingle(),
    () =>
      supabase
        .from("episodes")
        .select("*")
        .eq("seriesId", seriesId)
        .eq("episodeNumber", episodeNumber)
        .maybeSingle(),
  ];

  for (const run of tries) {
    const result = await run();
    if (!result.error && result.data) {
      return result.data as EpisodeRow;
    }
  }

  return null;
}

async function fetchEpisodesBySeriesId(seriesId: string): Promise<EpisodeRow[]> {
  const firstTry = await supabase
    .from("episodes")
    .select("*")
    .eq("series_id", seriesId);

  if (!firstTry.error) {
    return (firstTry.data ?? []) as EpisodeRow[];
  }

  const secondTry = await supabase
    .from("episodes")
    .select("*")
    .eq("seriesId", seriesId);

  if (!secondTry.error) {
    return (secondTry.data ?? []) as EpisodeRow[];
  }

  return [];
}

async function fetchRecordingsByEpisodeId(episodeId: string): Promise<RecordingRow[]> {
  const firstTry = await supabase
    .from("recordings")
    .select("*")
    .eq("episode_id", episodeId);

  if (!firstTry.error) {
    return ((firstTry.data ?? []) as RecordingRow[]).filter(isPublicRecording);
  }

  const secondTry = await supabase
    .from("recordings")
    .select("*")
    .eq("episodeId", episodeId);

  if (!secondTry.error) {
    return ((secondTry.data ?? []) as RecordingRow[]).filter(isPublicRecording);
  }

  return [];
}

export default async function ReadEpisodePage({ params, searchParams }: PageProps) {
  const { seriesId, episodeNumber } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;

  const parsedEpisodeNumber = parseEpisodeNumber(episodeNumber);
  if (!parsedEpisodeNumber) {
    notFound();
  }

  const initialStartAt = parseStartAt(resolvedSearchParams?.startAt);
  const initialAutoPlay = resolvedSearchParams?.autoplay === "1";

  const { data: seriesData, error: seriesError } = await supabase
    .from("series")
    .select("*")
    .eq("id", seriesId)
    .single();

  if (seriesError || !seriesData) {
    notFound();
  }

  const series = seriesData as SeriesRow;
  if (getSeriesPublicationStatus(series) !== "public") {
    notFound();
  }

  const episode = await fetchEpisodeBySeriesAndNumber(seriesId, parsedEpisodeNumber);
  if (!episode || !isEpisodePubliclyVisible(episode)) {
    notFound();
  }

  const allEpisodes = await fetchEpisodesBySeriesId(seriesId);
  const publicEpisodes = sortEpisodes(
    allEpisodes.filter((item) => isEpisodePubliclyVisible(item))
  );

  const currentEpisodeNumber = getEpisodeNumber(episode) || parsedEpisodeNumber;

  const prevEpisode =
    [...publicEpisodes]
      .reverse()
      .find((item) => getEpisodeNumber(item) < currentEpisodeNumber) ?? null;

  const nextEpisode =
    publicEpisodes.find((item) => getEpisodeNumber(item) > currentEpisodeNumber) ?? null;

  const prevEpisodeNumber = prevEpisode ? getEpisodeNumber(prevEpisode) : null;
  const nextEpisodeNumber = nextEpisode ? getEpisodeNumber(nextEpisode) : null;

  const allEpisodeRecordings = await fetchRecordingsByEpisodeId(episode.id);
  const requestedReaderKey = pickText(
    resolvedSearchParams?.readerKey,
    resolvedSearchParams?.readerName
  );

  let selectedRecording: RecordingRow | null = null;

  if (requestedReaderKey) {
    selectedRecording =
      allEpisodeRecordings.find((recording) => {
        const readerKey = getRecordingReaderKey(recording);
        const readerName = getRecordingReaderName(recording);
        return readerKey === requestedReaderKey || readerName === requestedReaderKey;
      }) ?? null;
  }

  if (!selectedRecording && allEpisodeRecordings.length > 0) {
    selectedRecording = allEpisodeRecordings[0];
  }

  const selectedReaderKey = selectedRecording
    ? getRecordingReaderKey(selectedRecording)
    : pickText(resolvedSearchParams?.readerKey);

  const selectedReaderName = selectedRecording
    ? getRecordingReaderName(selectedRecording)
    : pickText(resolvedSearchParams?.readerName);

  const recordingAvailable = !!selectedRecording;
  const audioStoragePath = pickText(
    selectedRecording?.audio_storage_path,
    selectedRecording?.audioStoragePath
  );

  const generatedSentenceTimings = await fetchGeneratedSentenceTimings(
    audioStoragePath
  );

  const seriesTitle = pickText(series.title) || "無題";
  const commentsVisible = isSeriesEpisodeCommentVisible(series);
  const episodeTitle =
    pickText(episode.title, episode["episode_title"]) || `第${currentEpisodeNumber}話`;

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

  const seriesBgmTitle = pickText(
    series.bgm_title,
    series["bgmTitle"]
  );
  const seriesBgmSrc = pickText(
    series.bgm_audio_path,
    series["bgmAudioPath"]
  );
  const seriesBgmSettings = parseBgmSettingsFromRow(
    series["bgm_settings"],
    series["bgmSettings"]
  );

  const episodeBgmTitle = pickText(episode["bgm_title"], episode["bgmTitle"]);
  const episodeBgmSrc = pickText(
    episode["bgm_audio_path"],
    episode["bgmAudioPath"]
  );
  const episodeBgmSettings = parseBgmSettingsFromRow(
    episode["bgm_settings"],
    episode["bgmSettings"]
  );

  const bgmSrc = pickText(episodeBgmSrc, seriesBgmSrc) || null;
  const bgmTitle =
    pickText(episodeBgmTitle, seriesBgmTitle) || (bgmSrc ? "作品BGM" : "");
  const bgmSettings = mergeBgmSettings(seriesBgmSettings, episodeBgmSettings);

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
      recordingAvailable={recordingAvailable}
      audioStoragePath={audioStoragePath}
      generatedSentenceTimings={generatedSentenceTimings}      
      prevEpisodeHref={prevEpisodeHref}
      prevEpisodeNumber={prevEpisodeNumber}
      nextEpisodeHref={nextEpisodeHref}
      nextEpisodeNumber={nextEpisodeNumber}
      workIndexHref={workIndexHref}
      initialStartAt={initialStartAt}
      initialAutoPlay={initialAutoPlay}
      loginHref={loginHref}
      showComments={commentsVisible}
      bgmTitle={bgmTitle || undefined}
      bgmSrc={bgmSrc}
      bgmSettings={bgmSrc ? bgmSettings : undefined}
      effectSettings={effectSettings}
    />
  );
}