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
import { isHumanRecordingRow } from "@/lib/recording/humanRecordingState";
import {
  buildHumanRecordingPlaybackHref,
  getHumanRecordingAudioBucketName,
} from "@/lib/recording/humanRecordingStorage";

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
  seriesId: string;
  episodeId: string;
  audioStoragePath: string;
  readerId: string;
  readerName: string;
  voiceModelId: string;
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

// No destructive Human recording cleanup on uncertain upload/DB results.

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
      .select("id, series_id")
      .eq("id", requestedEpisodeId)
      .maybeSingle();

    if (!byId.error && byId.data) {
      const row = byId.data as RawRow;
      const resolvedSeriesId = pickText(row.series_id);

      if (resolvedSeriesId === seriesId) {
        return String(row.id);
      }
    }
  }

  if (episodeNumber && Number.isInteger(episodeNumber) && episodeNumber > 0) {
    const result = await adminSupabase
      .from("episodes")
      .select("id")
      .eq("series_id", seriesId)
      .eq("episode_number", episodeNumber)
      .maybeSingle();

    if (!result.error && result.data) {
      const row = result.data as RawRow;
      return String(row.id);
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
  const safeReaderName = readerName.trim();
  if (!safeReaderName) {
    throw new Error("reader_name_required");
  }
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
    seriesId: pickText(row.series_id),
    episodeId: pickText(row.episode_id),
    audioStoragePath: pickText(row.audio_storage_path),
    // Never use alias/name fields to authorize privileged replacement.
    readerId: pickText(row.reader_id),
    readerName: pickText(row.reader_name),
    voiceModelId: pickText(row.voice_model_id),
  }));
}

// Only a canonical playback file under THIS publisher's path may be reused.
// Legacy media, other owners and arbitrary hosted URLs remain untouched.
function isCanonicalOwnedHumanPlaybackPath(
  value: string, seriesId: string, episodeId: string, readerId: string
): boolean {
  const prefix = `human/${seriesId}/${episodeId}/${readerId}/`;
  if (!value.startsWith(prefix)) return false;
  return /^[a-z0-9-]+\/playback-from-[a-z0-9]+\.m4a$/u.test(
    value.slice(prefix.length)
  );
}

async function findExistingRecordings(
  adminSupabase: AdminSupabase,
  episodeId: string
): Promise<ExistingRecording[]> {
  const result = await adminSupabase
    .from("recordings")
    .select("*")
    .eq("episode_id", episodeId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  if (result.error) {
    throw new Error(`recording_lookup_failed:${result.error.message}`);
  }

  return mapRecordingRows(
    ((result.data ?? []) as RawRow[]).filter(isHumanRecordingRow)
  );
}

async function writeRecording(
  adminSupabase: AdminSupabase,
  input: RecordingWriteInput
): Promise<{ recordingId: string }> {
  const allEpisodeRows = await findExistingRecordings(
    adminSupabase,
    input.episodeId
  );

  const primary = allEpisodeRows.find((row) =>
    row.seriesId === input.seriesId &&
    row.episodeId === input.episodeId &&
    row.readerId === input.readerId &&
    row.readerName === input.readerName &&
    !row.voiceModelId &&
    isCanonicalOwnedHumanPlaybackPath(
      row.audioStoragePath, input.seriesId, input.episodeId, input.readerId
    )
  ) ?? null;

  const payload = {
    series_id: input.seriesId,
    episode_id: input.episodeId,
    reader_id: input.readerId,
    reader_name: input.readerName,
    audio_storage_path: input.audioStoragePath,
    is_public: input.isPublic,
    voice_model_id: null,
  };

  if (primary) {
    const { data, error } = await adminSupabase
      .from("recordings")
      .update(payload)
      .eq("id", primary.id)
      .eq("series_id", input.seriesId)
      .eq("episode_id", input.episodeId)
      .eq("reader_id", input.readerId)
      .eq("reader_name", input.readerName)
      .is("voice_model_id", null)
      .eq("audio_storage_path", primary.audioStoragePath)
      .select("id")
      .maybeSingle();

    if (error) throw new Error(`recording_update_failed:${error.message}`);
    if (!data) throw new Error("human_recording_write_conflict");
    return { recordingId: String((data as RawRow).id) };
  }

  // First-time parallel submissions can create separate rows. Retain both
  // without inventing a Production uniqueness guarantee or deleting media.
  const { data, error } = await adminSupabase
    .from("recordings")
    .insert(payload)
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`recording_insert_failed:${error?.message ?? "unknown error"}`);
  }
  return { recordingId: String((data as RawRow).id) };
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

  const bucketName = getHumanRecordingAudioBucketName();
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

    await ensureReaderUserRow(adminSupabase, userId, readerName);

    const { recordingId } = await writeRecording(adminSupabase, {
      seriesId,
      episodeId: canonicalEpisodeId,
      readerId: userId,
      readerName,
      audioStoragePath: playbackObjectPath,
      isPublic,
    });

    // Do not delete older Human rows or any source/playback/timing objects:
    // an upload or DB response may have been lost after committing remotely.
    return {
      recordingId,
      audioStoragePath: buildHumanRecordingPlaybackHref(recordingId),
      originalStorageObjectPath: originalObjectPath,
      playbackStorageObjectPath: playbackObjectPath,
      readerName,
    };
  } catch (error) {
    // An ambiguous failure is never authority to delete uploaded objects.
    if (error instanceof Error) {
      throw error;
    }

    throw new Error("human_recording_publish_failed");
  }
}
