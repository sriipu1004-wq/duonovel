import { createHash } from "node:crypto";
import {
  getEpisodeBody,
  getSeriesPublicationStatus,
  isEpisodePubliclyVisible,
  pickText,
  type EpisodeRow,
  type SeriesRow,
} from "@/features/write/writeShared";
import { buildNemoChunks } from "@/lib/recording/nemoChunking";
import { generateNemoRecordingForEpisode } from "@/lib/recording/nemoGeneration";
import { resolveNemoPronunciationDictionary } from "@/lib/recording/nemoPronunciationDictionary";
import { normalizeRecordingPermissionMode } from "@/lib/recording/recordingEntry";
import { createAdminClient } from "@/lib/supabase/admin";

type AdminSupabase = ReturnType<typeof createAdminClient>;

type RecordingRow = Record<string, unknown> & {
  id: string;
  episode_id?: string | null;
  episodeId?: string | null;
  reader_id?: string | null;
  reader_user_id?: string | null;
  readerUserId?: string | null;
  reader_name?: string | null;
  narrator_name?: string | null;
  display_name?: string | null;
  speaker_name?: string | null;
  is_public?: boolean | null;
  public?: boolean | null;
  created_at?: string | null;
  createdAt?: string | null;
};

type QueueRow = Record<string, unknown> & {
  id: string;
  series_id?: string | null;
  episode_id?: string | null;
  generation_status?: string | null;
  generation_reason?: string | null;
  is_stale?: boolean | null;
  source_text_hash?: string | null;
  priority_score?: number | null;
  viewer_count_snapshot?: number | null;
  request_count?: number | null;
  last_request_source?: string | null;
  last_requested_by_user_id?: string | null;
  first_requested_at?: string | null;
  last_requested_at?: string | null;
  last_attempted_at?: string | null;
  last_generated_at?: string | null;
  last_error?: string | null;
  attempt_count?: number | null;
  locked_at?: string | null;
  locked_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type ParsedQueueRow = {
  id: string;
  seriesId: string;
  episodeId: string;
  generationStatus: "pending" | "processing" | "completed" | "failed";
  generationReason:
    | "missing_recording"
    | "source_changed"
    | "manual_request"
    | "manual_generate"
    | "backfill";
  isStale: boolean;
  sourceTextHash: string | null;
  priorityScore: number;
  viewerCountSnapshot: number;
  requestCount: number;
  lastRequestSource: string;
  lastRequestedByUserId: string | null;
  firstRequestedAt: string | null;
  lastRequestedAt: string | null;
  lastAttemptedAt: string | null;
  lastGeneratedAt: string | null;
  lastError: string | null;
  attemptCount: number;
  lockedAt: string | null;
  lockedBy: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

type OfficialRecordingInfo = {
  createdAt: string | null;
};

export type NemoAutoGenerationConfig = {
  userId: string;
  narratorName: string;
  speakerId: number;
};

export type NemoAutoGenerationStepResult = {
  ok: boolean;
  status:
    | "generated"
    | "none_missing"
    | "busy"
    | "config_missing"
    | "skipped";
  generatedEpisodeId?: string;
  reason?: string;
};

export type NemoAutogenBackfillSeedResult = {
  ok: boolean;
  status: "seeded" | "config_missing";
  seriesCount: number;
  scannedEpisodeCount: number;
  seededPendingCount: number;
  seededCompletedCount: number;
  skippedCount: number;
};

declare global {
  var __libreadNemoAutogenRunning: boolean | undefined;
}

const QUEUE_LOCK_TIMEOUT_MS = 15 * 60 * 1000;

const BULK_LOOKUP_CHUNK_SIZE = 50;

function chunkArray<T>(values: T[], size = BULK_LOOKUP_CHUNK_SIZE): T[][] {
  if (values.length === 0) {
    return [];
  }

  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}

function parseSpeakerId(rawValue: string, fallbackRawValue?: string): number | null {
  const candidates = [rawValue, fallbackRawValue ?? ""];

  for (const candidate of candidates) {
    if (!candidate) continue;

    const parsed = Number(candidate);

    if (Number.isInteger(parsed) && parsed >= 0) {
      return parsed;
    }
  }

  return null;
}

function readTextOrNull(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }

  return null;
}

function readBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }

  return fallback;
}

function readNonNegativeInteger(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed >= 0) {
    return Math.trunc(parsed);
  }

  return fallback;
}

function normalizeQueueStatus(
  value: unknown
): "pending" | "processing" | "completed" | "failed" {
  if (
    value === "pending" ||
    value === "processing" ||
    value === "completed" ||
    value === "failed"
  ) {
    return value;
  }

  return "pending";
}

function normalizeQueueReason(
  value: unknown
):
  | "missing_recording"
  | "source_changed"
  | "manual_request"
  | "manual_generate"
  | "backfill" {
  if (
    value === "missing_recording" ||
    value === "source_changed" ||
    value === "manual_request" ||
    value === "manual_generate" ||
    value === "backfill"
  ) {
    return value;
  }

  return "backfill";
}

function parseQueueRow(row: QueueRow): ParsedQueueRow {
  return {
    id: String(row.id),
    seriesId: pickText(row.series_id),
    episodeId: pickText(row.episode_id),
    generationStatus: normalizeQueueStatus(row.generation_status),
    generationReason: normalizeQueueReason(row.generation_reason),
    isStale: readBoolean(row.is_stale, false),
    sourceTextHash: readTextOrNull(row.source_text_hash),
    priorityScore: readNonNegativeInteger(row.priority_score, 0),
    viewerCountSnapshot: readNonNegativeInteger(row.viewer_count_snapshot, 0),
    requestCount: readNonNegativeInteger(row.request_count, 0),
    lastRequestSource: pickText(row.last_request_source) || "system",
    lastRequestedByUserId: readTextOrNull(row.last_requested_by_user_id),
    firstRequestedAt: readTextOrNull(row.first_requested_at),
    lastRequestedAt: readTextOrNull(row.last_requested_at),
    lastAttemptedAt: readTextOrNull(row.last_attempted_at),
    lastGeneratedAt: readTextOrNull(row.last_generated_at),
    lastError: readTextOrNull(row.last_error),
    attemptCount: readNonNegativeInteger(row.attempt_count, 0),
    lockedAt: readTextOrNull(row.locked_at),
    lockedBy: readTextOrNull(row.locked_by),
    createdAt: readTextOrNull(row.created_at),
    updatedAt: readTextOrNull(row.updated_at),
  };
}

function isQueueLockExpired(lockedAt: string | null, nowMs = Date.now()): boolean {
  if (!lockedAt) {
    return true;
  }

  const parsed = new Date(lockedAt).getTime();
  if (!Number.isFinite(parsed)) {
    return true;
  }

  return parsed + QUEUE_LOCK_TIMEOUT_MS <= nowMs;
}

export function resolveNemoAutoGenerationConfig(): NemoAutoGenerationConfig | null {
  const userId = (process.env.VOICEVOX_NEMO_AUTOGEN_USER_ID ?? "").trim();
  const narratorName =
    (process.env.VOICEVOX_NEMO_AUTOGEN_NARRATOR_NAME ?? "").trim() ||
    "VOICEVOX Nemo / ノーマル";
  const speakerId = parseSpeakerId(
    (process.env.VOICEVOX_NEMO_AUTOGEN_SPEAKER_ID ?? "").trim(),
    process.env.VOICEVOX_NEMO_DEFAULT_SPEAKER
  );

  if (!userId || speakerId === null) {
    return null;
  }

  return {
    userId,
    narratorName,
    speakerId,
  };
}

function isPublicRecording(recording: RecordingRow): boolean {
  if (recording.is_public === false) return false;
  if (recording.public === false) return false;
  return true;
}

function getRecordingEpisodeId(recording: RecordingRow): string {
  return pickText(recording.episode_id, recording.episodeId);
}

function getRecordingReaderId(recording: RecordingRow): string {
  return pickText(
    recording.reader_id,
    recording.reader_user_id,
    recording.readerUserId
  );
}

function getRecordingReaderName(recording: RecordingRow): string {
  return (
    pickText(
      recording.reader_name,
      recording.narrator_name,
      recording.display_name,
      recording.speaker_name
    ) || "朗読者未設定"
  );
}

function getRecordingCreatedAt(recording: RecordingRow): string | null {
  return readTextOrNull(recording.created_at) ?? readTextOrNull(recording.createdAt);
}

function hasAutoGeneratedRecordingForEpisode(
  recordings: RecordingRow[],
  episodeId: string,
  config: NemoAutoGenerationConfig
): boolean {
  return recordings.some((recording) => {
    if (!isPublicRecording(recording)) return false;
    if (getRecordingEpisodeId(recording) !== episodeId) return false;

    return (
      getRecordingReaderId(recording) === config.userId ||
      getRecordingReaderName(recording) === config.narratorName
    );
  });
}

function buildEpisodeSourceHash(args: {
  seriesId: string;
  episodeId: string;
  body: string;
}): string | null {
  const { seriesId, episodeId, body } = args;
  const normalizedBody = body.trim();

  if (!normalizedBody) {
    return null;
  }

  const pronunciationDictionary = resolveNemoPronunciationDictionary({
    seriesId,
    episodeId,
  });

  const chunks = buildNemoChunks(normalizedBody, {
    pronunciationDictionary,
  });

  if (chunks.length === 0) {
    return null;
  }

  const serialized = JSON.stringify(
    chunks.map((chunk) => ({
      text: chunk.text,
      pauseAfterMs: chunk.pauseAfterMs,
    }))
  );

  return createHash("sha256").update(serialized).digest("hex");
}

async function fetchSeries(
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

async function fetchPublicOpenSeries(
  supabase: AdminSupabase
): Promise<SeriesRow[]> {
  const { data, error } = await supabase
    .from("series")
    .select("*")
    .eq("publication_status", "public")
    .eq("recording_permission_mode", "open");

  if (error) {
    throw new Error(`series_public_open_lookup_failed:${error.message}`);
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
    .select("*")
    .eq("episode_id", episodeId);

  if (!firstTry.error) {
    return (firstTry.data ?? []) as RecordingRow[];
  }

  const secondTry = await supabase
    .from("recordings")
    .select("*")
    .eq("episodeId", episodeId);

  if (!secondTry.error) {
    return (secondTry.data ?? []) as RecordingRow[];
  }

  return [];
}

async function fetchRecordingsByEpisodeIds(
  supabase: AdminSupabase,
  episodeIds: string[]
): Promise<RecordingRow[]> {
  const uniqueEpisodeIds = [...new Set(episodeIds.filter((value) => value.length > 0))];

  if (uniqueEpisodeIds.length === 0) {
    return [];
  }

  const chunks = chunkArray(uniqueEpisodeIds);
  const firstTryRows: RecordingRow[] = [];

  let firstTryFailed = false;

  for (const chunk of chunks) {
    const result = await supabase
      .from("recordings")
      .select("*")
      .in("episode_id", chunk);

    if (result.error) {
      firstTryFailed = true;
      break;
    }

    firstTryRows.push(...((result.data ?? []) as RecordingRow[]));
  }

  if (!firstTryFailed) {
    return firstTryRows;
  }

  const secondTryRows: RecordingRow[] = [];

  for (const chunk of chunks) {
    const result = await supabase
      .from("recordings")
      .select("*")
      .in("episodeId", chunk);

    if (result.error) {
      throw new Error(`recordings_bulk_lookup_failed:${result.error.message}`);
    }

    secondTryRows.push(...((result.data ?? []) as RecordingRow[]));
  }

  return secondTryRows;
}

async function fetchQueueRowsByEpisodeIds(
  supabase: AdminSupabase,
  episodeIds: string[]
): Promise<Map<string, ParsedQueueRow>> {
  const uniqueEpisodeIds = [...new Set(episodeIds.filter((value) => value.length > 0))];

  if (uniqueEpisodeIds.length === 0) {
    return new Map();
  }

  const chunks = chunkArray(uniqueEpisodeIds);
  const rows: ParsedQueueRow[] = [];

  for (const chunk of chunks) {
    const { data, error } = await supabase
      .from("nemo_generation_queue")
      .select("*")
      .in("episode_id", chunk);

    if (error) {
      throw new Error(`nemo_queue_lookup_failed:${error.message}`);
    }

    rows.push(...((data ?? []) as QueueRow[]).map(parseQueueRow));
  }

  return new Map(rows.map((row) => [row.episodeId, row]));
}

async function fetchOfficialRecordingMap(
  supabase: AdminSupabase,
  episodeIds: string[],
  config: NemoAutoGenerationConfig
): Promise<Map<string, OfficialRecordingInfo>> {
  const rows = await fetchRecordingsByEpisodeIds(supabase, episodeIds);
  const map = new Map<string, OfficialRecordingInfo>();

  for (const row of rows) {
    if (!isPublicRecording(row)) {
      continue;
    }

    const episodeId = getRecordingEpisodeId(row);
    if (!episodeId) {
      continue;
    }

    const isOfficialNarration =
      getRecordingReaderId(row) === config.userId ||
      getRecordingReaderName(row) === config.narratorName;

    if (!isOfficialNarration) {
      continue;
    }

    const createdAt = getRecordingCreatedAt(row);
    const previous = map.get(episodeId);

    if (!previous) {
      map.set(episodeId, { createdAt });
      continue;
    }

    const previousMs = previous.createdAt ? new Date(previous.createdAt).getTime() : 0;
    const nextMs = createdAt ? new Date(createdAt).getTime() : 0;

    if (nextMs >= previousMs) {
      map.set(episodeId, { createdAt });
    }
  }

  return map;
}

async function upsertQueueRows(
  supabase: AdminSupabase,
  payloads: Record<string, unknown>[]
): Promise<void> {
  if (payloads.length === 0) {
    return;
  }

  const normalizedPayloads = payloads.map((payload) => {
    const nextPayload = { ...payload };

    if (nextPayload.id === null || nextPayload.id === undefined || nextPayload.id === "") {
      delete nextPayload.id;
    }

    return nextPayload;
  });

  const { error } = await supabase
    .from("nemo_generation_queue")
    .upsert(normalizedPayloads, { onConflict: "episode_id" });

  if (error) {
    throw new Error(`nemo_queue_upsert_failed:${error.message}`);
  }
}

export async function seedNemoAutogenBackfillQueue(args?: {
  limitEpisodes?: number;
}): Promise<NemoAutogenBackfillSeedResult> {
  const config = resolveNemoAutoGenerationConfig();

  if (!config) {
    return {
      ok: false,
      status: "config_missing",
      seriesCount: 0,
      scannedEpisodeCount: 0,
      seededPendingCount: 0,
      seededCompletedCount: 0,
      skippedCount: 0,
    };
  }

  const supabase = createAdminClient();
  const publicOpenSeries = await fetchPublicOpenSeries(supabase);

  const visibleEpisodes: EpisodeRow[] = [];

  for (const series of publicOpenSeries) {
    const seriesId = String(series.id);
    const episodes = await fetchEpisodesBySeriesId(supabase, seriesId);

    visibleEpisodes.push(
      ...episodes.filter((episode) => isEpisodePubliclyVisible(episode))
    );
  }

  visibleEpisodes.sort((left, right) => {
    const leftSeriesId = pickText(left.series_id, left.seriesId);
    const rightSeriesId = pickText(right.series_id, right.seriesId);

    if (leftSeriesId !== rightSeriesId) {
      return leftSeriesId.localeCompare(rightSeriesId);
    }

    const leftEpisodeNumber = Number(left.episode_number ?? left.episodeNumber ?? 0);
    const rightEpisodeNumber = Number(right.episode_number ?? right.episodeNumber ?? 0);

    if (leftEpisodeNumber !== rightEpisodeNumber) {
      return leftEpisodeNumber - rightEpisodeNumber;
    }

    return String(left.id).localeCompare(String(right.id));
  });

  const limitedEpisodes =
    typeof args?.limitEpisodes === "number" && args.limitEpisodes > 0
      ? visibleEpisodes.slice(0, args.limitEpisodes)
      : visibleEpisodes;

  const episodeIds = limitedEpisodes.map((episode) => String(episode.id));
  const queueRowsByEpisodeId = await fetchQueueRowsByEpisodeIds(supabase, episodeIds);
  const officialRecordingMap = await fetchOfficialRecordingMap(
    supabase,
    episodeIds,
    config
  );

  const nowIso = new Date().toISOString();
  const payloads: Record<string, unknown>[] = [];

  let seededPendingCount = 0;
  let seededCompletedCount = 0;
  let skippedCount = 0;

  for (const episode of limitedEpisodes) {
    const episodeId = String(episode.id);
    const seriesId = pickText(episode.series_id, episode.seriesId);
    const existingQueueRow = queueRowsByEpisodeId.get(episodeId) ?? null;

    if (
      existingQueueRow &&
      existingQueueRow.generationStatus === "processing" &&
      !isQueueLockExpired(existingQueueRow.lockedAt)
    ) {
      skippedCount += 1;
      continue;
    }

    const body = getEpisodeBody(episode);
    const sourceTextHash = buildEpisodeSourceHash({
      seriesId,
      episodeId,
      body,
    });

    const officialRecording = officialRecordingMap.get(episodeId) ?? null;
    const hasOfficialRecording = !!officialRecording;
    const isStale =
      !!sourceTextHash &&
      !!existingQueueRow?.sourceTextHash &&
      existingQueueRow.sourceTextHash !== sourceTextHash;

    if (!hasOfficialRecording && !sourceTextHash) {
      skippedCount += 1;
      continue;
    }

    const nextStatus: "pending" | "completed" =
      !hasOfficialRecording || isStale ? "pending" : "completed";

    const nextReason:
      | "missing_recording"
      | "source_changed"
      | "backfill" =
      !hasOfficialRecording
        ? "missing_recording"
        : isStale
          ? "source_changed"
          : "backfill";

    const nextPriorityScore =
      nextStatus === "pending"
        ? nextReason === "missing_recording"
          ? 300
          : 200
        : 0;

    if (nextStatus === "pending") {
      seededPendingCount += 1;
    } else {
      seededCompletedCount += 1;
    }

    payloads.push({
      ...(existingQueueRow?.id ? { id: existingQueueRow.id } : {}),
      series_id: seriesId,
      episode_id: episodeId,
      generation_status: nextStatus,
      generation_reason: nextReason,
      is_stale: isStale,
      source_text_hash: sourceTextHash,
      priority_score:
        nextStatus === "pending"
          ? Math.max(existingQueueRow?.priorityScore ?? 0, nextPriorityScore)
          : 0,
      viewer_count_snapshot: existingQueueRow?.viewerCountSnapshot ?? 0,
      request_count: existingQueueRow?.requestCount ?? 1,
      last_request_source: existingQueueRow?.lastRequestSource ?? "backfill_seed",
      last_requested_by_user_id: existingQueueRow?.lastRequestedByUserId,
      first_requested_at: existingQueueRow?.firstRequestedAt ?? nowIso,
      last_requested_at: existingQueueRow?.lastRequestedAt ?? nowIso,
      last_attempted_at: existingQueueRow?.lastAttemptedAt,
      last_generated_at:
        nextStatus === "completed"
          ? existingQueueRow?.lastGeneratedAt ??
            officialRecording?.createdAt ??
            nowIso
          : existingQueueRow?.lastGeneratedAt,
      last_error: nextStatus === "completed" ? null : existingQueueRow?.lastError,
      attempt_count: existingQueueRow?.attemptCount ?? 0,
      locked_at: null,
      locked_by: null,
      created_at: existingQueueRow?.createdAt ?? nowIso,
      updated_at: nowIso,
    });
  }

  await upsertQueueRows(supabase, payloads);

  return {
    ok: true,
    status: "seeded",
    seriesCount: publicOpenSeries.length,
    scannedEpisodeCount: limitedEpisodes.length,
    seededPendingCount,
    seededCompletedCount,
    skippedCount,
  };
}

async function claimNextPendingQueueJob(
  supabase: AdminSupabase
): Promise<ParsedQueueRow | null> {
  const { data, error } = await supabase
    .from("nemo_generation_queue")
    .select("*")
    .in("generation_status", ["pending", "failed", "processing"])
    .order("priority_score", { ascending: false })
    .order("updated_at", { ascending: true })
    .limit(100);

  if (error) {
    throw new Error(`nemo_queue_claim_lookup_failed:${error.message}`);
  }

  const candidates = ((data ?? []) as QueueRow[])
    .map(parseQueueRow)
    .filter((candidate) =>
      candidate.generationStatus === "processing"
        ? isQueueLockExpired(candidate.lockedAt)
        : true
    );

  for (const candidate of candidates) {
    const nowIso = new Date().toISOString();

    let claimQuery = supabase
      .from("nemo_generation_queue")
      .update({
        generation_status: "processing",
        locked_at: nowIso,
        locked_by: "global_backfill_worker",
        last_attempted_at: nowIso,
        attempt_count: candidate.attemptCount + 1,
        last_error: null,
        updated_at: nowIso,
      })
      .eq("id", candidate.id);

    if (candidate.generationStatus === "processing") {
      claimQuery = claimQuery.eq("generation_status", "processing");

      if (candidate.lockedAt) {
        claimQuery = claimQuery.eq("locked_at", candidate.lockedAt);
      }
    } else if (candidate.generationStatus === "pending") {
      claimQuery = claimQuery.eq("generation_status", "pending");
    } else {
      claimQuery = claimQuery.eq("generation_status", "failed");
    }

    const {
      data: claimed,
      error: claimError,
    } = await claimQuery.select("*").maybeSingle();

    if (!claimError && claimed) {
      return parseQueueRow(claimed as QueueRow);
    }
  }

  return null;
}

async function markQueueJobCompleted(
  supabase: AdminSupabase,
  job: ParsedQueueRow,
  generatedAt?: string | null
): Promise<void> {
  const nowIso = new Date().toISOString();

  const { error } = await supabase
    .from("nemo_generation_queue")
    .update({
      generation_status: "completed",
      is_stale: false,
      last_generated_at: generatedAt ?? job.lastGeneratedAt ?? nowIso,
      last_error: null,
      locked_at: null,
      locked_by: null,
      updated_at: nowIso,
    })
    .eq("id", job.id);

  if (error) {
    throw new Error(`nemo_queue_complete_failed:${error.message}`);
  }
}

async function markQueueJobFailed(
  supabase: AdminSupabase,
  job: ParsedQueueRow,
  errorValue: unknown
): Promise<void> {
  const nowIso = new Date().toISOString();
  const detail =
    errorValue instanceof Error ? errorValue.message : String(errorValue);

  const { error } = await supabase
    .from("nemo_generation_queue")
    .update({
      generation_status: "failed",
      last_error: detail,
      locked_at: null,
      locked_by: null,
      updated_at: nowIso,
    })
    .eq("id", job.id);

  if (error) {
    throw new Error(`nemo_queue_fail_failed:${error.message}`);
  }
}

export async function runNextPendingNemoAutogenJob(): Promise<NemoAutoGenerationStepResult> {
  const config = resolveNemoAutoGenerationConfig();

  if (!config) {
    return {
      ok: false,
      status: "config_missing",
      reason: "autogen_env_missing",
    };
  }

  if (globalThis.__libreadNemoAutogenRunning) {
    return {
      ok: true,
      status: "busy",
    };
  }

  globalThis.__libreadNemoAutogenRunning = true;

  try {
    const adminSupabase = createAdminClient();
    const job = await claimNextPendingQueueJob(adminSupabase);

    if (!job) {
      return {
        ok: true,
        status: "none_missing",
      };
    }

    const series = await fetchSeries(adminSupabase, job.seriesId);

    if (!series) {
      await markQueueJobFailed(adminSupabase, job, new Error("series_not_found"));
      return {
        ok: false,
        status: "skipped",
        reason: "series_not_found",
      };
    }

    if (getSeriesPublicationStatus(series) !== "public") {
      await markQueueJobCompleted(adminSupabase, job, job.lastGeneratedAt);
      return {
        ok: true,
        status: "skipped",
        reason: "series_not_public",
      };
    }

    const permissionMode = normalizeRecordingPermissionMode(
      series.recording_permission_mode
    );

    if (permissionMode !== "open") {
      await markQueueJobCompleted(adminSupabase, job, job.lastGeneratedAt);
      return {
        ok: true,
        status: "skipped",
        reason: "permission_mode_not_open",
      };
    }

    const episodes = await fetchEpisodesBySeriesId(adminSupabase, job.seriesId);
    const targetEpisode = episodes
      .filter((episode) => isEpisodePubliclyVisible(episode))
      .find((episode) => String(episode.id) === job.episodeId);

    if (!targetEpisode) {
      await markQueueJobCompleted(adminSupabase, job, job.lastGeneratedAt);
      return {
        ok: true,
        status: "skipped",
        reason: "episode_not_public",
      };
    }

    const recordings = await fetchRecordingsByEpisodeId(adminSupabase, job.episodeId);

    if (hasAutoGeneratedRecordingForEpisode(recordings, job.episodeId, config) && !job.isStale) {
      await markQueueJobCompleted(adminSupabase, job, job.lastGeneratedAt);
      return {
        ok: true,
        status: "none_missing",
      };
    }

    try {
      await generateNemoRecordingForEpisode({
        supabase: adminSupabase,
        userId: config.userId,
        seriesId: job.seriesId,
        episodeId: job.episodeId,
        narratorName: config.narratorName,
        speakerId: config.speakerId,
      });

      await markQueueJobCompleted(adminSupabase, job, new Date().toISOString());

      return {
        ok: true,
        status: "generated",
        generatedEpisodeId: job.episodeId,
      };
    } catch (error) {
      await markQueueJobFailed(adminSupabase, job, error);
      throw error;
    }
  } finally {
    globalThis.__libreadNemoAutogenRunning = false;
  }
}

export async function runNemoAutoGenerationStep(args: {
  seriesId: string;
  episodeIds: string[];
}): Promise<NemoAutoGenerationStepResult> {
  const { seriesId, episodeIds } = args;
  const config = resolveNemoAutoGenerationConfig();

  if (!config) {
    return {
      ok: false,
      status: "config_missing",
      reason: "autogen_env_missing",
    };
  }

  if (globalThis.__libreadNemoAutogenRunning) {
    return {
      ok: true,
      status: "busy",
    };
  }

  globalThis.__libreadNemoAutogenRunning = true;

  try {
    const adminSupabase = createAdminClient();
    const series = await fetchSeries(adminSupabase, seriesId);

    if (!series) {
      return {
        ok: false,
        status: "skipped",
        reason: "series_not_found",
      };
    }

    if (getSeriesPublicationStatus(series) !== "public") {
      return {
        ok: true,
        status: "skipped",
        reason: "series_not_public",
      };
    }

    const permissionMode = normalizeRecordingPermissionMode(
      series.recording_permission_mode
    );

    if (permissionMode !== "open") {
      return {
        ok: true,
        status: "skipped",
        reason: "permission_mode_not_open",
      };
    }

    const episodes = (await fetchEpisodesBySeriesId(adminSupabase, seriesId))
      .filter((episode) => isEpisodePubliclyVisible(episode))
      .filter((episode) => episodeIds.includes(String(episode.id)));

    for (const episode of episodes) {
      const recordings = await fetchRecordingsByEpisodeId(adminSupabase, String(episode.id));

      if (
        hasAutoGeneratedRecordingForEpisode(recordings, String(episode.id), config)
      ) {
        continue;
      }

      await generateNemoRecordingForEpisode({
        supabase: adminSupabase,
        userId: config.userId,
        seriesId,
        episodeId: String(episode.id),
        narratorName: config.narratorName,
        speakerId: config.speakerId,
      });

      return {
        ok: true,
        status: "generated",
        generatedEpisodeId: String(episode.id),
      };
    }

    return {
      ok: true,
      status: "none_missing",
    };
  } finally {
    globalThis.__libreadNemoAutogenRunning = false;
  }
}