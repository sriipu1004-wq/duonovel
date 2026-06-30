import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  getEpisodeNumber,
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

function pickText(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function isPublicRecording(recording: PublicReadRecordingRow): boolean {
  return recording.is_public !== false && recording.public !== false;
}

async function fetchEpisodes(seriesId: string): Promise<EpisodeRow[]> {
  const admin = createAdminClient();
  const firstTry = await admin.from("episodes").select("*").eq("series_id", seriesId);
  if (!firstTry.error) return (firstTry.data ?? []) as EpisodeRow[];
  const secondTry = await admin.from("episodes").select("*").eq("seriesId", seriesId);
  return secondTry.error ? [] : (secondTry.data ?? []) as EpisodeRow[];
}

async function fetchPublicRecordings(episodeId: string): Promise<PublicReadRecordingRow[]> {
  if (!episodeId) return [];
  const admin = createAdminClient();
  const firstTry = await admin.from("recordings").select("*").eq("episode_id", episodeId).order("created_at", { ascending: false });
  if (!firstTry.error) return ((firstTry.data ?? []) as PublicReadRecordingRow[]).filter(isPublicRecording);
  const secondTry = await admin.from("recordings").select("*").eq("episodeId", episodeId).order("created_at", { ascending: false });
  return secondTry.error ? [] : ((secondTry.data ?? []) as PublicReadRecordingRow[]).filter(isPublicRecording);
}

export async function getCachedPublicReadPagePayload(
  seriesId: string,
  episodeNumber: number
): Promise<PublicReadPagePayload | null> {
  const [sessionClient, admin] = await Promise.all([createClient(), Promise.resolve(createAdminClient())]);
  const [{ data: authData }, seriesResult] = await Promise.all([
    sessionClient.auth.getUser(),
    admin.from("series").select("*").eq("id", seriesId).maybeSingle(),
  ]);

  if (seriesResult.error || !seriesResult.data) return null;

  const series = seriesResult.data as SeriesRow;
  const currentUserId = authData.user?.id ?? "";
  const ownerId = pickText(series.author_id, series["user_id"], series["userId"]);
  const isOwner = currentUserId.length > 0 && ownerId === currentUserId;
  const isPublicSeries = getSeriesPublicationStatus(series) === "public";

  if (!isPublicSeries && !isOwner) return null;

  const allEpisodes = sortEpisodes(await fetchEpisodes(seriesId));
  const episode = allEpisodes.find((item) => getEpisodeNumber(item) === episodeNumber) ?? null;
  if (!episode) return null;
  if (!isOwner && !isEpisodePubliclyVisible(episode)) return null;

  const visibleEpisodes = isOwner
    ? allEpisodes
    : allEpisodes.filter((item) => isEpisodePubliclyVisible(item));

  return {
    series,
    episode,
    publicEpisodes: visibleEpisodes,
    allEpisodeRecordings: await fetchPublicRecordings(episode.id),
  };
}
