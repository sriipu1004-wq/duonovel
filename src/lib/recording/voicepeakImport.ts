import {
  decideRecordingEntryAccess,
  hasApprovedRecordingRequest,
  normalizeRecordingPermissionMode,
  type RecordingPermissionMode,
} from "@/lib/recording/recordingEntry";
import { getAudioFileExtension } from "@/lib/recording/audioUploadPolicy";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type UserSupabase = Awaited<ReturnType<typeof createClient>>;
type AdminSupabase = ReturnType<typeof createAdminClient>;
type RawRow = Record<string, unknown>;

export type VoicepeakImportAccessResult = {
  userId: string;
  seriesTitle: string;
  permissionMode: RecordingPermissionMode;
  hasApprovedRequest: boolean;
};

export type VoicepeakEpisodeSummary = {
  id: string;
  title: string;
  episodeNumber: number;
};

type RecordingInsertInput = {
  seriesId: string;
  episodeId: string;
  narratorName: string;
  audioStoragePath: string;
};

function pickText(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }

  return "";
}

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

  return normalized || "voicepeak";
}

export function getRecordingAudioBucketName(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_RECORDING_BUCKET?.trim() || "recording-audio";
}

export function buildVoicepeakRecordingObjectPath({
  seriesId,
  episodeId,
  narratorName,
  originalFileName,
}: {
  seriesId: string;
  episodeId: string;
  narratorName: string;
  originalFileName: string;
}): string {
  const extension = getAudioFileExtension(originalFileName) || "wav";
  const narratorSegment = sanitizeStorageSegment(narratorName);
  const unique = `${Date.now()}-${crypto.randomUUID()}`;

  return [
    "voicepeak",
    sanitizeStorageSegment(seriesId),
    sanitizeStorageSegment(episodeId),
    `${unique}-${narratorSegment}.${extension}`,
  ].join("/");
}

export async function loadVoicepeakImportAccess(
  supabase: UserSupabase,
  seriesId: string,
  userId: string
): Promise<VoicepeakImportAccessResult> {
  const { data, error } = await supabase
    .from("series")
    .select("id, title, recording_permission_mode")
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

  return {
    userId,
    seriesTitle: pickText(row.title) || "無題",
    permissionMode,
    hasApprovedRequest,
  };
}

export async function fetchVoicepeakEpisodeSummary(
  supabase: UserSupabase,
  seriesId: string,
  episodeId: string
): Promise<VoicepeakEpisodeSummary | null> {
  const { data, error } = await supabase
    .from("episodes")
    .select("*")
    .eq("id", episodeId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const row = data as RawRow;
  const resolvedSeriesId = pickText(row.series_id, row.seriesId);

  if (resolvedSeriesId !== seriesId) {
    return null;
  }

  return {
    id: String(row.id),
    title:
      pickText(row.title, row.episode_title, row.name) || "話タイトル未設定",
    episodeNumber: parseEpisodeNumber(row),
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

export async function insertRecordingCompat(
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

export async function removeUploadedRecordingAudio(
  supabase: AdminSupabase,
  bucketName: string,
  objectPath: string
): Promise<void> {
  await supabase.storage.from(bucketName).remove([objectPath]);
}