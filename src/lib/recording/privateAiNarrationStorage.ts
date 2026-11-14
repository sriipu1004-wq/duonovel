// Issue #137 PR-E: client-safe helpers for PRIVATE AI narration media.
//
// Bucket: `ai-narration-private` (#167 design, scripts/issue137-private-ai).
// Writes are meant to use the official narration account's own JWT under
// Storage RLS; there is NO user-role SELECT policy, so bytes are only ever
// read by the access-checked server proxy (/api/recordings/ai-audio/<id>).
//
// A recordings row points at a private object with an explicit marker so that
// it can never be mistaken for a PUBLIC `recording-audio` URL:
//   ai-narration-private:<nemo|aivis>/<series uuid>/<episode uuid>/<file>.wav
// No writer in this repository produces the marker yet (generation is
// suspended, #173); until one does, the proxy simply has no rows to serve.
import { isUuid } from "@/lib/uuid";

export const PRIVATE_AI_NARRATION_BUCKET = "ai-narration-private";
export const PRIVATE_AI_NARRATION_REFERENCE_PREFIX = `${PRIVATE_AI_NARRATION_BUCKET}:`;
export const PRIVATE_AI_NARRATION_PLAYBACK_PREFIX = "/api/recordings/ai-audio/";

const UUID_SEGMENT = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const PRIVATE_AI_OBJECT_PATH = new RegExp(
  `^(?:nemo|aivis)/(${UUID_SEGMENT})/(${UUID_SEGMENT})/[A-Za-z0-9._-]+[.]wav$`,
  "u"
);

function isSafeObjectPath(path: string): boolean {
  return (
    path.length > 0 &&
    !path.includes("..") &&
    !path.includes("//") &&
    !path.includes("\\") &&
    !/[?#%\s]/u.test(path)
  );
}

export function makePrivateAiNarrationReference(objectPath: string): string {
  if (!isSafeObjectPath(objectPath) || !PRIVATE_AI_OBJECT_PATH.test(objectPath)) {
    throw new Error("invalid_private_ai_narration_object_path");
  }
  return PRIVATE_AI_NARRATION_REFERENCE_PREFIX + objectPath;
}

/** Returns the object path inside `ai-narration-private`, or null. */
export function parsePrivateAiNarrationReference(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith(PRIVATE_AI_NARRATION_REFERENCE_PREFIX)) return null;
  const path = trimmed.slice(PRIVATE_AI_NARRATION_REFERENCE_PREFIX.length);
  if (!isSafeObjectPath(path) || !PRIVATE_AI_OBJECT_PATH.test(path)) return null;
  return path;
}

/**
 * Defense in depth: a recording row must not alias another work's or
 * episode's private bytes. Both IDs come from the recordings row itself.
 */
export function isPrivateAiNarrationPathForEpisode(
  objectPath: string,
  seriesId: string,
  episodeId: string
): boolean {
  const match = PRIVATE_AI_OBJECT_PATH.exec(objectPath);
  if (!match || !isUuid(seriesId) || !isUuid(episodeId)) return false;
  return (
    match[1] === seriesId.toLowerCase() &&
    match[2] === episodeId.toLowerCase()
  );
}

export function buildPrivateAiNarrationPlaybackHref(recordingId: string): string {
  return PRIVATE_AI_NARRATION_PLAYBACK_PREFIX + encodeURIComponent(recordingId.trim());
}
