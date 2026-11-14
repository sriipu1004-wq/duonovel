// Shared by server-side Reader/Work code and client-safe playback code.
//
// PUBLIC media (`recording-audio`, `/storage/v1/object/public/...` URLs) is
// returned unchanged so existing playback keeps working. A PRIVATE AI
// narration reference is never exposed: it becomes the access-checked proxy
// href, or "" when it cannot be mapped safely.
import { isUuid } from "@/lib/uuid";
import {
  buildPrivateAiNarrationPlaybackHref,
  parsePrivateAiNarrationReference,
  PRIVATE_AI_NARRATION_REFERENCE_PREFIX,
} from "@/lib/recording/privateAiNarrationStorage";

export function recordingAudioPlaybackHref(recordingId: unknown, path: unknown): string {
  if (typeof path !== "string") return "";
  const stored = path.trim();
  if (!stored.startsWith(PRIVATE_AI_NARRATION_REFERENCE_PREFIX)) return stored;
  if (
    typeof recordingId !== "string" ||
    !isUuid(recordingId) ||
    !parsePrivateAiNarrationReference(stored)
  ) {
    return "";
  }
  return buildPrivateAiNarrationPlaybackHref(recordingId);
}
