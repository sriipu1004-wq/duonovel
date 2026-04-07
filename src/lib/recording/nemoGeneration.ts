import {
  getEpisodeBody,
  getEpisodeNumber,
  pickText,
  type EpisodeRow,
} from "@/features/write/writeShared";
import { getAudioFileExtension } from "@/lib/recording/audioUploadPolicy";
import { synthesizeNemoWav } from "@/lib/recording/nemoClient";
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

type RecordingInsertInput = {
  seriesId: string;
  episodeId: string;
  narratorName: string;
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
  const extension = getAudioFileExtension(`${narratorName}.wav`) || "wav";
  const narratorSegment = sanitizeStorageSegment(narratorName);
  const unique = `${Date.now()}-${crypto.randomUUID()}`;

  return [
    "nemo",
    sanitizeStorageSegment(seriesId),
    sanitizeStorageSegment(episodeId),
    `${unique}-${narratorSegment}.${extension}`,
  ].join("/");
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

function buildInsertAttempts(input: RecordingInsertInput): RawRow[] {
  return [
    {
      series_id: input.seriesId,
      episode_id: input.episodeId,
      reader_name: input.narratorName,
      audio_storage_path: input.audioStoragePath,
      is_public: true,
    },
    {
      series_id: input.seriesId,
      episode_id: input.episodeId,
      narrator_name: input.narratorName,
      audio_storage_path: input.audioStoragePath,
      is_public: true,
    },
    {
      series_id: input.seriesId,
      episode_id: input.episodeId,
      display_name: input.narratorName,
      audio_storage_path: input.audioStoragePath,
      is_public: true,
    },
    {
      series_id: input.seriesId,
      episode_id: input.episodeId,
      speaker_name: input.narratorName,
      audio_storage_path: input.audioStoragePath,
      is_public: true,
    },
    {
      seriesId: input.seriesId,
      episodeId: input.episodeId,
      readerName: input.narratorName,
      audioStoragePath: input.audioStoragePath,
      public: true,
    },
    {
      seriesId: input.seriesId,
      episodeId: input.episodeId,
      narratorName: input.narratorName,
      audioStoragePath: input.audioStoragePath,
      public: true,
    },
    {
      seriesId: input.seriesId,
      episodeId: input.episodeId,
      displayName: input.narratorName,
      audioStoragePath: input.audioStoragePath,
      public: true,
    },
    {
      seriesId: input.seriesId,
      episodeId: input.episodeId,
      speakerName: input.narratorName,
      audioStoragePath: input.audioStoragePath,
      public: true,
    },
  ];
}

async function insertRecordingCompat(
  supabase: AdminSupabase,
  input: RecordingInsertInput
): Promise<string> {
  const attempts = buildInsertAttempts(input);
  let lastErrorMessage = "recordings insert failed";

  for (const payload of attempts) {
    const { data, error } = await supabase
      .from("recordings")
      .insert(payload)
      .select("id")
      .single();

    if (!error && data) {
      const row = data as RawRow;
      return String(row.id);
    }

    if (error?.message) {
      lastErrorMessage = error.message;
    }
  }

  throw new Error(lastErrorMessage);
}

async function removeUploadedRecordingAudio(
  supabase: AdminSupabase,
  bucketName: string,
  objectPath: string
): Promise<void> {
  await supabase.storage.from(bucketName).remove([objectPath]);
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

  const wavBytes = await synthesizeNemoWav({
    text: episode.body,
    speaker: speakerId,
    speedScale,
    pitchScale,
    intonationScale,
    volumeScale,
  });

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
    const recordingId = await insertRecordingCompat(adminSupabase, {
      seriesId,
      episodeId,
      narratorName,
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
    await removeUploadedRecordingAudio(adminSupabase, bucketName, objectPath);

    if (error instanceof Error) {
      throw new Error(`recording_insert_failed:${error.message}`);
    }

    throw new Error("recording_insert_failed");
  }
}