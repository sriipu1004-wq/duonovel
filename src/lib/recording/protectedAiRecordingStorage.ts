import "server-only";
import { isR18Series } from "@/lib/contentRating";
import { createAdminClient } from "@/lib/supabase/admin";
export const PRIVATE_AI_AUDIO_BUCKET = "r18-recording-audio";
const PRIVATE_AUDIO_PREFIX = "r18-private:";
export function makePrivateAiAudioReference(path: string): string {
  if (!path || path.includes("..") || /[?#]/u.test(path)) throw new Error("invalid private audio object path");
  return PRIVATE_AUDIO_PREFIX + path;
}
export function parsePrivateAiAudioReference(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith(PRIVATE_AUDIO_PREFIX)) return null;
  const path = value.slice(PRIVATE_AUDIO_PREFIX.length);
  return !path || path.includes("..") || /[?#]/u.test(path) ? null : path;
}
export function buildPrivateAiAudioPlaybackHref(recordingId: string): string {
  return `/api/recordings/ai-audio/${encodeURIComponent(recordingId)}`;
}
export async function mustUsePrivateAiAudio(seriesId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("series")
    .select("content_rating, content_warnings").eq("id", seriesId).single();
  if (error || !data) throw new Error("recording_rating_check_failed");
  return isR18Series(data);
}
