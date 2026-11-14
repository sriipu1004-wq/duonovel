import { isPublishedHumanRecording } from "@/lib/recording/humanRecordingState";
import { buildHumanRecordingPlaybackHref } from "@/lib/recording/humanRecordingStorage";
import { listProtectedAiRecordings } from "@/lib/recording/protectedAiRecordingOptions";
import { recordingAudioPlaybackHref } from "@/lib/recording/recordingAudioPlaybackHref";

/** Same precedence as the human-audio route (reader_id first). */
export function getHumanNarratorId(row: {
  reader_id?: string | null;
  reader_user_id?: string | null;
  readerUserId?: string | null;
}): string {
  for (const value of [row.reader_id, row.reader_user_id, row.readerUserId]) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

/**
 * Narrator IDs of the published Human rows in `rows` (for the consent read).
 */
export function listPublishedHumanNarratorIds(
  rows: Parameters<typeof isPublishedHumanRecording>[0][]
): string[] {
  const ids = new Set<string>();
  for (const row of rows) {
    if (!isPublishedHumanRecording(row)) continue;
    const id = getHumanNarratorId(row);
    if (id) ids.add(id);
  }
  return [...ids];
}

/**
 * Project one episode's recordings to the server Reader payload.
 *
 * - Published Human narration keeps its proxy href (/api/recordings/human-audio).
 * - Published PRIVATE AI narration (ai-narration-private) gets its proxy href
 *   (/api/recordings/ai-audio). The raw private reference is never serialized.
 * - Every other row is dropped, exactly as before this change (the Reader
 *   payload never carried public AI rows).
 *
 * This runs AFTER the caller's series/episode/R18 authorization; each proxy
 * request is authorized again on its own.
 */
export function projectReaderEpisodeRecordings<
  T extends {
    id: string;
    episode_id?: string | null;
    episodeId?: string | null;
    audio_storage_path?: string | null;
    audioStoragePath?: string | null;
    is_public?: boolean | null;
    voice_model_id?: string | null;
    reader_id?: string | null;
    reader_user_id?: string | null;
    reader_name?: string | null;
  }
>(
  rows: T[],
  episodeId: string,
  /**
   * Narrators whose consent row is currently accepted for playback
   * (isAcceptedRecordingConsentVersion). Human rows of anyone else are
   * dropped, matching the human-audio proxy's consent rule.
   */
  consentedNarratorIds: ReadonlySet<string>
): T[] {
  const privateAiIds = new Set(
    listProtectedAiRecordings(rows, new Set([episodeId])).map(
      (option) => option.recordingId
    )
  );
  const projected: T[] = [];
  for (const row of rows) {
    if ((row.episode_id ?? row.episodeId) !== episodeId) continue;
    if (isPublishedHumanRecording(row)) {
      const narratorId = getHumanNarratorId(row);
      if (!narratorId || !consentedNarratorIds.has(narratorId)) continue;
      projected.push({
        ...row,
        audio_storage_path: buildHumanRecordingPlaybackHref(row.id),
        audioStoragePath: undefined,
      });
    } else if (privateAiIds.has(row.id)) {
      projected.push({
        ...row,
        audio_storage_path: recordingAudioPlaybackHref(
          row.id,
          row.audio_storage_path ?? row.audioStoragePath
        ),
        audioStoragePath: undefined,
      });
    }
  }
  return projected;
}
