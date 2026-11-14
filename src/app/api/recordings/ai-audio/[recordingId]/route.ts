import { pickText } from "@/features/write/writeShared";
import { buildNemoTimingObjectPathFromAudioObjectPath } from "@/lib/recording/nemoTiming";
import {
  isPrivateAiNarrationPathForEpisode,
  parsePrivateAiNarrationReference,
  PRIVATE_AI_NARRATION_BUCKET,
} from "@/lib/recording/privateAiNarrationStorage";
import { canServePrivateAiNarration } from "@/lib/recording/privateMediaAccess";
import { streamAuthorizedPrivateRecording } from "@/lib/recording/privateMediaProxy";
import { loadPrivateMediaSourceContext } from "@/lib/recording/privateMediaSourceAccess";
import {
  isValidSingleByteRange,
  privateMediaNotFound,
} from "@/lib/recording/privateMediaStream";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/uuid";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteProps = {
  params: Promise<{ recordingId: string }>;
};

/**
 * PRIVATE AI narration (bucket ai-narration-private, #167) playback through an
 * access-checked byte proxy, including Range requests. No bearer URL is
 * handed out; every request rechecks the recording, the source with the
 * Reader's rules (publication, episode visibility, owner) and R18.
 */
export async function GET(request: Request, { params }: RouteProps) {
  const { recordingId } = await params;
  if (!isUuid(recordingId)) return privateMediaNotFound();
  if (!isValidSingleByteRange(request.headers.get("range"))) {
    return privateMediaNotFound(416);
  }

  const admin = createAdminClient();
  const { data: recording, error } = await admin
    .from("recordings")
    .select("*")
    .eq("id", recordingId)
    .maybeSingle();
  if (error || !recording) return privateMediaNotFound();

  const row = recording as Record<string, unknown>;
  const seriesId = pickText(row.series_id, row.seriesId);
  const episodeId = pickText(row.episode_id, row.episodeId);
  // Only rows that point into the PRIVATE AI bucket are served here. Public
  // recording-audio URLs and Human rows never match this reference.
  const objectPath = parsePrivateAiNarrationReference(
    row.audio_storage_path ?? row.audioStoragePath
  );
  if (
    !objectPath ||
    !isUuid(seriesId) ||
    !isUuid(episodeId) ||
    !isPrivateAiNarrationPathForEpisode(objectPath, seriesId, episodeId)
  ) {
    return privateMediaNotFound();
  }

  const context = await loadPrivateMediaSourceContext(admin, seriesId, episodeId);
  if (
    !context ||
    !canServePrivateAiNarration({
      ...context.snapshot,
      recordingPublic: row.is_public === true,
    })
  ) {
    return privateMediaNotFound();
  }

  const mediaPath =
    new URL(request.url).searchParams.get("timing") === "1"
      ? buildNemoTimingObjectPathFromAudioObjectPath(objectPath)
      : objectPath;
  return streamAuthorizedPrivateRecording(
    request,
    PRIVATE_AI_NARRATION_BUCKET,
    mediaPath
  );
}
