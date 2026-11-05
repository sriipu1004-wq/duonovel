// Originals, playback, timing JSON and staged Human parts must not be
// redirected to PUBLIC or unapproved Storage buckets by configuration drift.
export const DEFAULT_HUMAN_RECORDING_AUDIO_BUCKET = "human-recording-audio";

export function getHumanRecordingAudioBucketName(): string {
  const configured = process.env.SUPABASE_HUMAN_RECORDING_BUCKET?.trim();
  if (configured && configured !== DEFAULT_HUMAN_RECORDING_AUDIO_BUCKET) {
    throw new Error("human_private_bucket_name_unapproved");
  }
  return DEFAULT_HUMAN_RECORDING_AUDIO_BUCKET;
}

type PrivateHumanBucketInspector = {
  storage: {
    getBucket: (id: string) => Promise<{
      data: { id: string; name: string; public: boolean } | null;
      error: unknown;
    }>;
  };
};

// Use a trusted server-side client before issuing signed upload URLs or
// uploading media bytes. Do not cache provider bucket visibility across calls.
export async function assertApprovedPrivateHumanRecordingBucket(
  client: PrivateHumanBucketInspector
): Promise<string> {
  const bucketName = getHumanRecordingAudioBucketName();
  const { data, error } = await client.storage.getBucket(bucketName);
  if (error || !data || data.id !== bucketName ||
      data.name !== bucketName || data.public !== false) {
    throw new Error("human_private_bucket_not_verified");
  }
  return bucketName;
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
