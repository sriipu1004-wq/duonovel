import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  getSeriesPublicationStatus,
  isEpisodePubliclyVisible,
  sortEpisodes,
  type EpisodeRow,
  type SeriesRow,
} from "@/features/write/writeShared";
import { isR18Series } from "@/lib/contentRating";
import { getCurrentR18ViewerPreference } from "@/lib/contentRatingServer";
import { isPublishedHumanRecording } from "@/lib/recording/humanRecordingState";
import { buildHumanRecordingPlaybackHref } from "@/lib/recording/humanRecordingStorage";

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
  isOwner: boolean;
  r18Blocked: boolean;
  viewerSignedIn: boolean;
  viewerUserId: string | null;
  viewerEmail: string | null;
};

function pickText(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}


const PUBLIC_READ_EPISODE_NAV_SELECT = `
  id,
  series_id,
  episode_number,
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
  audio_storage_path,
  voice_model_id,
  is_public
`;

async function fetchEpisodeNavigation(seriesId: string): Promise<EpisodeRow[]> {
  const admin = createAdminClient();
  const narrow = await admin
    .from("episodes")
    .select(PUBLIC_READ_EPISODE_NAV_SELECT)
    .eq("series_id", seriesId);
  if (!narrow.error) return (narrow.data ?? []) as unknown as EpisodeRow[];

  const fallback = await admin.from("episodes").select("*").eq("series_id", seriesId);
  if (!fallback.error) return (fallback.data ?? []) as EpisodeRow[];
  return [];
}

async function fetchCurrentEpisode(
  seriesId: string,
  episodeNumber: number
): Promise<EpisodeRow | null> {
  const admin = createAdminClient();
  const result = await admin
    .from("episodes")
    .select("*")
    .eq("series_id", seriesId)
    .eq("episode_number", episodeNumber)
    .maybeSingle();
  if (result.error || !result.data) return null;
  return result.data as EpisodeRow;
}

async function fetchPublicRecordings(episodeId: string): Promise<PublicReadRecordingRow[]> {
  if (!episodeId) return [];
  const admin = createAdminClient();
  const narrow = await admin
    .from("recordings")
    .select(PUBLIC_READ_RECORDING_SELECT)
    .eq("episode_id", episodeId)
    .order("created_at", { ascending: false });
  const firstTry = narrow.error
    ? await admin
        .from("recordings")
        .select("*")
        .eq("episode_id", episodeId)
        .order("created_at", { ascending: false })
    : narrow;
  if (!firstTry.error) {
    return ((firstTry.data ?? []) as unknown as PublicReadRecordingRow[])
      .filter(isPublishedHumanRecording)
      .map((recording) => ({
        ...recording,
        audio_storage_path: buildHumanRecordingPlaybackHref(recording.id),
      }));
  }
  return [];
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

  const r18PreferencePromise = isR18Series(series)
    ? getCurrentR18ViewerPreference()
    : Promise.resolve(null);
  const [episode, episodeNavigation, r18Preference] = await Promise.all([
    fetchCurrentEpisode(seriesId, episodeNumber),
    fetchEpisodeNavigation(seriesId),
    r18PreferencePromise,
  ]);

  if (!episode) return null;
  if (!isOwner && !isEpisodePubliclyVisible(episode)) return null;

  const allEpisodes = sortEpisodes(episodeNavigation);
  const visibleEpisodes = isOwner
    ? allEpisodes
    : allEpisodes.filter((item) => isEpisodePubliclyVisible(item));

  const viewerSignedIn = r18Preference?.signedIn ?? Boolean(authData.user);
  const r18Blocked = r18Preference ? !r18Preference.showR18Content : false;

  return {
    series,
    episode,
    publicEpisodes: visibleEpisodes,
    allEpisodeRecordings: r18Blocked
      ? []
      : await fetchPublicRecordings(episode.id),
    isOwner,
    r18Blocked,
    viewerSignedIn,
    viewerUserId: authData.user?.id ?? null,
    viewerEmail: authData.user?.email ?? null,
  };
}
