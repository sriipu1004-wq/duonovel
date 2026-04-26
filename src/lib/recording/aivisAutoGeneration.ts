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
  episode_id?: string | null;
  episodeId?: string | null;
  reader_name?: string | null;
  voice_model_id?: string | null;
  voiceModelId?: string | null;
  is_public?: boolean | null;
  public?: boolean | null;
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

function getRecordingEpisodeId(recording: RecordingRow): string {
  return pickText(recording.episode_id, recording.episodeId);
}

function getRecordingVoiceModelId(recording: RecordingRow): string {
  return pickText(recording.voice_model_id, recording.voiceModelId);
}

function getVoiceModelDisplayName(voiceModel: VoiceModelRow): string {
  return (
    pickText(
      voiceModel.display_name,
      voiceModel.name
    ) || "Aivis 自動朗読"
  );
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