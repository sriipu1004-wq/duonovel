import {
  getEpisodeBody,
  getEpisodeNumber,
  pickText,
  type EpisodeRow,
} from "@/features/write/writeShared";
import { synthesizeAivisWav } from "@/lib/recording/aivisClient";
import { buildNemoChunks } from "@/lib/recording/nemoChunking";
import { resolveNemoPronunciationDictionary } from "@/lib/recording/nemoPronunciationDictionary";
import {
  buildNemoTimingManifest,
  buildNemoTimingObjectPathFromAudioObjectPath,
} from "@/lib/recording/nemoTiming";
import {
  concatNemoWavs,
  downsampleNemoWav,
  getNemoWavDurationSeconds,
} from "@/lib/recording/nemoWav";
import {
  decideRecordingEntryAccess,
  hasApprovedRecordingRequest,
  normalizeRecordingPermissionMode,
} from "@/lib/recording/recordingEntry";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type UserSupabase = Awaited<ReturnType<typeof createClient>>;
type AdminSupabase = ReturnType<typeof createAdminClient>;
type GenerationSupabase = UserSupabase | AdminSupabase;
type RawRow = Record<string, unknown>;

export type GenerateAivisRecordingInput = {
  supabase: GenerationSupabase;
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

export type GenerateAivisRecordingResult = {
  recordingId: string;
  audioStoragePath: string;
  narratorName: string;
  episodeNumber: number;
  episodeTitle: string;
  speakerId: number;
};

type RenderedAivisSegment = {
  wavBytes: Uint8Array;
  pauseAfterMs: number;
  durationSeconds: number;
};

function sanitizeStorageSegment(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);

  return normalized || "aivis";
}

function getRecordingAudioBucketName(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_RECORDING_BUCKET?.trim() || "recording-audio";
}

function buildAivisRecordingObjectPath({
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
    "aivis",
    sanitizeStorageSegment(seriesId),
    sanitizeStorageSegment(episodeId),
    `${unique}-${narratorSegment}.wav`,
  ].join("/");
}

function buildAivisUploadCandidates(mergedWavBytes: Uint8Array) {
  return [
    {
      label: "24k",
      wavBytes: downsampleNemoWav(mergedWavBytes, 24000),
    },
    {
      label: "16k",
      wavBytes: downsampleNemoWav(mergedWavBytes, 16000),
    },
    {
      label: "12k",
      wavBytes: downsampleNemoWav(mergedWavBytes, 12000),
    },
    {
      label: "8k",
      wavBytes: downsampleNemoWav(mergedWavBytes, 8000),
    },
  ];
}

function isStorageObjectTooLargeError(message: string): boolean {
  return message.includes("maximum allowed size");
}

async function loadAivisGenerationAccess(
  supabase: GenerationSupabase,
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

async function fetchAivisEpisodeSource(
  supabase: GenerationSupabase,
  seriesId: string,
  episodeId: string
) {
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
    episodeNumber: getEpisodeNumber(row) || Number(row.episode_number ?? 0),
    body: getEpisodeBody(row),
  };
}

function buildReaderUserInsertAttempts(userId: string, narratorName: string): RawRow[] {
  const safeNarratorName = narratorName.trim() || "Aivis 標準朗読";

  return [
    {
      id: userId,
      display_name: safeNarratorName,
      role: "voice",
    },
    {
      id: userId,
      display_name: safeNarratorName,
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
  const attempts = buildReaderUserInsertAttempts(userId, narratorName);

  for (const payload of attempts) {
    const { error } = await supabase
      .from("users")
      .upsert(payload, { onConflict: "id" });

    if (!error) {
      return;
    }

    if (process.env.NODE_ENV === "development") {
      console.warn("[aivis reader user upsert failed]", {
        keys: Object.keys(payload),
        message: error.message,
      });
    }
  }

  throw new Error("reader_user_upsert_failed");
}

async function findExistingRecordings(
  supabase: AdminSupabase,
  episodeId: string
) {
  const { data, error } = await supabase
    .from("recordings")
    .select("*")
    .eq("episode_id", episodeId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  if (error) {
    throw new Error(`recording_lookup_failed:${error.message}`);
  }

  return ((data ?? []) as RawRow[]).map((row) => ({
    id: String(row.id),
    audioStoragePath: pickText(row.audio_storage_path),
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

async function writeRecording(
  supabase: AdminSupabase,
  input: {
    seriesId: string;
    episodeId: string;
    readerId: string;
    readerName: string;
    audioStoragePath: string;
  }
): Promise<{ recordingId: string }> {
  const allEpisodeRows = await findExistingRecordings(supabase, input.episodeId);
  const isAivisNarrator = input.readerName.startsWith("Aivis ");

  const sameReaderNameRows = allEpisodeRows.filter(
    (row) => row.readerName === input.readerName
  );

  const sameReaderIdRows = isAivisNarrator
    ? []
    : allEpisodeRows.filter((row) => row.readerId === input.readerId);

  const existingRows =
    sameReaderNameRows.length > 0 ? sameReaderNameRows : sameReaderIdRows;
  const primary = existingRows[0] ?? null;

  const payload = {
    series_id: input.seriesId,
    episode_id: input.episodeId,
    reader_id: input.readerId,
    reader_name: input.readerName,
    audio_storage_path: input.audioStoragePath,
    is_public: true,
    tags: null,
  };

  if (primary) {
    const { data, error } = await supabase
      .from("recordings")
      .update(payload)
      .eq("id", primary.id)
      .select("id")
      .single();

    if (error || !data) {
      throw new Error(`recording_update_failed:${error?.message ?? "unknown"}`);
    }

    return {
      recordingId: String((data as RawRow).id),
    };
  }

  const { data, error } = await supabase
    .from("recordings")
    .insert(payload)
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`recording_insert_failed:${error?.message ?? "unknown"}`);
  }

  return {
    recordingId: String((data as RawRow).id),
  };
}

async function removeStorageObjectPaths(
  supabase: AdminSupabase,
  bucketName: string,
  objectPaths: string[]
): Promise<void> {
  const filtered = [...new Set(objectPaths.filter((path) => path.trim().length > 0))];

  if (filtered.length === 0) {
    return;
  }

  await supabase.storage.from(bucketName).remove(filtered);
}

export async function generateAivisRecordingForEpisode({
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
}: GenerateAivisRecordingInput): Promise<GenerateAivisRecordingResult> {
  await loadAivisGenerationAccess(supabase, seriesId, userId);

  const episode = await fetchAivisEpisodeSource(supabase, seriesId, episodeId);

  if (!episode) {
    throw new Error("episode_not_found");
  }

  if (!episode.body.trim()) {
    throw new Error("episode_body_empty");
  }

  const pronunciationDictionary = resolveNemoPronunciationDictionary({
    seriesId,
    episodeId,
  });

  const chunks = buildNemoChunks(episode.body, {
      pronunciationDictionary,
    }).slice(0, 50); // ← とりあえず50chunkまで

  if (chunks.length === 0) {
    throw new Error("episode_body_empty");
  }

  const renderedSegments: RenderedAivisSegment[] = [];

  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];

    try {
      const wavBytes = await synthesizeAivisWav({
        text: chunk.text,
        speaker: speakerId,
        speedScale: speedScale ?? 0.94,
        pitchScale: pitchScale ?? 0,
        intonationScale: intonationScale ?? 1.1,
        volumeScale: volumeScale ?? 1,
        prePhonemeLength: 0.14,
        postPhonemeLength: 0.18,
      });

      renderedSegments.push({
        wavBytes,
        pauseAfterMs: chunk.pauseAfterMs,
        durationSeconds: getNemoWavDurationSeconds(wavBytes),
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`aivis_chunk_failed:${index + 1}/${chunks.length}:${detail}`);
    }
  }

  const timingManifest = buildNemoTimingManifest({
    chunks,
    renderedSegments,
  });

  const adminSupabase = createAdminClient();
  const bucketName = getRecordingAudioBucketName();
  const audioObjectPath = buildAivisRecordingObjectPath({
    seriesId,
    episodeId,
    narratorName,
  });
  const timingObjectPath =
    buildNemoTimingObjectPathFromAudioObjectPath(audioObjectPath);
  const currentObjectPaths = [audioObjectPath, timingObjectPath];

  try {
    const mergedWavBytes = concatNemoWavs(renderedSegments);
    const uploadCandidates = buildAivisUploadCandidates(mergedWavBytes);

    let uploaded = false;
    let lastUploadErrorMessage = "";

    for (const candidate of uploadCandidates) {
      const { error: uploadError } = await adminSupabase.storage
        .from(bucketName)
        .upload(audioObjectPath, candidate.wavBytes, {
          contentType: "audio/wav",
          upsert: true,
        });

      if (!uploadError) {
        uploaded = true;
        break;
      }

      lastUploadErrorMessage = uploadError.message;

      if (!isStorageObjectTooLargeError(uploadError.message)) {
        throw new Error(`storage_upload_failed:${uploadError.message}`);
      }
    }

    if (!uploaded) {
      throw new Error(
        `storage_upload_failed:${lastUploadErrorMessage || "unknown"}`
      );
    }

    const {
      data: { publicUrl },
    } = adminSupabase.storage.from(bucketName).getPublicUrl(audioObjectPath);

    if (!publicUrl) {
      throw new Error("storage_public_url_unavailable");
    }

    const timingBytes = new TextEncoder().encode(
      JSON.stringify(timingManifest, null, 2)
    );

    const { error: timingUploadError } = await adminSupabase.storage
      .from(bucketName)
      .upload(timingObjectPath, timingBytes, {
        contentType: "application/json",
        upsert: true,
      });

    if (timingUploadError) {
      throw new Error(`aivis_timing_upload_failed:${timingUploadError.message}`);
    }

    const { recordingId } = await writeRecording(adminSupabase, {
      seriesId,
      episodeId,
      readerId: userId,
      readerName: narratorName,
      audioStoragePath: publicUrl,
    });

    return {
      recordingId,
      audioStoragePath: publicUrl,
      narratorName,
      episodeNumber: episode.episodeNumber,
      episodeTitle: episode.title,
      speakerId,
    };
  } catch (error) {
    await removeStorageObjectPaths(adminSupabase, bucketName, currentObjectPaths);

    if (error instanceof Error) {
      throw error;
    }

    throw new Error("aivis_recording_write_failed");
  }
}