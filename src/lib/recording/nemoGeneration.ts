import { checkNonproductionMediaWriterBoundary } from "@/lib/recording/publicMediaWriterBoundary";
import {
  getEpisodeBody,
  getEpisodeNumber,
  pickText,
  type EpisodeRow,
} from "@/features/write/writeShared";
import { buildNemoChunks } from "@/lib/recording/nemoChunking";
import { synthesizeNemoWav } from "@/lib/recording/nemoClient";
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
  normalizeRecordingPermissionMode,
} from "@/lib/recording/recordingEntry";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  PRIVATE_AI_AUDIO_BUCKET, makePrivateAiAudioReference,
  mustUsePrivateAiAudio, buildPrivateAiAudioPlaybackHref,
} from "@/lib/recording/protectedAiRecordingStorage";
import { createClient } from "@/lib/supabase/server";

type UserSupabase = Awaited<ReturnType<typeof createClient>>;
type AdminSupabase = ReturnType<typeof createAdminClient>;
type GenerationSupabase = UserSupabase | AdminSupabase;
type RawRow = Record<string, unknown>;

export type NemoEpisodeSource = {
  id: string;
  title: string;
  episodeNumber: number;
  body: string;
};

export type GenerateNemoRecordingInput = {
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
  seriesId: string;
  audioStoragePath: string;
  readerId: string;
  readerName: string;
  voiceModelId: string;
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

function isNemoNarratorName(name: string): boolean {
  return name.startsWith("VOICEVOX Nemo");
}

function getRecordingAudioBucketName(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_RECORDING_BUCKET?.trim() || "recording-audio";
}

function isStorageObjectTooLargeError(message: string): boolean {
  return message.includes("maximum allowed size");
}

type NemoUploadCandidate = {
  label: string;
  wavBytes: Uint8Array;
};

function buildNemoUploadCandidates(mergedWavBytes: Uint8Array): NemoUploadCandidate[] {
  const rawCandidates: NemoUploadCandidate[] = [
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

  const uniqueBySize = new Map<number, NemoUploadCandidate>();

  for (const candidate of rawCandidates) {
    if (!uniqueBySize.has(candidate.wavBytes.byteLength)) {
      uniqueBySize.set(candidate.wavBytes.byteLength, candidate);
    }
  }

  return Array.from(uniqueBySize.values());
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

type RenderedNemoSegment = {
  wavBytes: Uint8Array;
  pauseAfterMs: number;
  durationSeconds: number;
};

type NemoAudioUploadCandidate = {
  label: string;
  wavBytes: Uint8Array;
};

type NemoUploadPartPlan = {
  partIndex: number;
  startTimeSeconds: number;
  durationSeconds: number;
  renderedSegments: RenderedNemoSegment[];
};

const MAX_NEMO_UPLOAD_PART_DURATION_SECONDS = 300;

const DEFAULT_NEMO_SPEED_SCALE = 0.94;
const DEFAULT_NEMO_PITCH_SCALE = 0;
const DEFAULT_NEMO_INTONATION_SCALE = 1.22;
const DEFAULT_NEMO_VOLUME_SCALE = 1.1;
const DEFAULT_NEMO_PRE_PHONEME_LENGTH = 0.14;
const DEFAULT_NEMO_POST_PHONEME_LENGTH = 0.18;

function isStorageObjectTooLargeUploadError(message: string): boolean {
  return message.includes("maximum allowed size");
}

function buildUploadCandidatesForNemoWav(
  mergedWavBytes: Uint8Array
): NemoAudioUploadCandidate[] {
  const rawCandidates: NemoAudioUploadCandidate[] = [
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

  const uniqueBySize = new Map<number, NemoAudioUploadCandidate>();

  for (const candidate of rawCandidates) {
    if (!uniqueBySize.has(candidate.wavBytes.byteLength)) {
      uniqueBySize.set(candidate.wavBytes.byteLength, candidate);
    }
  }

  return Array.from(uniqueBySize.values());
}

function getRenderedNemoSegmentTotalDurationSeconds(
  segment: RenderedNemoSegment
): number {
  return segment.durationSeconds + segment.pauseAfterMs / 1000;
}

function buildNemoRecordingPartObjectPath(
  baseObjectPath: string,
  partIndex: number,
  totalParts: number
): string {
  if (totalParts <= 1) {
    return baseObjectPath;
  }

  const suffix = `.part${String(partIndex + 1).padStart(3, "0")}`;

  if (/\.wav$/i.test(baseObjectPath)) {
    return baseObjectPath.replace(/\.wav$/i, `${suffix}.wav`);
  }

  return `${baseObjectPath}${suffix}.wav`;
}

function buildNemoUploadPartPlans(
  renderedSegments: RenderedNemoSegment[],
  maxPartDurationSeconds: number = MAX_NEMO_UPLOAD_PART_DURATION_SECONDS
): NemoUploadPartPlan[] {
  if (renderedSegments.length === 0) {
    return [];
  }

  const parts: NemoUploadPartPlan[] = [];

  let currentRenderedSegments: RenderedNemoSegment[] = [];
  let currentDurationSeconds = 0;
  let currentStartTimeSeconds = 0;

  for (const renderedSegment of renderedSegments) {
    const segmentDurationSeconds =
      getRenderedNemoSegmentTotalDurationSeconds(renderedSegment);

    if (
      currentRenderedSegments.length > 0 &&
      currentDurationSeconds + segmentDurationSeconds > maxPartDurationSeconds
    ) {
      parts.push({
        partIndex: parts.length,
        startTimeSeconds: currentStartTimeSeconds,
        durationSeconds: currentDurationSeconds,
        renderedSegments: currentRenderedSegments,
      });

      currentStartTimeSeconds += currentDurationSeconds;
      currentRenderedSegments = [];
      currentDurationSeconds = 0;
    }

    currentRenderedSegments.push(renderedSegment);
    currentDurationSeconds += segmentDurationSeconds;
  }

  if (currentRenderedSegments.length > 0) {
    parts.push({
      partIndex: parts.length,
      startTimeSeconds: currentStartTimeSeconds,
      durationSeconds: currentDurationSeconds,
      renderedSegments: currentRenderedSegments,
    });
  }

  return parts;
}

async function loadNemoGenerationAccess(
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
  const decision = decideRecordingEntryAccess({
    permissionMode,
    isLoggedIn: true,
  });

  if (!decision.canEnter) {
    throw new Error(`entry_denied:${decision.deniedReason}`);
  }
}

async function fetchNemoEpisodeSource(
  supabase: GenerationSupabase,
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

// Only a canonical Nemo artifact of THIS series and episode is eligible for
// reuse. Human or Aivis paths, arbitrary public URLs, and legacy unknown
// provenance are not safe to update with an admin client.
function isNemoRecordingReference(value: string, seriesId: string, episodeId: string): boolean {
  const prefix = `nemo/${seriesId}/${episodeId}/`;
  let objectPath = "";
  if (value.startsWith("r18-private:")) {
    objectPath = value.slice("r18-private:".length);
  } else {
    try {
      const url = new URL(value);
      const publicPrefix = "/storage/v1/object/public/recording-audio/";
      if (url.protocol !== "https:" || url.search || url.hash ||
          !url.pathname.startsWith(publicPrefix)) return false;
      objectPath = url.pathname.slice(publicPrefix.length);
    } catch {
      return false;
    }
  }
  if (!objectPath.startsWith(prefix)) return false;
  return /^[^/]+\.wav$/u.test(objectPath.slice(prefix.length));
}

async function findExistingRecordings(
  supabase: AdminSupabase,
  episodeId: string
): Promise<ExistingRecording[]> {
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
    seriesId: pickText(row.series_id),
    audioStoragePath: pickText(row.audio_storage_path),
    // Do not fall back to a display name or a nullable legacy reader_user_id:
    // the CAS below must match the actual owner column being updated.
    readerId: pickText(row.reader_id),
    readerName: pickText(row.reader_name),
    voiceModelId: pickText(row.voice_model_id),
  }));
}

async function writeRecording(
  supabase: AdminSupabase,
  input: RecordingWriteInput
): Promise<{ recordingId: string }> {
  const allEpisodeRows = await findExistingRecordings(supabase, input.episodeId);
  const eligibleRows = allEpisodeRows.filter((row) =>
    row.seriesId === input.seriesId &&
    row.readerId === input.readerId &&
    row.readerName === input.readerName &&
    !row.voiceModelId &&
    isNemoRecordingReference(row.audioStoragePath, input.seriesId, input.episodeId)
  );
  // No name-only fallback, cross-reader/model reuse, or DB duplicate deletion.
  // Multiple existing Nemo versions remain preserved; update only the newest
  // eligible row. A concurrent change to its pointer makes the CAS return no
  // rows, and MUST fail instead of updating a different row.
  const primary = eligibleRows[0] ?? null;
  const payload = {
    series_id: input.seriesId,
    episode_id: input.episodeId,
    reader_id: input.readerId,
    reader_name: input.readerName,
    audio_storage_path: input.audioStoragePath,
    is_public: true,
    ...(isNemoNarratorName(input.readerName) ? { tags: null } : {}),
  };

  if (primary) {
    const { data, error } = await supabase
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
    if (!data) throw new Error("recording_write_conflict");

    return { recordingId: String((data as RawRow).id) };
  }

  // First-time simultaneous generations can insert separate rows without a
  // Production unique constraint. This intentionally preserves both versions,
  // rather than allowing a last-writer-wins overwrite or deleting a row.
  const { data, error } = await supabase
    .from("recordings")
    .insert(payload)
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`recording_insert_failed:${error?.message ?? "unknown error"}`);
  }
  return { recordingId: String((data as RawRow).id) };
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

  const pronunciationDictionary = resolveNemoPronunciationDictionary({
    seriesId,
    episodeId,
  });

  if (process.env.NODE_ENV === "development") {
    console.log("[nemo pronunciation dictionary]", {
      seriesId,
      episodeId,
      entryCount: Object.keys(pronunciationDictionary).length,
      entries: Object.keys(pronunciationDictionary),
    });
  }

  const chunks = buildNemoChunks(episode.body, {
    pronunciationDictionary,
  });

  if (chunks.length === 0) {
    throw new Error("episode_body_empty");
  }

  if (process.env.NODE_ENV === "development") {
    console.log("[nemo chunk build]", {
      originalLength: episode.body.length,
      chunkCount: chunks.length,
      preview: chunks.slice(0, 3).map((chunk) => ({
        paragraphIndex: chunk.paragraphIndex,
        chunkIndex: chunk.chunkIndex,
        sentenceIndex: chunk.sourceSentenceIndex,
        length: chunk.text.length,
        pauseAfterMs: chunk.pauseAfterMs,
      })),
      episodeId,
    });
  }

  const renderedSegments: RenderedNemoSegment[] = [];

  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];

    try {
      const wavBytes = await synthesizeNemoWav({
        text: chunk.text,
        speaker: speakerId,
        speedScale: speedScale ?? DEFAULT_NEMO_SPEED_SCALE,
        pitchScale: pitchScale ?? DEFAULT_NEMO_PITCH_SCALE,
        intonationScale: intonationScale ?? DEFAULT_NEMO_INTONATION_SCALE,
        volumeScale: volumeScale ?? DEFAULT_NEMO_VOLUME_SCALE,
        prePhonemeLength: DEFAULT_NEMO_PRE_PHONEME_LENGTH,
        postPhonemeLength: DEFAULT_NEMO_POST_PHONEME_LENGTH,
      });

      renderedSegments.push({
        wavBytes,
        pauseAfterMs: chunk.pauseAfterMs,
        durationSeconds: getNemoWavDurationSeconds(wavBytes),
      });
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : String(error);

      throw new Error(
        `nemo_chunk_failed:${index + 1}/${chunks.length}:${detail}`
      );
    }
  }

  const timingManifest = buildNemoTimingManifest({
    chunks,
    renderedSegments,
  });

  const adminSupabase = createAdminClient();
  const protectedR18 = await mustUsePrivateAiAudio(seriesId);
  // F2-P experimental Preview HOLD; this never authorizes PUBLIC release.
  checkNonproductionMediaWriterBoundary({
    kind: "ai-recording", isPublicCandidate: !protectedR18, env: process.env,
  });
  const bucketName = protectedR18 ? PRIVATE_AI_AUDIO_BUCKET : getRecordingAudioBucketName();
  const audioObjectPath = buildNemoRecordingObjectPath({
    seriesId,
    episodeId,
    narratorName,
  });
  const timingObjectPath =
    buildNemoTimingObjectPathFromAudioObjectPath(audioObjectPath);
  // Never remove an uncertain or already referenced Storage key on failure.
  // A failed DB write may have committed before its response was lost.
  try {
    const mergedWavBytes = concatNemoWavs(renderedSegments);
    const uploadCandidates = buildNemoUploadCandidates(mergedWavBytes);

    let uploaded = false;
    let lastUploadErrorMessage: string | null = null;
    let lastUploadErrorName: string | null = null;

    for (const candidate of uploadCandidates) {
      if (process.env.NODE_ENV === "development") {
        console.log("[nemo single upload candidate]", {
          episodeId,
          label: candidate.label,
          bytes: candidate.wavBytes.byteLength,
        });
      }

      const { error: uploadError } = await adminSupabase.storage
        .from(bucketName)
        .upload(audioObjectPath, candidate.wavBytes, {
          contentType: "audio/wav",
          upsert: false,
        });

      if (!uploadError) {
        uploaded = true;
        break;
      }

      lastUploadErrorMessage = uploadError.message;
      lastUploadErrorName = uploadError.name;

      if (process.env.NODE_ENV === "development") {
        console.warn("[nemo single upload retry]", {
          bucketName,
          audioObjectPath,
          label: candidate.label,
          bytes: candidate.wavBytes.byteLength,
          message: uploadError.message,
          name: uploadError.name,
        });
      }

      if (!isStorageObjectTooLargeError(uploadError.message)) {
        console.error("[nemo single upload failed]", {
          bucketName,
          audioObjectPath,
          label: candidate.label,
          bytes: candidate.wavBytes.byteLength,
          message: uploadError.message,
          name: uploadError.name,
        });

        throw new Error(`storage_upload_failed:${uploadError.message}`);
      }
    }

    if (!uploaded) {
      console.error("[nemo single upload failed]", {
        bucketName,
        audioObjectPath,
        message: lastUploadErrorMessage,
        name: lastUploadErrorName,
        candidates: uploadCandidates.map((candidate) => ({
          label: candidate.label,
          bytes: candidate.wavBytes.byteLength,
        })),
      });

      throw new Error(
        `storage_upload_failed:${lastUploadErrorMessage ?? "unknown error"}`
      );
    }

    const publicUrl = protectedR18
      ? null
      : adminSupabase.storage.from(bucketName).getPublicUrl(audioObjectPath).data.publicUrl;
    if (!protectedR18 && !publicUrl) throw new Error("storage_public_url_unavailable");
    const storedAudioReference = protectedR18
      ? makePrivateAiAudioReference(audioObjectPath)
      : publicUrl!;

    const timingBytes = new TextEncoder().encode(
      JSON.stringify(timingManifest, null, 2)
    );

    const { error: timingUploadError } = await adminSupabase.storage
      .from(bucketName)
      .upload(timingObjectPath, timingBytes, {
        contentType: "application/json",
        upsert: false,
      });

    if (timingUploadError) {
      throw new Error(`nemo_timing_upload_failed:${timingUploadError.message}`);
    }

    await ensureReaderUserRow(adminSupabase, userId, narratorName);

    const { recordingId } = await writeRecording(adminSupabase, {
      seriesId,
      episodeId,
      readerId: userId,
      readerName: narratorName,
      audioStoragePath: storedAudioReference,
    });

    // Keep prior media versions: a superseded URL may still be in a client,
    // historical timing manifest, or pending independent rights review.

    return {
      recordingId,
      audioStoragePath: protectedR18 ? buildPrivateAiAudioPlaybackHref(recordingId) : storedAudioReference,
      narratorName,
      episodeNumber: episode.episodeNumber,
      episodeTitle: episode.title,
      speakerId,
    };
  } catch (error) {
    // Fail closed without deleting objects. Upload success or a database commit
    // can be uncertain after a timeout; preserve bytes for explicit recovery.
    if (error instanceof Error) {
      throw error;
    }

    throw new Error("recording_write_failed");
  }
}