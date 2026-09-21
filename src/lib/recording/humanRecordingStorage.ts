export const DEFAULT_HUMAN_RECORDING_AUDIO_BUCKET = "human-recording-audio";

export function getHumanRecordingAudioBucketName(): string {
  return (
    process.env.SUPABASE_HUMAN_RECORDING_BUCKET?.trim() ||
    DEFAULT_HUMAN_RECORDING_AUDIO_BUCKET
  );
}

export function buildHumanRecordingPlaybackHref(recordingId: string): string {
  return `/api/recordings/human-audio/${encodeURIComponent(recordingId.trim())}`;
}

export function getHumanRecordingStorageObjectPath(
  value: string | null | undefined
): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;

  if (trimmed.startsWith("human/")) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    const marker = "/storage/v1/object/public/";
    const markerIndex = parsed.pathname.indexOf(marker);
    if (markerIndex < 0) return null;

    const afterMarker = parsed.pathname.slice(markerIndex + marker.length);
    const slashIndex = afterMarker.indexOf("/");
    if (slashIndex < 0) return null;

    const objectPath = decodeURIComponent(afterMarker.slice(slashIndex + 1));
    return objectPath.startsWith("human/") ? objectPath : null;
  } catch {
    return /(^|\/)human\//u.test(trimmed) ? trimmed.replace(/^\/+/, "") : null;
  }
}
