import { createHash } from "node:crypto";
import {
  getEpisodeBody,
  isEpisodePubliclyVisible,
  pickText,
  sortEpisodes,
  type EpisodeRow,
} from "@/features/write/writeShared";
import { buildNemoChunks } from "@/lib/recording/nemoChunking";
import { resolveNemoPronunciationDictionary } from "@/lib/recording/nemoPronunciationDictionary";
import { createAdminClient } from "@/lib/supabase/admin";

type AdminSupabase = ReturnType<typeof createAdminClient>;
type RawRow = Record<string, unknown>;

type RecordingRow = RawRow & {
  id: string;
  episode_id?: string | null;
  episodeId?: string | null;
  reader_id?: string | null;
  reader_user_id?: string | null;
  readerUserId?: string | null;
  is_public?: boolean | null;
  public?: boolean | null;
  created_at?: string | null;
  createdAt?: string | null;
};

type QueueRow = RawRow & {
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

export type NemoGenerationQueueStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed";

export type NemoGenerationQueueReason =
  | "missing_recording"
  | "source_changed"
  | "manual_request"
  | "manual_generate"
  | "backfill";

export type NemoGenerationQueueJob = {
  id: string;
  seriesId: string;
  episodeId: string;
  generationStatus: NemoGenerationQueueStatus;
  generationReason: NemoGenerationQueueReason;
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

export type SyncNemoGenerationQueueArgs = {
  supabase: AdminSupabase;
  seriesId: string;
  episodeIds: string[];
  nemoReaderUserId: string;
  requestSource: string;
  requestedByUserId?: string | null;
  viewerCountSnapshot?: number;
  priorityBoost?: number;
};

export type SyncNemoGenerationQueueResult = {
  touchedEpisodeIds: string[];
  queuedEpisodeIds: string[];
  completedEpisodeIds: string[];
};

type ClaimNemoGenerationQueueJobArgs = {
  supabase: AdminSupabase;
  workerId: string;
  seriesId?: string;
  episodeIds?: string[];
};

type MarkNemoGenerationQueueJobCompletedArgs = {
  supabase: AdminSupabase;
  job: NemoGenerationQueueJob;
  sourceTextHash?: string | null;
};

type MarkNemoGenerationQueueJobFailedArgs = {
  supabase: AdminSupabase;
  jobId: string;
  error: unknown;
};

type MarkEpisodeGeneratedInNemoQueueArgs = {
  supabase: AdminSupabase;
  seriesId: string;
  episodeId: string;
  requestedByUserId?: string | null;
};

const QUEUE_LOCK_TIMEOUT_MS = 15 * 60 * 1000;

function readNonNegativeInteger(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed >= 0) {
    return Math.trunc(parsed);
  }

  return fallback;
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

function readTextOrNull(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }

  return null;
}

function normalizeQueueStatus(value: unknown): NemoGenerationQueueStatus {
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

function normalizeQueueReason(value: unknown): NemoGenerationQueueReason {
  if (
    value === "missing_recording" ||
    value === "source_changed" ||
    value === "manual_request" ||
    value === "manual_generate" ||
    value === "backfill"
  ) {
    return value;
  }

  return "missing_recording";
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

function isPublicRecording(recording: RecordingRow): boolean {
  if (recording.is_public === false) return false;
  if (recording.public === false) return false;
  return true;
}

function getRecordingCreatedAt(
  recording: RecordingRow | null | undefined
): string | null {
  if (!recording) {
    return null;
  }

  return (
    readTextOrNull(recording.created_at) ??
    readTextOrNull(recording.createdAt)
  );
}

function getQueueJobFromRow(row: QueueRow): NemoGenerationQueueJob {
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

function buildNemoSourceTextHash(args: {
  seriesId: string;
  episodeId: string;
  episodeBody: string;
}): string | null {
  const { seriesId, episodeId, episodeBody } = args;
  const normalizedBody = episodeBody.trim();

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

function calculatePriorityScore(args: {
  hasRecording: boolean;
  isStale: boolean;
  viewerCountSnapshot: number;
  requestCount: number;
  priorityBoost: number;
}): number {
  const {
    hasRecording,
    isStale,
    viewerCountSnapshot,
    requestCount,
    priorityBoost,
  } = args;

  let score = Math.max(0, Math.trunc(priorityBoost));

  if (!hasRecording) {
    score += 300;
  }

  if (isStale) {
    score += 200;
  }

  if (viewerCountSnapshot > 0) {
    score += 1000;
    score += Math.min(viewerCountSnapshot, 50) * 20;
  }

  score += Math.min(requestCount, 100) * 5;

  return score;
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

async function fetchRecordingsByEpisodeIds(
  supabase: AdminSupabase,
  episodeIds: string[]
): Promise<RecordingRow[]> {
  const uniqueEpisodeIds = [...new Set(episodeIds.filter((value) => value.length > 0))];

  if (uniqueEpisodeIds.length === 0) {
    return [];
  }

  const firstTry = await supabase
    .from("recordings")
    .select("*")
    .in("episode_id", uniqueEpisodeIds);

  if (!firstTry.error) {
    return (firstTry.data ?? []) as RecordingRow[];
  }

  const secondTry = await supabase
    .from("recordings")
    .select("*")
    .in("episodeId", uniqueEpisodeIds);

  if (!secondTry.error) {
    return (secondTry.data ?? []) as RecordingRow[];
  }

  return [];
}

async function fetchQueueRowsByEpisodeIds(
  supabase: AdminSupabase,
  episodeIds: string[]
): Promise<NemoGenerationQueueJob[]> {
  const uniqueEpisodeIds = [...new Set(episodeIds.filter((value) => value.length > 0))];

  if (uniqueEpisodeIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("nemo_generation_queue")
    .select("*")
    .in("episode_id", uniqueEpisodeIds);

  if (error) {
    throw new Error(`nemo_queue_lookup_failed:${error.message}`);
  }

  return ((data ?? []) as QueueRow[]).map(getQueueJobFromRow);
}

async function upsertQueueRows(
  supabase: AdminSupabase,
  payloads: Record<string, unknown>[]
): Promise<void> {
  if (payloads.length === 0) {
    return;
  }

  const { error } = await supabase
    .from("nemo_generation_queue")
    .upsert(payloads, { onConflict: "episode_id" });

  if (error) {
    throw new Error(`nemo_queue_upsert_failed:${error.message}`);
  }
}

function findLatestAutoGeneratedRecording(
  recordings: RecordingRow[],
  episodeId: string,
  nemoReaderUserId: string
): RecordingRow | null {
  const candidates = recordings
    .filter((recording) => isPublicRecording(recording))
    .filter((recording) => getRecordingEpisodeId(recording) === episodeId)
    .filter((recording) => getRecordingReaderId(recording) === nemoReaderUserId)
    .sort((left, right) => {
      const leftMs = new Date(getRecordingCreatedAt(left) ?? 0).getTime();
      const rightMs = new Date(getRecordingCreatedAt(right) ?? 0).getTime();
      return rightMs - leftMs;
    });

  return candidates[0] ?? null;
}

export async function syncNemoGenerationQueueForEpisodes(
  args: SyncNemoGenerationQueueArgs
): Promise<SyncNemoGenerationQueueResult> {
  const {
    supabase,
    seriesId,
    episodeIds,
    nemoReaderUserId,
    requestSource,
    requestedByUserId = null,
    viewerCountSnapshot = 0,
    priorityBoost = 0,
  } = args;

  const targetEpisodeIds = [...new Set(episodeIds.map((value) => value.trim()).filter(Boolean))];

  if (targetEpisodeIds.length === 0) {
    return {
      touchedEpisodeIds: [],
      queuedEpisodeIds: [],
      completedEpisodeIds: [],
    };
  }

  const allSeriesEpisodes = await fetchEpisodesBySeriesId(supabase, seriesId);
  const visibleEpisodes = sortEpisodes(allSeriesEpisodes)
    .filter((episode) => isEpisodePubliclyVisible(episode))
    .filter((episode) => targetEpisodeIds.includes(String(episode.id)));

  if (visibleEpisodes.length === 0) {
    return {
      touchedEpisodeIds: [],
      queuedEpisodeIds: [],
      completedEpisodeIds: [],
    };
  }

  const visibleEpisodeIds = visibleEpisodes.map((episode) => String(episode.id));
  const recordings = await fetchRecordingsByEpisodeIds(supabase, visibleEpisodeIds);
  const existingRows = await fetchQueueRowsByEpisodeIds(supabase, visibleEpisodeIds);
  const existingRowMap = new Map(existingRows.map((row) => [row.episodeId, row]));
  const nowIso = new Date().toISOString();

  const payloads: Record<string, unknown>[] = [];
  const queuedEpisodeIds: string[] = [];
  const completedEpisodeIds: string[] = [];

  for (const episode of visibleEpisodes) {
    const episodeId = String(episode.id);
    const episodeBody = getEpisodeBody(episode);
    const sourceTextHash = buildNemoSourceTextHash({
      seriesId,
      episodeId,
      episodeBody,
    });

    if (!sourceTextHash) {
      continue;
    }

    const existingRow = existingRowMap.get(episodeId);
    const latestRecording = findLatestAutoGeneratedRecording(
      recordings,
      episodeId,
      nemoReaderUserId
    );
    const hasRecording = !!latestRecording;
    const isStale =
      !!existingRow?.sourceTextHash &&
      !!sourceTextHash &&
      existingRow.sourceTextHash !== sourceTextHash;
    const shouldQueue = !hasRecording || isStale;
    const requestCount = (existingRow?.requestCount ?? 0) + 1;
    const nextPriorityScore = calculatePriorityScore({
      hasRecording,
      isStale,
      viewerCountSnapshot,
      requestCount,
      priorityBoost,
    });

    const keepProcessing =
      existingRow?.generationStatus === "processing" &&
      !isQueueLockExpired(existingRow.lockedAt);

    const generationStatus: NemoGenerationQueueStatus = keepProcessing
      ? "processing"
      : shouldQueue
        ? "pending"
        : "completed";
    const generationReason: NemoGenerationQueueReason = shouldQueue
      ? isStale
        ? "source_changed"
        : "missing_recording"
      : existingRow?.generationStatus === "completed"
        ? existingRow.generationReason
        : hasRecording
          ? "backfill"
          : "missing_recording";

    if (generationStatus === "pending") {
      queuedEpisodeIds.push(episodeId);
    } else if (generationStatus === "completed") {
      completedEpisodeIds.push(episodeId);
    }

    payloads.push({
      id: existingRow?.id,
      series_id: seriesId,
      episode_id: episodeId,
      generation_status: generationStatus,
      generation_reason: generationReason,
      is_stale: shouldQueue ? isStale : false,
      source_text_hash: sourceTextHash,
      priority_score: nextPriorityScore,
      viewer_count_snapshot: Math.max(0, Math.trunc(viewerCountSnapshot)),
      request_count: requestCount,
      last_request_source: requestSource.trim() || "system",
      last_requested_by_user_id: requestedByUserId,
      first_requested_at: existingRow?.firstRequestedAt ?? nowIso,
      last_requested_at: nowIso,
      last_attempted_at: existingRow?.lastAttemptedAt,
      last_generated_at:
        generationStatus === "completed"
          ? existingRow?.lastGeneratedAt ?? getRecordingCreatedAt(latestRecording) ?? nowIso
          : existingRow?.lastGeneratedAt ?? getRecordingCreatedAt(latestRecording),
      last_error:
        generationStatus === "completed" ? null : existingRow?.lastError,
      attempt_count: existingRow?.attemptCount ?? 0,
      locked_at: keepProcessing ? existingRow?.lockedAt : null,
      locked_by: keepProcessing ? existingRow?.lockedBy : null,
      created_at: existingRow?.createdAt ?? nowIso,
      updated_at: nowIso,
    });
  }

  await upsertQueueRows(supabase, payloads);

  return {
    touchedEpisodeIds: visibleEpisodeIds,
    queuedEpisodeIds,
    completedEpisodeIds,
  };
}

export async function claimNextNemoGenerationQueueJob(
  args: ClaimNemoGenerationQueueJobArgs
): Promise<NemoGenerationQueueJob | null> {
  const { supabase, workerId, seriesId, episodeIds } = args;
  const filteredEpisodeIds =
    episodeIds && episodeIds.length > 0
      ? [...new Set(episodeIds.map((value) => value.trim()).filter(Boolean))]
      : [];

  let query = supabase
    .from("nemo_generation_queue")
    .select("*")
    .in("generation_status", ["pending", "failed", "processing"])
    .order("priority_score", { ascending: false })
    .order("viewer_count_snapshot", { ascending: false })
    .order("last_requested_at", { ascending: false })
    .order("first_requested_at", { ascending: true })
    .limit(50);

  if (seriesId) {
    query = query.eq("series_id", seriesId);
  }

  if (filteredEpisodeIds.length > 0) {
    query = query.in("episode_id", filteredEpisodeIds);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`nemo_queue_claim_lookup_failed:${error.message}`);
  }

  const rows = ((data ?? []) as QueueRow[])
    .map(getQueueJobFromRow)
    .filter((row) =>
      row.generationStatus === "processing"
        ? isQueueLockExpired(row.lockedAt)
        : true
    );

  const nowIso = new Date().toISOString();

  for (const row of rows) {
    let claimQuery = supabase
      .from("nemo_generation_queue")
      .update({
        generation_status: "processing",
        last_attempted_at: nowIso,
        attempt_count: row.attemptCount + 1,
        locked_at: nowIso,
        locked_by: workerId,
        last_error: null,
        updated_at: nowIso,
      })
      .eq("id", row.id);

    if (row.generationStatus === "processing") {
      claimQuery = claimQuery.eq("generation_status", "processing");

      if (row.lockedAt) {
        claimQuery = claimQuery.eq("locked_at", row.lockedAt);
      }
    } else {
      claimQuery = claimQuery.in("generation_status", ["pending", "failed"]);
    }

    const {
      data: claimedRow,
      error: claimError,
    } = await claimQuery.select("*").maybeSingle();

    if (claimError || !claimedRow) {
      continue;
    }

    return getQueueJobFromRow(claimedRow as QueueRow);
  }

  return null;
}

export async function markNemoGenerationQueueJobCompleted(
  args: MarkNemoGenerationQueueJobCompletedArgs
): Promise<void> {
  const { supabase, job, sourceTextHash = job.sourceTextHash } = args;
  const nowIso = new Date().toISOString();

  const { error } = await supabase
    .from("nemo_generation_queue")
    .update({
      generation_status: "completed",
      is_stale: false,
      source_text_hash: sourceTextHash,
      last_generated_at: nowIso,
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

export async function markNemoGenerationQueueJobFailed(
  args: MarkNemoGenerationQueueJobFailedArgs
): Promise<void> {
  const { supabase, jobId, error } = args;
  const detail = error instanceof Error ? error.message : String(error);
  const nowIso = new Date().toISOString();

  const { error: updateError } = await supabase
    .from("nemo_generation_queue")
    .update({
      generation_status: "failed",
      last_error: detail,
      locked_at: null,
      locked_by: null,
      updated_at: nowIso,
    })
    .eq("id", jobId);

  if (updateError) {
    throw new Error(`nemo_queue_fail_failed:${updateError.message}`);
  }
}

export async function markEpisodeGeneratedInNemoQueue(
  args: MarkEpisodeGeneratedInNemoQueueArgs
): Promise<void> {
  const { supabase, seriesId, episodeId, requestedByUserId = null } = args;
  const episode = await fetchEpisodeById(supabase, episodeId);

  if (!episode) {
    return;
  }

  const resolvedSeriesId = pickText(episode.series_id, episode.seriesId);
  if (resolvedSeriesId !== seriesId) {
    return;
  }

  const sourceTextHash = buildNemoSourceTextHash({
    seriesId,
    episodeId,
    episodeBody: getEpisodeBody(episode),
  });

  if (!sourceTextHash) {
    return;
  }

  const existingRows = await fetchQueueRowsByEpisodeIds(supabase, [episodeId]);
  const existingRow = existingRows[0] ?? null;
  const nowIso = new Date().toISOString();

  await upsertQueueRows(supabase, [
    {
      id: existingRow?.id,
      series_id: seriesId,
      episode_id: episodeId,
      generation_status: "completed",
      generation_reason: "manual_generate",
      is_stale: false,
      source_text_hash: sourceTextHash,
      priority_score: existingRow?.priorityScore ?? 0,
      viewer_count_snapshot: existingRow?.viewerCountSnapshot ?? 0,
      request_count: existingRow?.requestCount ?? 0,
      last_request_source: "manual_generate",
      last_requested_by_user_id: requestedByUserId,
      first_requested_at: existingRow?.firstRequestedAt ?? nowIso,
      last_requested_at: existingRow?.lastRequestedAt ?? nowIso,
      last_attempted_at: nowIso,
      last_generated_at: nowIso,
      last_error: null,
      attempt_count: existingRow?.attemptCount ?? 0,
      locked_at: null,
      locked_by: null,
      created_at: existingRow?.createdAt ?? nowIso,
      updated_at: nowIso,
    },
  ]);
}