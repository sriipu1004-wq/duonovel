export const HUMAN_MULTIPART_MIN_TRIGGER_BYTES = 4 * 1024 * 1024;
export const HUMAN_MULTIPART_PART_SIZE_BYTES = 8 * 1024 * 1024;
export const HUMAN_MULTIPART_MAX_TOTAL_BYTES = 1024 * 1024 * 1024;

export type HumanMultipartPartDescriptor = {
  index: number;
  objectPath: string;
  byteOffsetStart: number;
  byteOffsetEndExclusive: number;
  expectedSizeBytes: number;
};

export type HumanMultipartUploadSession = {
  uploadSessionId: string;
  bucketName: string;
  tempPrefix: string;
  sourceExtension: string;
  totalSizeBytes: number;
  partSizeBytes: number;
  parts: HumanMultipartPartDescriptor[];
};

function sanitizeStorageSegment(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);

  return normalized || "recording";
}

export function getRecordingAudioBucketName(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_RECORDING_BUCKET?.trim() || "recording-audio";
}

export function getHumanMultipartTempPrefix(args: {
  seriesId: string;
  episodeId: string;
  userId: string;
  uploadSessionId: string;
}): string {
  return [
    "human-temp",
    sanitizeStorageSegment(args.seriesId),
    sanitizeStorageSegment(args.episodeId),
    sanitizeStorageSegment(args.userId),
    sanitizeStorageSegment(args.uploadSessionId),
  ].join("/");
}

export function buildHumanMultipartUploadSession(args: {
  seriesId: string;
  episodeId: string;
  userId: string;
  sourceExtension: string;
  totalSizeBytes: number;
  uploadSessionId?: string;
}): HumanMultipartUploadSession {
  const totalSizeBytes = Math.max(0, Math.trunc(args.totalSizeBytes));
  const uploadSessionId = args.uploadSessionId?.trim() || crypto.randomUUID();
  const sourceExtension = args.sourceExtension.trim().toLowerCase() || "bin";
  const bucketName = getRecordingAudioBucketName();
  const tempPrefix = getHumanMultipartTempPrefix({
    seriesId: args.seriesId,
    episodeId: args.episodeId,
    userId: args.userId,
    uploadSessionId,
  });

  const parts: HumanMultipartPartDescriptor[] = [];

  for (
    let byteOffsetStart = 0, index = 0;
    byteOffsetStart < totalSizeBytes;
    byteOffsetStart += HUMAN_MULTIPART_PART_SIZE_BYTES, index += 1
  ) {
    const byteOffsetEndExclusive = Math.min(
      totalSizeBytes,
      byteOffsetStart + HUMAN_MULTIPART_PART_SIZE_BYTES
    );

    const expectedSizeBytes = byteOffsetEndExclusive - byteOffsetStart;

    parts.push({
      index,
      objectPath: `${tempPrefix}/part-${String(index + 1).padStart(4, "0")}.${sourceExtension}`,
      byteOffsetStart,
      byteOffsetEndExclusive,
      expectedSizeBytes,
    });
  }

  return {
    uploadSessionId,
    bucketName,
    tempPrefix,
    sourceExtension,
    totalSizeBytes,
    partSizeBytes: HUMAN_MULTIPART_PART_SIZE_BYTES,
    parts,
  };
}