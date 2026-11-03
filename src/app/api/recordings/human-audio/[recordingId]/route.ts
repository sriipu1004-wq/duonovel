import { NextResponse } from "next/server";
import {
  getSeriesPublicationStatus,
  isEpisodePubliclyVisible,
  pickText,
  type EpisodeRow,
  type SeriesRow,
} from "@/features/write/writeShared";
import { isR18Series } from "@/lib/contentRating";
import { getCurrentR18ViewerPreference } from "@/lib/contentRatingServer";
import { isAcceptedRecordingConsentVersion, RECORDING_GLOBAL_CONSENT_KEY } from "@/lib/recording/recordingConsent";
import { canServeHumanRecordingAudio, isHumanRecordingRow } from "@/lib/recording/humanRecordingState";
import {
  getHumanRecordingAudioBucketName,
  getHumanRecordingStorageObjectPath,
} from "@/lib/recording/humanRecordingStorage";
import { buildNemoTimingObjectPathFromAudioObjectPath } from "@/lib/recording/nemoTiming";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/uuid";
import { streamAuthorizedPrivateRecording } from "@/lib/recording/privateMediaProxy";

export const runtime = "nodejs";

type RouteProps = {
  params: Promise<{ recordingId: string }>;
};

function resolveRequestedArtifact(rawValue: string): {
  recordingId: string;
  timing: boolean;
} {
  const value = decodeURIComponent(rawValue).trim();
  const suffix = ".timing.json";
  if (value.endsWith(suffix)) {
    return {
      recordingId: value.slice(0, -suffix.length),
      timing: true,
    };
  }
  return { recordingId: value, timing: false };
}

export async function GET(request: Request, { params }: RouteProps) {
  const { recordingId: rawRecordingId } = await params;
  const requested = resolveRequestedArtifact(rawRecordingId);

  if (!isUuid(requested.recordingId)) {
    return new NextResponse(null, { status: 404 });
  }
  const admin = createAdminClient();
  const { data: recordingData, error: recordingError } = await admin
    .from("recordings")
    .select("*")
    .eq("id", requested.recordingId)
    .maybeSingle();

  if (recordingError || !recordingData || !isHumanRecordingRow(recordingData)) {
    return new NextResponse(null, { status: 404 });
  }

  const row = recordingData as Record<string, unknown>;
  const seriesId = pickText(row.series_id, row.seriesId);
  const episodeId = pickText(row.episode_id, row.episodeId);
  const readerId = pickText(row.reader_id, row.reader_user_id, row.readerUserId);
  const isPublic = row.is_public === true;

  if (!seriesId || !episodeId || !readerId) {
    return new NextResponse(null, { status: 404 });
  }

  // PUBLIC source visibility uses the trusted server read. PRIVATE source
  // visibility uses the narrator's current RLS-scoped session, including
  // legitimately owned draft episodes. A narrator ID alone is insufficient.
  let narratorIsViewer = false;
  const db = isPublic ? admin : await createClient();
  if (!isPublic) {
    const { data: { user }, error: authError } = await db.auth.getUser();
    if (authError || !user || user.id !== readerId) {
      return new NextResponse(null, { status: 404 });
    }
    narratorIsViewer = true;
  }

  const [seriesResult, episodeResult, consentResult] = await Promise.all([
    db.from("series")
      .select("id, publication_status, content_rating, content_warnings, recording_permission_mode")
      .eq("id", seriesId).maybeSingle(),
    db.from("episodes")
      .select("id, series_id, posting_status, is_published")
      .eq("id", episodeId).maybeSingle(),
    db.from("user_recording_consents")
      .select("consent_version")
      .eq("user_id", readerId)
      .eq("consent_key", RECORDING_GLOBAL_CONSENT_KEY).maybeSingle(),
  ]);
  if (seriesResult.error || episodeResult.error || consentResult.error ||
      !seriesResult.data || !episodeResult.data) {
    return new NextResponse(null, { status: 404 });
  }

  const series = seriesResult.data as SeriesRow;
  const episode = episodeResult.data as EpisodeRow;
  const sourceVisible =
    pickText(series.id) === seriesId &&
    pickText(episode.series_id, episode["seriesId"]) === seriesId;
  const sourcePublic =
    getSeriesPublicationStatus(series) === "public" &&
    isEpisodePubliclyVisible(episode);
  const r18 = isR18Series(series);
  const r18Preference = r18
    ? await getCurrentR18ViewerPreference()
    : null;
  if (!canServeHumanRecordingAudio({
    isPublic,
    narratorIsViewer,
    sourceVisible,
    sourcePublic,
    currentPermissionOpen: series.recording_permission_mode === "open",
    currentConsent: isAcceptedRecordingConsentVersion(consentResult.data?.consent_version),
    isR18: r18,
    currentR18Permission: r18Preference?.showR18Content === true &&
      (isPublic || r18Preference.userId === readerId),
  })) {
    return new NextResponse(null, { status: 404 });
  }

  const storedPath = pickText(row.audio_storage_path, row.audioStoragePath);
  const playbackObjectPath = getHumanRecordingStorageObjectPath(storedPath);
  if (!playbackObjectPath) {
    return new NextResponse(null, { status: 404 });
  }

  const objectPath = requested.timing
    ? buildNemoTimingObjectPathFromAudioObjectPath(playbackObjectPath)
    : playbackObjectPath;

  return streamAuthorizedPrivateRecording(
    request,
    getHumanRecordingAudioBucketName(),
    objectPath
  );
}
