// Issue #137 H1: service-role-only transactional Human recording mutation adapter.
// This module never falls back to a direct recordings write. The corresponding
// DRAFT SQL migration must be independently reviewed/applied before release.
import { createAdminClient } from "@/lib/supabase/admin";

type AdminSupabase = ReturnType<typeof createAdminClient>;
export type HumanAtomicScope = {
  seriesId: string;
  episodeId: string;
  ownerId: string;
};
export type HumanAtomicMutation = HumanAtomicScope & {
  expectedRevision: string;
  action: "insert" | "replace" | "visibility" | "delete_all";
  recordingId?: string | null;
  readerName?: string | null;
  audioStoragePath?: string | null;
  isPublic?: boolean | null;
  priorAudioStoragePath?: string | null;
  priorIsPublic?: boolean | null;
};
export type HumanAtomicResult = {
  recordingId: string | null;
  deletedCount: number;
  revision: string;
};

function asRevision(value: unknown): string {
  if (
    (typeof value === "string" && /^\d+$/u.test(value)) ||
    (typeof value === "number" && Number.isSafeInteger(value) && value >= 0)
  ) {
    return String(value);
  }
  throw new Error("human_atomic_invalid_revision");
}

export async function readHumanAtomicRevision(
  adminSupabase: AdminSupabase,
  scope: HumanAtomicScope
): Promise<string> {
  const { data, error } = await adminSupabase.rpc("issue137_h1_human_revision", {
    p_series_id: scope.seriesId,
    p_episode_id: scope.episodeId,
    p_owner_id: scope.ownerId,
  });
  if (error) {
    // Missing migration, revoked EXECUTE, disconnected DB and schema drift
    // all fail closed: NEVER retry with direct service-role INSERT/UPDATE.
    throw new Error(`human_atomic_revision_unavailable:${error.message}`);
  }
  return asRevision(data);
}

export async function commitHumanAtomicMutation(
  adminSupabase: AdminSupabase,
  mutation: HumanAtomicMutation
): Promise<HumanAtomicResult> {
  const { data, error } = await adminSupabase.rpc("issue137_h1_human_commit", {
    p_series_id: mutation.seriesId,
    p_episode_id: mutation.episodeId,
    p_owner_id: mutation.ownerId,
    p_expected_revision: mutation.expectedRevision,
    p_action: mutation.action,
    p_recording_id: mutation.recordingId ?? null,
    p_reader_name: mutation.readerName ?? null,
    p_audio_storage_path: mutation.audioStoragePath ?? null,
    p_is_public: mutation.isPublic ?? null,
    p_prior_audio_storage_path: mutation.priorAudioStoragePath ?? null,
    p_prior_is_public: mutation.priorIsPublic ?? null,
  });
  if (error) {
    throw new Error(`human_atomic_commit_failed:${error.message}`);
  }
  const row = data as Record<string, unknown> | null;
  if (!row) throw new Error("human_atomic_empty_result");
  const deletedCount = row.deleted_count;
  if (typeof deletedCount !== "number" || !Number.isSafeInteger(deletedCount) || deletedCount < 0) {
    throw new Error("human_atomic_invalid_result");
  }
  const recordingId = row.recording_id;
  if (recordingId !== null && typeof recordingId !== "string") {
    throw new Error("human_atomic_invalid_result");
  }
  return {
    recordingId: typeof recordingId === "string" ? recordingId : null,
    deletedCount,
    revision: asRevision(row.revision),
  };
}
