import { isUuid } from "@/lib/uuid";
import { recordingAudioPlaybackHref } from "@/lib/recording/recordingAudioPlaybackHref";
import {
  buildPrivateAiNarrationPlaybackHref,
  parsePrivateAiNarrationReference,
  PRIVATE_AI_NARRATION_PLAYBACK_PREFIX,
} from "@/lib/recording/privateAiNarrationStorage";

function pickReaderName(value: unknown): string {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, 100)
    : "AI朗読";
}

/**
 * Reader side: rows already projected by projectReaderEpisodeRecordings carry
 * the proxy href instead of the private reference. Accept only that exact
 * href, so a raw Storage URL can never reach the AI player.
 */
export function listProjectedAiNarrationOptions(
  rows: ProtectedAiRecordingRow[],
  episodeId: string
): ProtectedAiRecordingOption[] {
  const options: ProtectedAiRecordingOption[] = [];
  for (const row of rows) {
    const id = row.id;
    const rowEpisodeId = row.episode_id ?? row.episodeId;
    if (
      row.is_public !== true ||
      typeof id !== "string" ||
      !isUuid(id) ||
      rowEpisodeId !== episodeId
    ) {
      continue;
    }
    const href = buildPrivateAiNarrationPlaybackHref(id);
    if (row.audio_storage_path !== href) continue;
    options.push({
      recordingId: id,
      episodeId,
      audioUrl: href,
      name: pickReaderName(row.reader_name),
    });
  }
  return options;
}

/** AI media is a separate provenance/permission class from Human recordings.
 * The ai-audio proxy rechecks series, episode, owner and R18 on every request. */
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
    // The only valid private AI provenance is a Nemo/Aivis object in the
    // PRIVATE ai-narration-private bucket. Model IDs may be absent.
    if (
      row.is_public !== true ||
      typeof id !== "string" ||
      !isUuid(id) ||
      typeof episodeId !== "string" ||
      !isUuid(episodeId) ||
      (allowedEpisodeIds && !allowedEpisodeIds.has(episodeId)) ||
      !parsePrivateAiNarrationReference(stored)
    ) {
      continue;
    }
    const audioUrl = recordingAudioPlaybackHref(id, stored);
    if (!audioUrl.startsWith(PRIVATE_AI_NARRATION_PLAYBACK_PREFIX)) continue;
    options.push({
      recordingId: id,
      episodeId,
      audioUrl,
      name: pickReaderName(row.reader_name),
    });
  }
  return options;
}
