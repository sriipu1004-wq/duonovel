import { unstable_cache } from "next/cache";
import { createPublicServerClient } from "@/lib/supabase/serverPublic";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getSeriesPublicationStatus,
  isEpisodePubliclyVisible,
  sortEpisodes,
  type EpisodeRow,
  type SeriesRow,
} from "@/features/write/writeShared";

export type PublicReadRecordingRow = Record<string, unknown> & {
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
  voice_model_id?: string | null;
  voiceModelId?: string | null;
  is_public?: boolean | null;
  public?: boolean | null;
};

export type PublicReadPagePayload = {
  series: SeriesRow;
  episode: EpisodeRow;
  publicEpisodes: EpisodeRow[];
  allEpisodeRecordings: PublicReadRecordingRow[];
};

const PUBLIC_READ_SERIES_SELECT = `
  id,
  title,
  recording_permission_mode,
  bgm_title,
  bgm_audio_path,
  bgm_settings,
  effect_settings,
  episode_comments_enabled,
  publication_status
`;

const PUBLIC_READ_EPISODE_SELECT = `
  id,
  title,
  episode_number,
  body,
  content,
  text,
  novel_text,
  body_text,
  series_id,
  bgm_title,
  bgm_audio_path,
  bgm_settings,
  effect_settings,
  posting_status,
  scheduled_for,
  posted_at
`;

const PUBLIC_READ_RECORDING_SELECT = `
  id,
  episode_id,
  reader_id,
  reader_user_id,
  reader_name,
  narrator_name,
  display_name,
  speaker_name,
  audio_storage_path,
  voice_model_id,
  is_public,
  created_at
`;

function isPublicRecording(recording: PublicReadRecordingRow): boolean {
  if (recording.is_public === false) return false;
  if (recording.public === false) return false;
  return true;
}

async function fetchEpisodeBySeriesAndNumber(
  seriesId: string,
  episodeNumber: number
): Promise<EpisodeRow | null> {
  const supabase = createPublicServerClient();

  const narrowTries = [
    () =>
      supabase
        .from("episodes")
        .select(PUBLIC_READ_EPISODE_SELECT)
        .eq("series_id", seriesId)
        .eq("episode_number", episodeNumber)
        .maybeSingle(),
    () =>
      supabase
        .from("episodes")
        .select(PUBLIC_READ_EPISODE_SELECT)
        .eq("series_id", seriesId)
        .eq("episodeNumber", episodeNumber)
        .maybeSingle(),
    () =>
      supabase
        .from("episodes")
        .select(PUBLIC_READ_EPISODE_SELECT)
        .eq("seriesId", seriesId)
        .eq("episode_number", episodeNumber)
        .maybeSingle(),
    () =>
      supabase
        .from("episodes")
        .select(PUBLIC_READ_EPISODE_SELECT)
        .eq("seriesId", seriesId)
        .eq("episodeNumber", episodeNumber)
        .maybeSingle(),
  ];

  for (const run of narrowTries) {
    const result = await run();
    if (!result.error && result.data) {
      return result.data as EpisodeRow;
    }
  }

  const fallbackTries = [
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

  for (const run of fallbackTries) {
    const result = await run();
    if (!result.error && result.data) {
      return result.data as EpisodeRow;
    }
  }

  return null;
}

async function fetchEpisodesBySeriesId(seriesId: string): Promise<EpisodeRow[]> {
  const supabase = createPublicServerClient();

  const firstTry = await supabase
    .from("episodes")
    .select(PUBLIC_READ_EPISODE_SELECT)
    .eq("series_id", seriesId);

  if (!firstTry.error) {
    return (firstTry.data ?? []) as EpisodeRow[];
  }

  const secondTry = await supabase
    .from("episodes")
    .select(PUBLIC_READ_EPISODE_SELECT)
    .eq("seriesId", seriesId);

  if (!secondTry.error) {
    return (secondTry.data ?? []) as EpisodeRow[];
  }

  const fallbackFirstTry = await supabase
    .from("episodes")
    .select("*")
    .eq("series_id", seriesId);

  if (!fallbackFirstTry.error) {
    return (fallbackFirstTry.data ?? []) as EpisodeRow[];
  }

  const fallbackSecondTry = await supabase
    .from("episodes")
    .select("*")
    .eq("seriesId", seriesId);

  if (!fallbackSecondTry.error) {
    return (fallbackSecondTry.data ?? []) as EpisodeRow[];
  }

  return [];
}

async function fetchRecordingsByEpisodeId(
  episodeId: string
): Promise<PublicReadRecordingRow[]> {
  if (!episodeId) {
    return [];
  }

  const adminSupabase = createAdminClient();

  const firstTry = await adminSupabase
    .from("recordings")
    .select(PUBLIC_READ_RECORDING_SELECT)
    .eq("episode_id", episodeId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  if (!firstTry.error) {
    return ((firstTry.data ?? []) as PublicReadRecordingRow[]).filter(
      isPublicRecording
    );
  }

  const secondTry = await adminSupabase
    .from("recordings")
    .select(PUBLIC_READ_RECORDING_SELECT)
    .eq("episodeId", episodeId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  if (!secondTry.error) {
    return ((secondTry.data ?? []) as PublicReadRecordingRow[]).filter(
      isPublicRecording
    );
  }

  const fallbackFirstTry = await adminSupabase
    .from("recordings")
    .select("*")
    .eq("episode_id", episodeId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  if (!fallbackFirstTry.error) {
    return ((fallbackFirstTry.data ?? []) as PublicReadRecordingRow[]).filter(
      isPublicRecording
    );
  }

  const fallbackSecondTry = await adminSupabase
    .from("recordings")
    .select("*")
    .eq("episodeId", episodeId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  if (!fallbackSecondTry.error) {
    return ((fallbackSecondTry.data ?? []) as PublicReadRecordingRow[]).filter(
      isPublicRecording
    );
  }

  return [];
}

async function buildPublicReadPagePayload(
  seriesId: string,
  episodeNumber: number
): Promise<PublicReadPagePayload | null> {
  const supabase = createPublicServerClient();

  let seriesData: SeriesRow | null = null;

  const seriesNarrow = await supabase
    .from("series")
    .select(PUBLIC_READ_SERIES_SELECT)
    .eq("id", seriesId)
    .maybeSingle();

  if (!seriesNarrow.error && seriesNarrow.data) {
    seriesData = seriesNarrow.data as SeriesRow;
  } else {
    const seriesFallback = await supabase
      .from("series")
      .select("*")
      .eq("id", seriesId)
      .maybeSingle();

    if (seriesFallback.error || !seriesFallback.data) {
      return null;
    }

    seriesData = seriesFallback.data as SeriesRow;
  }

  const series = seriesData as SeriesRow;  

  if (getSeriesPublicationStatus(series) !== "public") {
    return null;
  }

  const episode = await fetchEpisodeBySeriesAndNumber(seriesId, episodeNumber);

  if (!episode || !isEpisodePubliclyVisible(episode)) {
    return null;
  }

  const allEpisodes = await fetchEpisodesBySeriesId(seriesId);
  const publicEpisodes = sortEpisodes(
    allEpisodes.filter((item) => isEpisodePubliclyVisible(item))
  );

  const allEpisodeRecordings = await fetchRecordingsByEpisodeId(episode.id);

  return {
    series,
    episode,
    publicEpisodes,
    allEpisodeRecordings,
  };
}

const getCachedPublicReadPagePayloadInternal = unstable_cache(
  buildPublicReadPagePayload,
  ["public-read-page-payload"],
  {
    revalidate: 60,
  }
);

export async function getCachedPublicReadPagePayload(
  seriesId: string,
  episodeNumber: number
): Promise<PublicReadPagePayload | null> {
  return getCachedPublicReadPagePayloadInternal(seriesId, episodeNumber);
}