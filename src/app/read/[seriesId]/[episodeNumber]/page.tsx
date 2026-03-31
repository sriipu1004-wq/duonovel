import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import EpisodePlayback from "@/features/playback/EpisodePlayback";
import {
  mergeBgmSettings,
  parseBgmSettingsFromRow,
} from "@/lib/bgm/bgmSettings";

type PageProps = {
  params: Promise<{ seriesId: string; episodeNumber: string }>;
  searchParams?: Promise<{
    readerKey?: string;
    readerName?: string;
    startAt?: string;
  }>;
};

type SeriesRow = Record<string, unknown> & {
  id: string;
  title?: string | null;
  bgm_title?: string | null;
  bgm_audio_path?: string | null;
  episode_comments_enabled?: boolean | null;
  episodeCommentsEnabled?: boolean | null;
};

type EpisodeRow = Record<string, unknown> & {
  id: string;
  title?: string | null;
  body?: string | null;
  content?: string | null;
  text?: string | null;
  episode_number?: number | null;
  episodeNumber?: number | null;
  is_published?: boolean | null;
  published?: boolean | null;
  bgm_title?: string | null;
  bgm_audio_path?: string | null;
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

function pickText(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return "";
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

function getEpisodeNumber(episode: EpisodeRow): number {
  const raw = episode.episode_number ?? episode.episodeNumber ?? 0;
  if (typeof raw === "number") return raw;

  const parsed = Number(raw);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function isPublishedEpisode(episode: EpisodeRow): boolean {
  if (episode.is_published === false) return false;
  if (episode.published === false) return false;
  return true;
}

function isPublicRecording(recording: RecordingRow): boolean {
  if (recording.is_public === false) return false;
  if (recording.public === false) return false;
  return true;
}

function isSeriesEpisodeCommentVisible(series: SeriesRow): boolean {
  const raw = series.episode_comments_enabled ?? series.episodeCommentsEnabled;

  if (typeof raw === "boolean") {
    return raw;
  }

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

  const { data: seriesData, error: seriesError } = await supabase
    .from("series")
    .select("*")
    .eq("id", seriesId)
    .single();

  if (seriesError || !seriesData) {
    notFound();
  }

  const episode = await fetchEpisodeBySeriesAndNumber(seriesId, parsedEpisodeNumber);
  if (!episode) {
    notFound();
  }

  const allEpisodes = await fetchEpisodesBySeriesId(seriesId);
  const publishedEpisodes = allEpisodes
    .filter(isPublishedEpisode)
    .sort((a, b) => getEpisodeNumber(a) - getEpisodeNumber(b));

  const currentEpisodeNumber = getEpisodeNumber(episode) || parsedEpisodeNumber;

  const prevEpisode =
    [...publishedEpisodes]
      .reverse()
      .find((item) => getEpisodeNumber(item) < currentEpisodeNumber) ?? null;

  const nextEpisode =
    publishedEpisodes.find(
      (item) => getEpisodeNumber(item) > currentEpisodeNumber
    ) ?? null;

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

  const seriesTitle = pickText((seriesData as SeriesRow).title) || "無題";
  const commentsVisible = isSeriesEpisodeCommentVisible(seriesData as SeriesRow);
  const episodeTitle =
    pickText(episode.title, episode["episode_title"]) || `第${currentEpisodeNumber}話`;

  const body =
    pickText(
      episode.body,
      episode.content,
      episode.text,
      episode["novel_text"],
      episode["body_text"]
    ) || "本文がまだ登録されていません。";

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
    (seriesData as SeriesRow).bgm_title,
    (seriesData as SeriesRow)["bgmTitle"]
  );
  const seriesBgmSrc = pickText(
    (seriesData as SeriesRow).bgm_audio_path,
    (seriesData as SeriesRow)["bgmAudioPath"]
  );
  const seriesBgmSettings = parseBgmSettingsFromRow(
    (seriesData as SeriesRow)["bgm_settings"],
    (seriesData as SeriesRow)["bgmSettings"]
  );

  const episodeBgmTitle = pickText(episode.bgm_title, episode["bgmTitle"]);
  const episodeBgmSrc = pickText(
    episode.bgm_audio_path,
    episode["bgmAudioPath"]
  );
  const episodeBgmSettings = parseBgmSettingsFromRow(
    episode["bgm_settings"],
    episode["bgmSettings"]
  );

  const bgmSrc = pickText(episodeBgmSrc, seriesBgmSrc) || null;
  const bgmTitle =
    pickText(episodeBgmTitle, seriesBgmTitle) || (bgmSrc ? "作品BGM" : "");
  const bgmSettings = mergeBgmSettings(
    seriesBgmSettings,
    episodeBgmSettings
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
      prevEpisodeHref={prevEpisodeHref}
      prevEpisodeNumber={prevEpisodeNumber}
      nextEpisodeHref={nextEpisodeHref}
      nextEpisodeNumber={nextEpisodeNumber}
      workIndexHref={workIndexHref}
      initialStartAt={initialStartAt}
      loginHref={loginHref}
      showComments={commentsVisible}
      bgmTitle={bgmTitle || undefined}
      bgmSrc={bgmSrc}
      bgmSettings={bgmSrc ? bgmSettings : undefined}
    />
  );
}