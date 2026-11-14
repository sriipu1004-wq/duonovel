export type HumanRecordingLike = Record<string, unknown> & {
  is_public?: boolean | null;
  public?: boolean | null;
  voice_model_id?: string | null;
  voiceModelId?: string | null;
  audio_storage_path?: string | null;
  audioStoragePath?: string | null;
  reader_id?: string | null;
  reader_user_id?: string | null;
  readerUserId?: string | null;
  reader_name?: string | null;
};

function pickText(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return "";
}

export function getRecordingAudioStoragePath(
  recording: HumanRecordingLike
): string {
  return pickText(recording.audio_storage_path, recording.audioStoragePath);
}

export function hasHumanRecordingStorageProvenance(
  recording: HumanRecordingLike
): boolean {
  const audioPath = getRecordingAudioStoragePath(recording);
  if (!audioPath) return false;

  try {
    const pathname = new URL(audioPath, "https://libread.invalid").pathname;
    return pathname.split("/").includes("human");
  } catch {
    return /(^|\/)human\//u.test(audioPath);
  }
}

export function isHumanRecordingRow(
  recording: HumanRecordingLike
): boolean {
  const voiceModelId = pickText(
    recording.voice_model_id,
    recording.voiceModelId
  );
  if (voiceModelId) return false;
  if (!hasHumanRecordingStorageProvenance(recording)) return false;

  const readerId = pickText(
    recording.reader_id,
    recording.reader_user_id,
    recording.readerUserId
  );
  const readerName = pickText(recording.reader_name);

  return readerId.length > 0 && readerName.length > 0;
}

export function isPublishedHumanRecording(
  recording: HumanRecordingLike
): boolean {
  return recording.is_public === true && isHumanRecordingRow(recording);
}

/**
 * Issue #137 H1: mirror of the DB guard trigger predicate
 * (libread_internal.h1_guard_human_mutation). A row with no voice model whose
 * storage path has a `human` path segment can only be written through
 * issue137_h1_human_commit / issue137_h1_human_rename. AI/TTS writers must
 * never pick such a row as an update/delete target.
 */
export function isH1GuardedHumanRow(recording: HumanRecordingLike): boolean {
  const voiceModelId = pickText(recording.voice_model_id, recording.voiceModelId);
  if (voiceModelId) return false;
  const path = `/${getRecordingAudioStoragePath(recording)}`;
  return /\/human(\/|$)/u.test(path);
}

/**
 * PostgREST `or` filter that keeps exactly the rows NOT guarded by the H1
 * trigger on the path condition: '/'||path LIKE '%/human/%' OR LIKE '%/human'
 * (i.e. 'human', 'human/…', '…/human/…', '…/human'). A NULL path is not
 * guarded by the trigger and is kept here too. Combine with
 * `.is("voice_model_id", null)` for direct non-Human legacy writes.
 */
export const H1_NON_HUMAN_PATH_LIKE_PATTERNS = ["human", "human/*", "*/human/*", "*/human"] as const;
export const H1_NON_HUMAN_PATH_POSTGREST_OR =
  "audio_storage_path.is.null,and(" +
  H1_NON_HUMAN_PATH_LIKE_PATTERNS.map((pattern) =>
    `audio_storage_path.not.like.${pattern}`
  ).join(",") +
  ")";
