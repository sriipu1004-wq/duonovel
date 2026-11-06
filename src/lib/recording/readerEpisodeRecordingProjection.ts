import { isPublishedHumanRecording } from "@/lib/recording/humanRecordingState";
import { buildHumanRecordingPlaybackHref } from "@/lib/recording/humanRecordingStorage";
import { listProtectedAiRecordings } from "@/lib/recording/protectedAiRecordingOptions";

/**
 * Project one PUBLIC episode's recordings to the server Reader payload.
 * Human narration stays on the Human proxy, and ONLY the validated protected
 * AI recording IDs survive to the AI-only branch. This runs AFTER the
 * caller's series/episode/R18 authorization and does not serialize raw
 * private paths into the client component props.
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
>(rows: T[], episodeId: string): T[] {
  const privateAiIds = new Set(
    listProtectedAiRecordings(rows, new Set([episodeId]))
      .map((option) => option.recordingId)
  );
  return rows
    .filter((row) =>
      (row.episode_id ?? row.episodeId) === episodeId &&
      (isPublishedHumanRecording(row) || privateAiIds.has(row.id))
    )
    .map((row) =>
      isPublishedHumanRecording(row)
        ? { ...row, audio_storage_path: buildHumanRecordingPlaybackHref(row.id) }
        : row
    );
}
