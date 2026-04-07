import {
  getEpisodeBody,
  getEpisodeNumber,
  pickText,
  type EpisodeRow,
} from "@/features/write/writeShared";
import { buildNemoChunks } from "@/lib/recording/nemoChunking";
import { synthesizeNemoWav } from "@/lib/recording/nemoClient";
import { concatNemoWavs } from "@/lib/recording/nemoWav";
import {
  decideRecordingEntryAccess,
  hasApprovedRecordingRequest,
  normalizeRecordingPermissionMode,
} from "@/lib/recording/recordingEntry";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type UserSupabase = Awaited<ReturnType<typeof createClient>>;
type AdminSupabase = ReturnType<typeof createAdminClient>;
type RawRow = Record<string, unknown>;

export type NemoEpisodeSource = {
  id: string;
  title: string;
  episodeNumber: number;
  body: string;
};

export type GenerateNemoRecordingInput = {
  supabase: UserSupabase;
  userId: string;
  seriesId: string;
  episodeId: string;
  narratorName: string;
  speakerId: number;
  speedScale?: number;
  pitchScale?: number;
  intonationScale?: number;
  volumeScale?: number;
};

export type GenerateNemoRecordingResult = {
  recordingId: string;
  audioStoragePath: string;
  narratorName: string;
  episodeNumber: number;
  episodeTitle: string;
  speakerId: number;
};

type RecordingWriteInput = {
  seriesId: string;
  episodeId: string;
  readerId: string;
  readerName: string;
  audioStoragePath: string;
};

type ExistingRecording = {
  id: string;
  audioStoragePath: string;
};

function parseEpisodeNumber(row: RawRow): number {
  const candidates = [row.episode_number, row.episodeNumber];

  for (const candidate of candidates) {
    const parsed = Number(candidate);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return 0;
}

function sanitizeStorageSegment(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);

  return normalized || "nemo";
}

function getRecordingAudioBucketName(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_RECORDING_BUCKET?.trim() || "recording-audio";
}

function buildNemoRecordingObjectPath({
  seriesId,
  episodeId,
  narratorName,
}: {
  seriesId: string;
  episodeId: string;
  narratorName: string;
}): string {
  const narratorSegment = sanitizeStorageSegment(narratorName);
  const unique = `${Date.now()}-${crypto.randomUUID()}`;

  return [
    "nemo",
    sanitizeStorageSegment(seriesId),
    sanitizeStorageSegment(episodeId),
    `${unique}-${narratorSegment}.wav`,
  ].join("/");
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

  const path = publicUrl.slice(markerIndex + marker.length).trim();
  return path.length > 0 ? decodeURIComponent(path) : null;
}

async function loadNemoGenerationAccess(
  supabase: UserSupabase,
  seriesId: string,
  userId: string
): Promise<void> {
  const { data, error } = await supabase
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

  const hasApprovedRequest =
    permissionMode === "approval_required"
      ? await hasApprovedRecordingRequest(supabase, seriesId, userId)
      : false;

  const decision = decideRecordingEntryAccess({
    permissionMode,
    isLoggedIn: true,
    hasApprovedRequest,
  });

  if (!decision.canEnter) {
    throw new Error(`entry_denied:${decision.deniedReason}`);
  }
}

async function fetchNemoEpisodeSource(
  supabase: UserSupabase,
  seriesId: string,
  episodeId: string
): Promise<NemoEpisodeSource | null> {
  const { data, error } = await supabase
    .from("episodes")
    .select("*")
    .eq("id", episodeId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const row = data as EpisodeRow;
  const resolvedSeriesId = pickText(row.series_id, row.seriesId);

  if (resolvedSeriesId !== seriesId) {
    return null;
  }

  return {
    id: String(row.id),
    title:
      pickText(row.title, row["episode_title"], row["name"]) || "話タイトル未設定",
    episodeNumber: getEpisodeNumber(row) || parseEpisodeNumber(row),
    body: getEpisodeBody(row),
  };
}

function buildReaderUserInsertAttempts(userId: string, narratorName: string): RawRow[] {
  const safeNarratorName = narratorName.trim() || "VOICEVOX Nemo";
  const fallbackUsername = `nemo-${userId.replace(/-/g, "").slice(0, 12)}`;

  return [
    {
      id: userId,
      display_name: safeNarratorName,
      username: fallbackUsername,
    },
    {
      id: userId,
      name: safeNarratorName,
      username: fallbackUsername,
    },
    {
      id: userId,
      pen_name: safeNarratorName,
      username: fallbackUsername,
    },
    {
      id: userId,
      display_name: safeNarratorName,
    },
    {
      id: userId,
      name: safeNarratorName,
    },
    {
      id: userId,
      pen_name: safeNarratorName,
    },
    {
      id: userId,
    },
  ];
}

async function ensureReaderUserRow(
  supabase: AdminSupabase,
  userId: string,
  narratorName: string
): Promise<void> {
  const existing = await supabase
    .from("users")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (!existing.error && existing.data) {
    return;
  }

  const attempts = buildReaderUserInsertAttempts(userId, narratorName);
  const errors: string[] = [];

  for (const payload of attempts) {
    const { error } = await supabase
      .from("users")
      .upsert(payload, { onConflict: "id" });

    if (!error) {
      return;
    }

    if (error.message) {
      const keys = Object.keys(payload).join(", ");
      errors.push(`${keys} => ${error.message}`);
    }
  }

  throw new Error(
    errors.length > 0
      ? `reader_user_upsert_failed:${errors.join(" | ")}`
      : "reader_user_upsert_failed"
  );
}

async function findExistingRecordings(
  supabase: AdminSupabase,
  episodeId: string,
  readerId: string
): Promise<ExistingRecording[]> {
  const { data, error } = await supabase
    .from("recordings")
    .select("id, audio_storage_path")
    .eq("episode_id", episodeId)
    .eq("reader_id", readerId);

  if (error) {
    throw new Error(`recording_lookup_failed:${error.message}`);
  }

  const rows = (data ?? []) as RawRow[];

  return rows.map((row) => ({
    id: String(row.id),
    audioStoragePath: pickText(row.audio_storage_path),
  }));
}

async function deleteDuplicateRecordings(
  supabase: AdminSupabase,
  duplicateIds: string[]
): Promise<void> {
  if (duplicateIds.length === 0) {
    return;
  }

  const { error } = await supabase
    .from("recordings")
    .delete()
    .in("id", duplicateIds);

  if (error) {
    throw new Error(`recording_duplicate_cleanup_failed:${error.message}`);
  }
}

async function writeRecording(
  supabase: AdminSupabase,
  input: RecordingWriteInput
): Promise<{
  recordingId: string;
  previousAudioStoragePath: string | null;
  duplicateAudioStoragePaths: string[];
}> {
  const existingRows = await findExistingRecordings(
    supabase,
    input.episodeId,
    input.readerId
  );

  const primary = existingRows[0] ?? null;
  const duplicates = existingRows.slice(1);

  const payload = {
    series_id: input.seriesId,
    episode_id: input.episodeId,
    reader_id: input.readerId,
    reader_name: input.readerName,
    audio_storage_path: input.audioStoragePath,
    is_public: true,
  };

  if (primary) {
    const { data, error } = await supabase
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
      supabase,
      duplicates.map((row) => row.id)
    );

    const row = data as RawRow;

    return {
      recordingId: String(row.id),
      previousAudioStoragePath: primary.audioStoragePath || null,
      duplicateAudioStoragePaths: duplicates
        .map((row) => row.audioStoragePath)
        .filter((value) => value.length > 0),
    };
  }

  const { data, error } = await supabase
    .from("recordings")
    .insert(payload)
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(
      `recording_insert_failed:${error?.message ?? "unknown error"}`
    );
  }

  const row = data as RawRow;

  return {
    recordingId: String(row.id),
    previousAudioStoragePath: null,
    duplicateAudioStoragePaths: [],
  };
}

async function removeUploadedRecordingAudio(
  supabase: AdminSupabase,
  bucketName: string,
  objectPath: string
): Promise<void> {
  await supabase.storage.from(bucketName).remove([objectPath]);
}

async function removePreviousRecordingAudioIfNeeded(
  supabase: AdminSupabase,
  bucketName: string,
  previousAudioStoragePath: string | null,
  currentObjectPath: string
): Promise<void> {
  if (!previousAudioStoragePath) {
    return;
  }

  const previousObjectPath = extractBucketObjectPathFromPublicUrl(
    previousAudioStoragePath,
    bucketName
  );

  if (!previousObjectPath || previousObjectPath === currentObjectPath) {
    return;
  }

  await removeUploadedRecordingAudio(supabase, bucketName, previousObjectPath);
}

async function removeRecordingAudioPaths(
  supabase: AdminSupabase,
  bucketName: string,
  audioStoragePaths: string[],
  currentObjectPath?: string
): Promise<void> {
  const objectPaths = audioStoragePaths
    .map((publicUrl) =>
      extractBucketObjectPathFromPublicUrl(publicUrl, bucketName)
    )
    .filter((value): value is string => Boolean(value))
    .filter((value) => value !== currentObjectPath);

  if (objectPaths.length === 0) {
    return;
  }

  await supabase.storage.from(bucketName).remove(objectPaths);
}

export async function generateNemoRecordingForEpisode({
  supabase,
  userId,
  seriesId,
  episodeId,
  narratorName,
  speakerId,
  speedScale,
  pitchScale,
  intonationScale,
  volumeScale,
}: GenerateNemoRecordingInput): Promise<GenerateNemoRecordingResult> {
  await loadNemoGenerationAccess(supabase, seriesId, userId);

  const episode = await fetchNemoEpisodeSource(supabase, seriesId, episodeId);

  if (!episode) {
    throw new Error("episode_not_found");
  }

  if (!episode.body.trim()) {
    throw new Error("episode_body_empty");
  }

  const chunks = buildNemoChunks(episode.body);

  if (chunks.length === 0) {
    throw new Error("episode_body_empty");
  }

  console.error("[nemo chunk build]", {
    originalLength: episode.body.length,
    chunkCount: chunks.length,
    preview: chunks.slice(0, 3).map((chunk) => ({
      paragraphIndex: chunk.paragraphIndex,
      chunkIndex: chunk.chunkIndex,
      length: chunk.text.length,
      pauseAfterMs: chunk.pauseAfterMs,
    })),
    episodeId,
  });

  const renderedSegments: Array<{
    wavBytes: Uint8Array;
    pauseAfterMs: number;
  }> = [];

  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];

    try {
      const wavBytes = await synthesizeNemoWav({
        text: chunk.text,
        speaker: speakerId,
        speedScale,
        pitchScale,
        intonationScale,
        volumeScale,
      });

      renderedSegments.push({
        wavBytes,
        pauseAfterMs: chunk.pauseAfterMs,
      });
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : String(error);

      throw new Error(
        `nemo_chunk_failed:${index + 1}/${chunks.length}:${detail}`
      );
    }
  }

  const wavBytes = concatNemoWavs(renderedSegments);

  const adminSupabase = createAdminClient();
  const bucketName = getRecordingAudioBucketName();
  const objectPath = buildNemoRecordingObjectPath({
    seriesId,
    episodeId,
    narratorName,
  });

  const { error: uploadError } = await adminSupabase.storage
    .from(bucketName)
    .upload(objectPath, wavBytes, {
      contentType: "audio/wav",
      upsert: false,
    });

  if (uploadError) {
    console.error("[nemo storage upload failed]", {
      bucketName,
      objectPath,
      message: uploadError.message,
      name: uploadError.name,
    });

    throw new Error(`storage_upload_failed:${uploadError.message}`);
  }

  const {
    data: { publicUrl },
  } = adminSupabase.storage.from(bucketName).getPublicUrl(objectPath);

  if (!publicUrl) {
    await removeUploadedRecordingAudio(adminSupabase, bucketName, objectPath);
    throw new Error("storage_public_url_unavailable");
  }

  try {
    await ensureReaderUserRow(adminSupabase, userId, narratorName);

    const {
      recordingId,
      previousAudioStoragePath,
      duplicateAudioStoragePaths,
    } = await writeRecording(adminSupabase, {
      seriesId,
      episodeId,
      readerId: userId,
      readerName: narratorName,
      audioStoragePath: publicUrl,
    });

    await removePreviousRecordingAudioIfNeeded(
      adminSupabase,
      bucketName,
      previousAudioStoragePath,
      objectPath
    );

    await removeRecordingAudioPaths(
      adminSupabase,
      bucketName,
      duplicateAudioStoragePaths,
      objectPath
    );

    return {
      recordingId,
      audioStoragePath: publicUrl,
      narratorName,
      episodeNumber: episode.episodeNumber,
      episodeTitle: episode.title,
      speakerId,
    };
  } catch (error) {
    await removeUploadedRecordingAudio(adminSupabase, bucketName, objectPath);

    if (error instanceof Error) {
      throw error;
    }

    throw new Error("recording_write_failed");
  }
}