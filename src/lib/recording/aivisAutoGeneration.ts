import {
  getEpisodeBody,
  getEpisodeNumber,
  isEpisodePubliclyVisible,
  pickText,
  sortEpisodes,
  type EpisodeRow,
  type SeriesRow,
} from "@/features/write/writeShared";
import { generateAivisRecordingForEpisode } from "@/lib/recording/aivisGeneration";
import { buildNemoTimingObjectPathFromAudioObjectPath } from "@/lib/recording/nemoTiming";
import { createAdminClient } from "@/lib/supabase/admin";

type AdminSupabase = ReturnType<typeof createAdminClient>;

type VoiceModelRow = Record<string, unknown> & {
  id: string;
  provider?: string | null;
  display_name?: string | null;
  name?: string | null;
  speaker_id?: number | string | null;
  commercial_allowed?: boolean | null;
  is_active?: boolean | null;
};

type RecordingRow = Record<string, unknown> & {
  id: string;
  series_id?: string | null;
  seriesId?: string | null;
  episode_id?: string | null;
  episodeId?: string | null;
  reader_name?: string | null;
  voice_model_id?: string | null;
  voiceModelId?: string | null;
  audio_storage_path?: string | null;
  audioStoragePath?: string | null;
  is_public?: boolean | null;
  public?: boolean | null;
  created_at?: string | null;
};

export type AivisAutoGenerationStepResult = {
  ok: boolean;
  status:
    | "generated"
    | "none_missing"
    | "model_missing"
    | "skipped"
    | "busy";
  generatedEpisodeId?: string;
  generatedSeriesId?: string;
  generatedVoiceModelId?: string;
  narratorName?: string;
  reason?: string;
};

declare global {
  var __libreadAivisAutogenRunning: boolean | undefined;
}

const AIVIS_REGENERATE_BEFORE_ISO = "2026-04-26T22:00:00.000Z";
const STALE_AIVIS_LOOKUP_LIMIT = 25;

function parseSpeakerId(value: unknown): number | null {
  const parsed = Number(value);

  if (Number.isInteger(parsed) && parsed >= 0) {
    return parsed;
  }

  return null;
}

function readNonNegativeInteger(value: unknown, fallback = 0): number {
  const parsed = Number(value);

  if (Number.isFinite(parsed) && parsed >= 0) {
    return Math.trunc(parsed);
  }

  return fallback;
}

function readSeriesPopularityScore(series: SeriesRow | null | undefined): number {
  if (!series) {
    return 0;
  }

  const row = series as Record<string, unknown>;

  const candidates: unknown[] = [
    row.popularity_score,
    row.ranking_score,
    row.view_count,
    row.viewer_count,
    row.total_views,
    row.total_view_count,
    row.weekly_view_count,
    row.favorite_count,
    row.like_count,
    row.reaction_count,
  ];

  return candidates.reduce<number>(
    (max, candidate) => Math.max(max, readNonNegativeInteger(candidate, 0)),
    0
  );
}

function isPublicRecording(recording: RecordingRow): boolean {
  if (recording.is_public === false) return false;
  if (recording.public === false) return false;
  return true;
}

function getRecordingSeriesId(recording: RecordingRow): string {
  return pickText(recording.series_id, recording.seriesId);
}

function getRecordingEpisodeId(recording: RecordingRow): string {
  return pickText(recording.episode_id, recording.episodeId);
}

function getRecordingVoiceModelId(recording: RecordingRow): string {
  return pickText(recording.voice_model_id, recording.voiceModelId);
}

function getRecordingAudioStoragePath(recording: RecordingRow): string {
  return pickText(recording.audio_storage_path, recording.audioStoragePath);
}

function getVoiceModelDisplayName(voiceModel: VoiceModelRow): string {
  return (
    pickText(
      voiceModel.display_name,
      voiceModel.name
    ) || "Aivis 自動朗読"
  );
}

function getRecordingAudioBucketName(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_RECORDING_BUCKET?.trim() || "recording-audio";
}

function getStorageObjectPathFromPublicUrl(
  publicUrl: string,
  bucketName: string
): string {
  const trimmed = publicUrl.trim();

  if (!trimmed) {
    return "";
  }

  const marker = `/storage/v1/object/public/${bucketName}/`;
  const markerIndex = trimmed.indexOf(marker);

  if (markerIndex < 0) {
    return "";
  }

  const rawPath = trimmed.slice(markerIndex + marker.length).split("?")[0] ?? "";

  try {
    return decodeURIComponent(rawPath);
  } catch {
    return rawPath;
  }
}

function buildStorageCleanupPathsForRecording(recording: RecordingRow): string[] {
  const bucketName = getRecordingAudioBucketName();
  const audioPath = getStorageObjectPathFromPublicUrl(
    getRecordingAudioStoragePath(recording),
    bucketName
  );

  if (!audioPath) {
    return [];
  }

  return [
    audioPath,
    buildNemoTimingObjectPathFromAudioObjectPath(audioPath),
  ];
}

async function removeStorageObjectPaths(
  supabase: AdminSupabase,
  objectPaths: string[]
): Promise<void> {
  const bucketName = getRecordingAudioBucketName();
  const filtered = [...new Set(objectPaths.filter((path) => path.trim().length > 0))];

  if (filtered.length === 0) {
    return;
  }

  await supabase.storage.from(bucketName).remove(filtered);
}

async function fetchAivisVoiceModels(
  supabase: AdminSupabase
): Promise<VoiceModelRow[]> {
  const { data, error } = await supabase
    .from("voice_models")
    .select(
      "id, provider, display_name, name, speaker_id, commercial_allowed, is_active"
    )
    .eq("provider", "aivis")
    .eq("commercial_allowed", true)
    .eq("is_active", true)
    .order("display_name", { ascending: true });

  if (error) {
    throw new Error(`aivis_voice_models_lookup_failed:${error.message}`);
  }

  return (data ?? []) as VoiceModelRow[];
}

async function fetchPublicOpenSeries(
  supabase: AdminSupabase
): Promise<SeriesRow[]> {
  const { data, error } = await supabase
    .from("series")
    .select("*")
    .eq("publication_status", "public")
    .eq("recording_permission_mode", "open");

  if (error) {
    throw new Error(`aivis_public_open_series_lookup_failed:${error.message}`);
  }

  return (data ?? []) as SeriesRow[];
}

async function fetchSeriesById(
  supabase: AdminSupabase,
  seriesId: string
): Promise<SeriesRow | null> {
  const { data, error } = await supabase
    .from("series")
    .select("*")
    .eq("id", seriesId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as SeriesRow;
}

async function fetchEpisodeById(
  supabase: AdminSupabase,
  episodeId: string
): Promise<EpisodeRow | null> {
  const { data, error } = await supabase
    .from("episodes")
    .select("*")
    .eq("id", episodeId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as EpisodeRow;
}

async function fetchEpisodesBySeriesId(
  supabase: AdminSupabase,
  seriesId: string
): Promise<EpisodeRow[]> {
  const firstTry = await supabase
    .from("episodes")
    .select("*")
    .eq("series_id", seriesId);

  if (!firstTry.error) {
    return (firstTry.data ?? []) as EpisodeRow[];
  }

  const secondTry = await supabase
    .from("episodes")
    .select("*")
    .eq("seriesId", seriesId);

  if (!secondTry.error) {
    return (secondTry.data ?? []) as EpisodeRow[];
  }

  return [];
}

async function fetchRecordingsByEpisodeId(
  supabase: AdminSupabase,
  episodeId: string
): Promise<RecordingRow[]> {
  const firstTry = await supabase
    .from("recordings")
    .select(
      "id, episode_id, reader_name, voice_model_id, is_public, created_at"
    )
    .eq("episode_id", episodeId);

  if (!firstTry.error) {
    return (firstTry.data ?? []) as RecordingRow[];
  }

  const secondTry = await supabase
    .from("recordings")
    .select(
      "id, episodeId, reader_name, voice_model_id, is_public, created_at"
    )
    .eq("episodeId", episodeId);

  if (!secondTry.error) {
    return (secondTry.data ?? []) as RecordingRow[];
  }

  throw new Error(`recording_lookup_failed:${secondTry.error.message}`);
}

async function fetchStaleAivisRecordings(
  supabase: AdminSupabase,
  voiceModelIds: string[]
): Promise<RecordingRow[]> {
  if (voiceModelIds.length === 0) {
    return [];
  }

  const firstTry = await supabase
    .from("recordings")
    .select(
      "id, series_id, episode_id, reader_name, voice_model_id, audio_storage_path, is_public, created_at"
    )
    .in("voice_model_id", voiceModelIds)
    .lt("created_at", AIVIS_REGENERATE_BEFORE_ISO)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(STALE_AIVIS_LOOKUP_LIMIT);

  if (!firstTry.error) {
    return (firstTry.data ?? []) as RecordingRow[];
  }

  const secondTry = await supabase
    .from("recordings")
    .select(
      "id, seriesId, episodeId, reader_name, voice_model_id, audio_storage_path, is_public, created_at"
    )
    .in("voice_model_id", voiceModelIds)
    .lt("created_at", AIVIS_REGENERATE_BEFORE_ISO)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(STALE_AIVIS_LOOKUP_LIMIT);

  if (!secondTry.error) {
    return (secondTry.data ?? []) as RecordingRow[];
  }

  throw new Error(`stale_aivis_recording_lookup_failed:${secondTry.error.message}`);
}

function hasRecordingForVoiceModel(args: {
  recordings: RecordingRow[];
  episodeId: string;
  voiceModelId: string;
  narratorName: string;
}): boolean {
  return args.recordings.some((recording) => {
    if (!isPublicRecording(recording)) return false;
    if (getRecordingEpisodeId(recording) !== args.episodeId) return false;

    const recordingVoiceModelId = getRecordingVoiceModelId(recording);

    if (recordingVoiceModelId) {
      return recordingVoiceModelId === args.voiceModelId;
    }

    return pickText(recording.reader_name) === args.narratorName;
  });
}

function sortSeriesForAivisAutogen(seriesRows: SeriesRow[]): SeriesRow[] {
  return [...seriesRows].sort((left, right) => {
    const leftScore = readSeriesPopularityScore(left);
    const rightScore = readSeriesPopularityScore(right);

    if (leftScore !== rightScore) {
      return rightScore - leftScore;
    }

    return String(left.id).localeCompare(String(right.id));
  });
}

function isPublicOpenSeries(series: SeriesRow | null): boolean {
  if (!series) {
    return false;
  }

  const row = series as Record<string, unknown>;

  return (
    row.publication_status === "public" &&
    row.recording_permission_mode === "open"
  );
}

async function regenerateNextStaleAivisRecording(args: {
  supabase: AdminSupabase;
  officialUserId: string;
  voiceModels: VoiceModelRow[];
}): Promise<AivisAutoGenerationStepResult | null> {
  const voiceModelMap = new Map(
    args.voiceModels.map((voiceModel) => [String(voiceModel.id), voiceModel])
  );

  const staleRecordings = await fetchStaleAivisRecordings(
    args.supabase,
    Array.from(voiceModelMap.keys())
  );

  for (const staleRecording of staleRecordings) {
    const voiceModelId = getRecordingVoiceModelId(staleRecording);
    const voiceModel = voiceModelMap.get(voiceModelId) ?? null;

    if (!voiceModel) {
      continue;
    }

    const speakerId = parseSpeakerId(voiceModel.speaker_id);
    if (speakerId === null) {
      continue;
    }

    const seriesId = getRecordingSeriesId(staleRecording);
    const episodeId = getRecordingEpisodeId(staleRecording);

    if (!seriesId || !episodeId) {
      continue;
    }

    const series = await fetchSeriesById(args.supabase, seriesId);
    if (!isPublicOpenSeries(series)) {
      continue;
    }

    const episode = await fetchEpisodeById(args.supabase, episodeId);
    if (!episode || !isEpisodePubliclyVisible(episode)) {
      continue;
    }

    const body = getEpisodeBody(episode);
    if (!body.trim()) {
      continue;
    }

    const narratorName = getVoiceModelDisplayName(voiceModel);
    const cleanupPaths = buildStorageCleanupPathsForRecording(staleRecording);

    const { error: deleteError } = await args.supabase
      .from("recordings")
      .delete()
      .eq("id", staleRecording.id);

    if (deleteError) {
      throw new Error(`stale_aivis_recording_delete_failed:${deleteError.message}`);
    }

    const result = await generateAivisRecordingForEpisode({
      supabase: args.supabase,
      userId: args.officialUserId,
      seriesId,
      episodeId,
      narratorName,
      speakerId,
      voiceModelId,
    });

    await removeStorageObjectPaths(args.supabase, cleanupPaths);

    return {
      ok: true,
      status: "generated",
      generatedEpisodeId: episodeId,
      generatedSeriesId: seriesId,
      generatedVoiceModelId: voiceModelId,
      narratorName,
      reason: `stale_aivis_regenerated_before_2026-04-27_07:00_JST:episode_${getEpisodeNumber(episode)}:${result.episodeTitle}`,
    };
  }

  return null;
}

export async function runNextPendingAivisAutogenJob(args: {
  officialUserId: string;
}): Promise<AivisAutoGenerationStepResult> {
  if (globalThis.__libreadAivisAutogenRunning) {
    return {
      ok: false,
      status: "busy",
      reason: "aivis_autogen_already_running",
    };
  }

  globalThis.__libreadAivisAutogenRunning = true;

  try {
    const supabase = createAdminClient();
    const voiceModels = await fetchAivisVoiceModels(supabase);

    if (voiceModels.length === 0) {
      return {
        ok: false,
        status: "model_missing",
        reason: "active_commercial_aivis_voice_model_missing",
      };
    }

    const regeneratedStale = await regenerateNextStaleAivisRecording({
      supabase,
      officialUserId: args.officialUserId,
      voiceModels,
    });

    if (regeneratedStale) {
      return regeneratedStale;
    }

    const publicOpenSeries = sortSeriesForAivisAutogen(
      await fetchPublicOpenSeries(supabase)
    );

    for (const series of publicOpenSeries) {
      const seriesId = String(series.id);
      const episodes = sortEpisodes(
        (await fetchEpisodesBySeriesId(supabase, seriesId)).filter((episode) =>
          isEpisodePubliclyVisible(episode)
        )
      );

      for (const episode of episodes) {
        const episodeId = String(episode.id);
        const body = getEpisodeBody(episode);

        if (!body.trim()) {
          continue;
        }

        const recordings = await fetchRecordingsByEpisodeId(supabase, episodeId);

        for (const voiceModel of voiceModels) {
          const voiceModelId = String(voiceModel.id);
          const narratorName = getVoiceModelDisplayName(voiceModel);
          const speakerId = parseSpeakerId(voiceModel.speaker_id);

          if (speakerId === null) {
            continue;
          }

          if (
            hasRecordingForVoiceModel({
              recordings,
              episodeId,
              voiceModelId,
              narratorName,
            })
          ) {
            continue;
          }

          const result = await generateAivisRecordingForEpisode({
            supabase,
            userId: args.officialUserId,
            seriesId,
            episodeId,
            narratorName,
            speakerId,
            voiceModelId,
          });

          return {
            ok: true,
            status: "generated",
            generatedEpisodeId: episodeId,
            generatedSeriesId: seriesId,
            generatedVoiceModelId: voiceModelId,
            narratorName,
            reason: `episode_${getEpisodeNumber(episode)}:${result.episodeTitle}`,
          };
        }
      }
    }

    return {
      ok: true,
      status: "none_missing",
      reason: "aivis_recordings_already_generated",
    };
  } finally {
    globalThis.__libreadAivisAutogenRunning = false;
  }
}