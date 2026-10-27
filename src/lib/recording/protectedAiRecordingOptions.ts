import { isUuid } from "@/lib/uuid";
import { recordingAudioPlaybackHref } from "@/lib/recording/recordingAudioPlaybackHref";

/** AI media is a separate provenance/permission class from Human recordings.
 * A server route rechecks public series, episode and R18 preference on playback. */
export type ProtectedAiRecordingRow = {
  id?: string | null;
  episode_id?: string | null;
  episodeId?: string | null;
  is_public?: boolean | null;
  audio_storage_path?: string | null;
  audioStoragePath?: string | null;
  reader_name?: string | null;
};
export type ProtectedAiRecordingOption = {
  recordingId: string;
  episodeId: string;
  audioUrl: string;
  name: string;
};
export function listProtectedAiRecordings(
  rows: ProtectedAiRecordingRow[],
  allowedEpisodeIds?: ReadonlySet<string>
): ProtectedAiRecordingOption[] {
  const options: ProtectedAiRecordingOption[] = [];
  for (const row of rows) {
    const id = row.id;
    const episodeId = row.episode_id ?? row.episodeId;
    const stored = row.audio_storage_path ?? row.audioStoragePath;
    if (row.is_public !== true || !isUuid(id) || !isUuid(episodeId)
      || (allowedEpisodeIds && !allowedEpisodeIds.has(episodeId))
      || typeof stored !== "string" || !stored.startsWith("r18-private:")) continue;
    const audioUrl = recordingAudioPlaybackHref(id, stored);
    if (!audioUrl.startsWith("/api/recordings/ai-audio/")) continue;
    options.push({
      recordingId: id,
      episodeId,
      audioUrl,
      name: typeof row.reader_name === "string" && row.reader_name.trim()
        ? row.reader_name.trim().slice(0, 100) : "AI朗読",
    });
  }
  return options;
}
