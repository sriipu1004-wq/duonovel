import { pickText } from "@/features/write/writeShared";
import { isHumanRecordingRow } from "@/lib/recording/humanRecordingState";
import {
  getHumanRecordingAudioBucketName,
  getHumanRecordingStorageObjectPath,
} from "@/lib/recording/humanRecordingStorage";
import { buildNemoTimingObjectPathFromAudioObjectPath } from "@/lib/recording/nemoTiming";
import { canServeHumanRecordingAudio } from "@/lib/recording/privateMediaAccess";
import { streamAuthorizedPrivateRecording } from "@/lib/recording/privateMediaProxy";
import { loadPrivateMediaSourceContext } from "@/lib/recording/privateMediaSourceAccess";
import { privateMediaNotFound } from "@/lib/recording/privateMediaStream";
import {
  isAcceptedRecordingConsentVersion,
  RECORDING_GLOBAL_CONSENT_KEY,
} from "@/lib/recording/recordingConsent";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/uuid";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteProps = {
  params: Promise<{ recordingId: string }>;
};

function resolveRequestedArtifact(rawValue: string): {
  recordingId: string;
  timing: boolean;
} {
  let value = rawValue;
  try {
    value = decodeURIComponent(rawValue);
  } catch {
    return { recordingId: "", timing: false };
  }
  value = value.trim();
  const suffix = ".timing.json";
  if (value.endsWith(suffix)) {
    return {
      recordingId: value.slice(0, -suffix.length),
      timing: true,
    };
  }
  return { recordingId: value, timing: false };
}

/**
 * Human narration playback (audio + timing JSON) through an access-checked
 * byte proxy. No signed URL ever reaches the client. Every request rechecks
 * the recording, the source (same rules as the Reader), the viewer and R18.
 */
export async function GET(request: Request, { params }: RouteProps) {
  const { recordingId: rawRecordingId } = await params;
  const requested = resolveRequestedArtifact(rawRecordingId);

  if (!isUuid(requested.recordingId)) {
    return privateMediaNotFound();
  }

  const admin = createAdminClient();
  const { data: recordingData, error: recordingError } = await admin
    .from("recordings")
    .select("*")
    .eq("id", requested.recordingId)
    .maybeSingle();

  if (recordingError || !recordingData || !isHumanRecordingRow(recordingData)) {
    return privateMediaNotFound();
  }

  const row = recordingData as Record<string, unknown>;
  const seriesId = pickText(row.series_id, row.seriesId);
  const episodeId = pickText(row.episode_id, row.episodeId);
  const readerId = pickText(row.reader_id, row.reader_user_id, row.readerUserId);

  if (!isUuid(seriesId) || !isUuid(episodeId) || !isUuid(readerId)) {
    return privateMediaNotFound();
  }

  // Do not trust a stored Human URL or a narrator UUID alone: the object must
  // be the canonical PRIVATE playback asset of this work, episode and narrator.
  const storedPath = pickText(row.audio_storage_path, row.audioStoragePath);
  const playbackObjectPath = getHumanRecordingStorageObjectPath(storedPath);
  const exactPath = new RegExp(
    "^human/" + seriesId.toLowerCase() + "/" + episodeId.toLowerCase() + "/" +
      readerId.toLowerCase() + "/[a-z0-9-]+/playback-from-[a-z0-9]+[.]m4a$",
    "u"
  );
  if (!playbackObjectPath || !exactPath.test(playbackObjectPath)) {
    return privateMediaNotFound();
  }

  const [context, consentResult] = await Promise.all([
    loadPrivateMediaSourceContext(admin, seriesId, episodeId),
    admin
      .from("user_recording_consents")
      .select("consent_version")
      .eq("user_id", readerId)
      .eq("consent_key", RECORDING_GLOBAL_CONSENT_KEY)
      .maybeSingle(),
  ]);
  if (!context || consentResult.error) {
    return privateMediaNotFound();
  }

  if (
    !canServeHumanRecordingAudio({
      ...context.snapshot,
      recordingPublic: row.is_public === true,
      viewerIsNarrator: context.viewerUserId === readerId,
      currentConsent: isAcceptedRecordingConsentVersion(
        consentResult.data?.consent_version
      ),
    })
  ) {
    return privateMediaNotFound();
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
