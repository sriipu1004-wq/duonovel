import {
  getEpisodeBody,
  type EpisodeRow,
} from "@/features/write/writeShared";
import {
  decideRecordingEntryAccess,
  normalizeRecordingPermissionMode,
} from "@/lib/recording/recordingEntry";
import { getAudioFileExtension } from "@/lib/recording/audioUploadPolicy";
import {
  normalizeAudioForPlayback,
  PLAYBACK_AUDIO_CONTENT_TYPE,
  PLAYBACK_AUDIO_EXTENSION,
} from "@/lib/recording/audioPlaybackNormalization";
import { alignHumanRecordingToBodyOrThrow } from "@/lib/recording/humanRecordingAlignment";
import { transcribeHumanPlaybackAudio } from "@/lib/recording/humanRecordingTranscription";
import { buildNemoTimingObjectPathFromAudioObjectPath } from "@/lib/recording/nemoTiming";
import { createAdminClient } from "@/lib/supabase/admin";

type AdminSupabase = ReturnType<typeof createAdminClient>;
type RawRow = Record<string, unknown>;

export type PublishHumanRecordingInput = {
  userId: string;
  seriesId: string;
  episodeId: string;
  episodeNumber?: number | null;
  readerName: string;
  isPublic?: boolean;
  sourceFile: File;
};

export type PublishHumanRecordingResult = {
  recordingId: string;
  audioStoragePath: string;
  originalStorageObjectPath: string;
  playbackStorageObjectPath: string;
  readerName: string;
};

type RecordingWriteInput = {
  seriesId: string;
  episodeId: string;
  readerId: string;
  readerName: string;
  audioStoragePath: string;
  isPublic: boolean;
};

type ExistingRecording = {
  id: string;
  audioStoragePath: string;
  readerId: string;
  readerName: string;
};

function pickText(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return "";
}

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

function getRecordingAudioBucketName(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_RECORDING_BUCKET?.trim() || "recording-audio";
}

function guessExtension(file: File): string {
  const byName = getAudioFileExtension(file.name);
  if (byName) return byName;

  const lowerMimeType = (file.type || "").toLowerCase();

  if (lowerMimeType.includes("mpeg") || lowerMimeType.includes("mp3")) {
    return "mp3";
  }

  if (
    lowerMimeType.includes("mp4") ||
    lowerMimeType.includes("m4a") ||
    lowerMimeType.includes("x-m4a")
  ) {
    return "m4a";
  }

  if (lowerMimeType.includes("wav")) {
    return "wav";
  }

  if (lowerMimeType.includes("webm")) {
    return "webm";
  }

  if (lowerMimeType.includes("ogg")) {
    return "ogg";
  }

  if (lowerMimeType.includes("aac")) {
    return "aac";
  }

  if (lowerMimeType.includes("flac")) {
    return "flac";
  }

  return "bin";
}

function getAudioContentType(extension: string): string {
  const normalized = extension.trim().toLowerCase();

  if (normalized === "mp3") return "audio/mpeg";
  if (normalized === "m4a") return "audio/mp4";
  if (normalized === "wav") return "audio/wav";
  if (normalized === "webm") return "audio/webm";
  if (normalized === "ogg") return "audio/ogg";
  if (normalized === "aac") return "audio/aac";
  if (normalized === "flac") return "audio/flac";

  return "application/octet-stream";
}

function buildHumanRecordingObjectPaths({
  seriesId,
  episodeId,
  userId,
  sourceExtension,
}: {
  seriesId: string;
  episodeId: string;
  userId: string;
  sourceExtension: string;
}): {
  originalObjectPath: string;
  playbackObjectPath: string;
} {
  const unique = `${Date.now()}-${crypto.randomUUID()}`;
  const baseDirectory = [
    "human",
    sanitizeStorageSegment(seriesId),
    sanitizeStorageSegment(episodeId),
    sanitizeStorageSegment(userId),
    unique,
  ].join("/");

  return {
    originalObjectPath: `${baseDirectory}/original.${sourceExtension}`,
    playbackObjectPath: `${baseDirectory}/playback-from-${sourceExtension}.${PLAYBACK_AUDIO_EXTENSION}`,
  };
}

function extractBucketObjectPathFromPublicUrl(
  publicUrl: string,
  bucketName: string
): string | null {
  const marker = `/storage/v1/object/public/${bucketName}/`;
  const markerIndex = publicUrl.indexOf(marker);

  if (markerIndex === -1) {
    return null;
  }

  const objectPath = publicUrl.slice(markerIndex + marker.length).trim();
  return objectPath.length > 0 ? decodeURIComponent(objectPath) : null;
}

function buildRecordingArtifactObjectPathsFromPublicUrl(
  publicUrl: string,
  bucketName: string
): string[] {
  const objectPath = extractBucketObjectPathFromPublicUrl(publicUrl, bucketName);

  if (!objectPath) {
    return [];
  }

  const results = [objectPath];

  const normalizedPlaybackMatch = objectPath.match(
    /^(.*\/)playback-from-([a-z0-9]+)\.m4a$/i
  );
  if (normalizedPlaybackMatch) {
    results.push(`${normalizedPlaybackMatch[1]}original.${normalizedPlaybackMatch[2]}`);
    results.push(buildNemoTimingObjectPathFromAudioObjectPath(objectPath));
  }

  const legacyPlaybackMatch = objectPath.match(/^(.*\/)playback\.([a-z0-9]+)$/i);
  if (legacyPlaybackMatch) {
    results.push(`${legacyPlaybackMatch[1]}original.${legacyPlaybackMatch[2]}`);
    results.push(buildNemoTimingObjectPathFromAudioObjectPath(objectPath));
  }

  if (objectPath.startsWith("nemo/") || objectPath.includes("/nemo/")) {
    results.push(buildNemoTimingObjectPathFromAudioObjectPath(objectPath));
  }

  return [...new Set(results)];
}

async function removeStorageObjectPaths(
  adminSupabase: AdminSupabase,
  bucketName: string,
  objectPaths: string[]
): Promise<void> {
  const filtered = [...new Set(objectPaths.filter((value) => value.trim().length > 0))];

  if (filtered.length === 0) {
    return;
  }

  await adminSupabase.storage.from(bucketName).remove(filtered);
}


async function loadPublishAccess(
  adminSupabase: AdminSupabase,
  seriesId: string,
  userId: string
): Promise<void> {
  const { data, error } = await adminSupabase
    .from("series")
    .select("id, recording_permission_mode")
    .eq("id", seriesId)
    .maybeSingle();

  if (error || !data) {
    throw new Error("series_not_found");
  }

  const row = data as RawRow;
  const permissionMode = normalizeRecordingPermissionMode(
    row.recording_permission_mode
  );
  const decision = decideRecordingEntryAccess({
    permissionMode,
    isLoggedIn: true,
  });

  if (!decision.canEnter) {
    throw new Error(`entry_denied:${decision.deniedReason}`);
  }
}

async function resolveCanonicalEpisodeIdForSeries(
  adminSupabase: AdminSupabase,
  seriesId: string,
  requestedEpisodeId: string,
  episodeNumber?: number | null
): Promise<string | null> {
  if (requestedEpisodeId) {
    const byId = await adminSupabase
      .from("episodes")
      .select("id, series_id, seriesId")
      .eq("id", requestedEpisodeId)
      .maybeSingle();

    if (!byId.error && byId.data) {
      const row = byId.data as RawRow;
      const resolvedSeriesId = pickText(row.series_id, row.seriesId);

      if (resolvedSeriesId === seriesId) {
        return String(row.id);
      }
    }
  }

  if (episodeNumber && Number.isInteger(episodeNumber) && episodeNumber > 0) {
    const lookupPatterns: Array<{
      seriesKey: "series_id" | "seriesId";
      numberKey: "episode_number" | "episodeNumber";
    }> = [
      { seriesKey: "series_id", numberKey: "episode_number" },
      { seriesKey: "series_id", numberKey: "episodeNumber" },
      { seriesKey: "seriesId", numberKey: "episode_number" },
      { seriesKey: "seriesId", numberKey: "episodeNumber" },
    ];

    for (const pattern of lookupPatterns) {
      const result = await adminSupabase
        .from("episodes")
        .select("id")
        .eq(pattern.seriesKey, seriesId)
        .eq(pattern.numberKey, episodeNumber)
        .maybeSingle();

      if (!result.error && result.data) {
        const row = result.data as RawRow;
        return String(row.id);
      }
    }
  }

  return null;
}

async function fetchEpisodeBodyForAlignment(
  adminSupabase: AdminSupabase,
  episodeId: string
): Promise<string> {
  const { data, error } = await adminSupabase
    .from("episodes")
    .select("*")
    .eq("id", episodeId)
    .maybeSingle();

  if (error || !data) {
    throw new Error("episode_not_found");
  }

  const body = getEpisodeBody(data as EpisodeRow);

  if (!body.trim()) {
    throw new Error("episode_body_empty");
  }

  return body;
}

function buildReaderUserInsertAttempts(
  userId: string,
  readerName: string
): RawRow[] {
  const safeReaderName = readerName.trim() || "ユーザー朗読";
  const fallbackUsername = `reader-${userId.replace(/-/g, "").slice(0, 12)}`;

  return [
    {
      id: userId,
      display_name: safeReaderName,
      username: fallbackUsername,
    },
    {
      id: userId,
      name: safeReaderName,
      username: fallbackUsername,
    },
    {
      id: userId,
      pen_name: safeReaderName,
      username: fallbackUsername,
    },
    {
      id: userId,
      display_name: safeReaderName,
    },
    {
      id: userId,
      name: safeReaderName,
    },
    {
      id: userId,
      pen_name: safeReaderName,
    },
    {
      id: userId,
    },
  ];
}

async function ensureReaderUserRow(
  adminSupabase: AdminSupabase,
  userId: string,
  readerName: string
): Promise<void> {
  const existing = await adminSupabase
    .from("users")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (!existing.error && existing.data) {
    return;
  }

  const attempts = buildReaderUserInsertAttempts(userId, readerName);
  const errors: string[] = [];

  for (const payload of attempts) {
    const { error } = await adminSupabase
      .from("users")
      .upsert(payload, { onConflict: "id" });

    if (!error) {
      return;
    }

    const payloadKeys = Object.keys(payload).join(", ");
    errors.push(`${payloadKeys} => ${error.message}`);
  }

  throw new Error(`reader_user_upsert_failed:${errors.join(" | ")}`);
}

function mapRecordingRows(rows: RawRow[]): ExistingRecording[] {
  return rows.map((row) => ({
    id: String(row.id),
    audioStoragePath: pickText(row.audio_storage_path, row.audioStoragePath),
    readerId: pickText(row.reader_id, row.reader_user_id, row.readerUserId),
    readerName:
      pickText(
        row.reader_name,
        row.narrator_name,
        row.display_name,
        row.speaker_name
      ) || "朗読者未設定",
  }));
}

async function findExistingRecordings(
  adminSupabase: AdminSupabase,
  episodeId: string
): Promise<ExistingRecording[]> {
  const firstTry = await adminSupabase
    .from("recordings")
    .select("*")
    .eq("episode_id", episodeId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  if (!firstTry.error) {
    return mapRecordingRows((firstTry.data ?? []) as RawRow[]);
  }

  const secondTry = await adminSupabase
    .from("recordings")
    .select("*")
    .eq("episodeId", episodeId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  if (!secondTry.error) {
    return mapRecordingRows((secondTry.data ?? []) as RawRow[]);
  }

  throw new Error(
    `recording_lookup_failed:${
      secondTry.error?.message || firstTry.error.message
    }`
  );
}

async function deleteDuplicateRecordings(
  adminSupabase: AdminSupabase,
  duplicateIds: string[]
): Promise<void> {
  if (duplicateIds.length === 0) {
    return;
  }

  const { error } = await adminSupabase
    .from("recordings")
    .delete()
    .in("id", duplicateIds);

  if (error) {
    throw new Error(`recording_duplicate_cleanup_failed:${error.message}`);
  }
}

async function writeRecording(
  adminSupabase: AdminSupabase,
  input: RecordingWriteInput
): Promise<{
  recordingId: string;
  previousAudioStoragePath: string | null;
  duplicateAudioStoragePaths: string[];
}> {
  const allEpisodeRows = await findExistingRecordings(
    adminSupabase,
    input.episodeId
  );

  const sameReaderIdRows = allEpisodeRows.filter(
    (row) => row.readerId === input.readerId
  );

  const sameReaderNameRows =
    sameReaderIdRows.length > 0
      ? []
      : allEpisodeRows.filter((row) => row.readerName === input.readerName);

  const existingRows =
    sameReaderIdRows.length > 0 ? sameReaderIdRows : sameReaderNameRows;

  const primary = existingRows[0] ?? null;
  const duplicates = existingRows.slice(1);

  const payload = {
    series_id: input.seriesId,
    episode_id: input.episodeId,
    reader_id: input.readerId,
    reader_name: input.readerName,
    audio_storage_path: input.audioStoragePath,
    is_public: input.isPublic,
  };

  if (primary) {
    const { data, error } = await adminSupabase
      .from("recordings")
      .update(payload)
      .eq("id", primary.id)
      .select("id")
      .single();

    if (error || !data) {
      throw new Error(
        `recording_update_failed:${error?.message ?? "unknown error"}`
      );
    }

    await deleteDuplicateRecordings(
      adminSupabase,
      duplicates.map((row) => row.id)
    );

    return {
      recordingId: String((data as RawRow).id),
      previousAudioStoragePath: primary.audioStoragePath || null,
      duplicateAudioStoragePaths: duplicates
        .map((row) => row.audioStoragePath)
        .filter((value) => value.length > 0),
    };
  }

  const { data, error } = await adminSupabase
    .from("recordings")
    .insert(payload)
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(
      `recording_insert_failed:${error?.message ?? "unknown error"}`
    );
  }

  return {
    recordingId: String((data as RawRow).id),
    previousAudioStoragePath: null,
    duplicateAudioStoragePaths: [],
  };
}

async function removeObsoleteRecordingArtifacts(
  adminSupabase: AdminSupabase,
  bucketName: string,
  previousAudioStoragePath: string | null,
  duplicateAudioStoragePaths: string[],
  currentObjectPaths: string[]
): Promise<void> {
  const obsoleteFromPrimary = previousAudioStoragePath
    ? buildRecordingArtifactObjectPathsFromPublicUrl(
        previousAudioStoragePath,
        bucketName
      )
    : [];

  const obsoleteFromDuplicates = duplicateAudioStoragePaths.flatMap((publicUrl) =>
    buildRecordingArtifactObjectPathsFromPublicUrl(publicUrl, bucketName)
  );

  const obsoleteObjectPaths = [...new Set([...obsoleteFromPrimary, ...obsoleteFromDuplicates])]
    .filter((path) => !currentObjectPaths.includes(path));

  await removeStorageObjectPaths(adminSupabase, bucketName, obsoleteObjectPaths);
}

export async function publishHumanRecording({
  userId,
  seriesId,
  episodeId,
  episodeNumber,
  readerName,
  isPublic = true,
  sourceFile,
}: PublishHumanRecordingInput): Promise<PublishHumanRecordingResult> {
  const adminSupabase = createAdminClient();

  await loadPublishAccess(adminSupabase, seriesId, userId);

  const canonicalEpisodeId = await resolveCanonicalEpisodeIdForSeries(
    adminSupabase,
    seriesId,
    episodeId,
    episodeNumber
  );

  if (!canonicalEpisodeId) {
    throw new Error("episode_not_found");
  }

  const episodeBody = await fetchEpisodeBodyForAlignment(
    adminSupabase,
    canonicalEpisodeId
  );

  const fileBytes = new Uint8Array(await sourceFile.arrayBuffer());

  if (fileBytes.byteLength <= 0) {
    throw new Error("empty_file");
  }

  const bucketName = getRecordingAudioBucketName();
  const sourceExtension = guessExtension(sourceFile);
  const originalContentType = sourceFile.type || getAudioContentType(sourceExtension);

  const { originalObjectPath, playbackObjectPath } = buildHumanRecordingObjectPaths({
    seriesId,
    episodeId: canonicalEpisodeId,
    userId,
    sourceExtension,
  });
  const timingObjectPath =
    buildNemoTimingObjectPathFromAudioObjectPath(playbackObjectPath);

  const currentObjectPaths = [
    originalObjectPath,
    playbackObjectPath,
    timingObjectPath,
  ];

  try {
    const { error: originalUploadError } = await adminSupabase.storage
      .from(bucketName)
      .upload(originalObjectPath, fileBytes, {
        contentType: originalContentType,
        upsert: false,
      });

    if (originalUploadError) {
      throw new Error(`storage_upload_failed:${originalUploadError.message}`);
    }

    const normalizedPlayback = await normalizeAudioForPlayback({
      sourceBytes: fileBytes,
      sourceFileName: sourceFile.name,
      sourceMimeType: sourceFile.type,
    });

    const transcription = await transcribeHumanPlaybackAudio({
      audioBytes: normalizedPlayback.bytes,
      fileName: `playback.${PLAYBACK_AUDIO_EXTENSION}`,
      mimeType: PLAYBACK_AUDIO_CONTENT_TYPE,
    });

    const { manifest } = alignHumanRecordingToBodyOrThrow({
      body: episodeBody,
      transcription,
    });

    const { error: playbackUploadError } = await adminSupabase.storage
      .from(bucketName)
      .upload(playbackObjectPath, normalizedPlayback.bytes, {
        contentType: PLAYBACK_AUDIO_CONTENT_TYPE,
        upsert: false,
      });

    if (playbackUploadError) {
      throw new Error(`storage_upload_failed:${playbackUploadError.message}`);
    }

    const timingBytes = new TextEncoder().encode(
      JSON.stringify(manifest, null, 2)
    );

    const { error: timingUploadError } = await adminSupabase.storage
      .from(bucketName)
      .upload(timingObjectPath, timingBytes, {
        contentType: "application/json",
        upsert: false,
      });

    if (timingUploadError) {
      throw new Error(`human_timing_upload_failed:${timingUploadError.message}`);
    }

    const {
      data: { publicUrl },
    } = adminSupabase.storage.from(bucketName).getPublicUrl(playbackObjectPath);

    if (!publicUrl) {
      throw new Error("storage_public_url_unavailable");
    }

    await ensureReaderUserRow(adminSupabase, userId, readerName);

    const {
      recordingId,
      previousAudioStoragePath,
      duplicateAudioStoragePaths,
    } = await writeRecording(adminSupabase, {
      seriesId,
      episodeId: canonicalEpisodeId,
      readerId: userId,
      readerName,
      audioStoragePath: publicUrl,
      isPublic,
    });

    try {
      await removeObsoleteRecordingArtifacts(
        adminSupabase,
        bucketName,
        previousAudioStoragePath,
        duplicateAudioStoragePaths,
        currentObjectPaths
      );
    } catch (cleanupError) {
      console.warn("[human recording artifact cleanup warning]", cleanupError);
    }

    return {
      recordingId,
      audioStoragePath: publicUrl,
      originalStorageObjectPath: originalObjectPath,
      playbackStorageObjectPath: playbackObjectPath,
      readerName,
    };
  } catch (error) {
    await removeStorageObjectPaths(adminSupabase, bucketName, currentObjectPaths);

    if (error instanceof Error) {
      throw error;
    }

    throw new Error("human_recording_publish_failed");
  }
}