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
import { isHumanRecordingRow } from "@/lib/recording/humanRecordingState";
import {
  getHumanRecordingAudioBucketName,
  getHumanRecordingStorageObjectPath,
} from "@/lib/recording/humanRecordingStorage";
import { buildNemoTimingObjectPathFromAudioObjectPath } from "@/lib/recording/nemoTiming";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/uuid";

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

export async function GET(_request: Request, { params }: RouteProps) {
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

  if (isPublic) {
    const [seriesResult, episodeResult] = await Promise.all([
      admin.from("series").select("*").eq("id", seriesId).maybeSingle(),
      admin.from("episodes").select("*").eq("id", episodeId).maybeSingle(),
    ]);

    if (
      seriesResult.error ||
      episodeResult.error ||
      !seriesResult.data ||
      !episodeResult.data
    ) {
      return new NextResponse(null, { status: 404 });
    }

    const series = seriesResult.data as SeriesRow;
    const episode = episodeResult.data as EpisodeRow;
    if (
      getSeriesPublicationStatus(series) !== "public" ||
      pickText(episode.series_id, episode["seriesId"]) !== seriesId ||
      !isEpisodePubliclyVisible(episode)
    ) {
      return new NextResponse(null, { status: 404 });
    }

    if (isR18Series(series)) {
      const preference = await getCurrentR18ViewerPreference();
      if (!preference.showR18Content) {
        return new NextResponse(null, { status: 404 });
      }
    }
  } else {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user || user.id !== readerId) {
      return new NextResponse(null, { status: 404 });
    }
  }

  const storedPath = pickText(row.audio_storage_path, row.audioStoragePath);
  const playbackObjectPath = getHumanRecordingStorageObjectPath(storedPath);
  if (!playbackObjectPath) {
    return new NextResponse(null, { status: 404 });
  }

  const objectPath = requested.timing
    ? buildNemoTimingObjectPathFromAudioObjectPath(playbackObjectPath)
    : playbackObjectPath;

  const { data: signedData, error: signedError } = await admin.storage
    .from(getHumanRecordingAudioBucketName())
    .createSignedUrl(objectPath, 60);

  if (signedError || !signedData?.signedUrl) {
    return new NextResponse(null, { status: 404 });
  }

  const response = NextResponse.redirect(signedData.signedUrl, 307);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
