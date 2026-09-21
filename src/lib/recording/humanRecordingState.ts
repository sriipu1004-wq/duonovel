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
