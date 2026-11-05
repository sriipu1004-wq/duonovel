import "server-only";
import { isR18Series } from "@/lib/contentRating";
import { createAdminClient } from "@/lib/supabase/admin";
export const PRIVATE_AI_AUDIO_BUCKET = "r18-recording-audio";

// Issue #137 F2-P: New GENERAL AI narration may use the existing PRIVATE
// custody path ONLY in explicitly isolated local E2E. The "r18-private:"
// marker denotes storage custody; actual age restrictions come from series.
export type LocalPrivateAiExperimentEnv = Readonly<{
  LIBREAD_F2P_AI_PRIVATE_FIRST_EXPERIMENT?: string;
  DO_NOT_CONTACT_PRODUCTION?: string;
  R0_EPHEMERAL_CONFIRM?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NODE_ENV?: string;
  VERCEL_ENV?: string;
}>;
export function isApprovedLocalPrivateAiExperiment(
  env: LocalPrivateAiExperimentEnv
): boolean {
  const mode = env.LIBREAD_F2P_AI_PRIVATE_FIRST_EXPERIMENT?.trim() ?? "";
  if (!mode) return false;
  if (mode !== "local-only") throw new Error("f2p_ai_private_experiment_mode_invalid");
  let url: URL;
  try {
    url = new URL(env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  } catch {
    throw new Error("f2p_ai_private_experiment_requires_isolated_local");
  }
  if (
    env.NODE_ENV !== "development" ||
    env.DO_NOT_CONTACT_PRODUCTION !== "true" ||
    env.R0_EPHEMERAL_CONFIRM !== "local-only" ||
    Boolean(env.VERCEL_ENV) ||
    url.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    !["54321", "54331"].includes(url.port) ||
    url.pathname !== "/" || url.search !== "" || url.hash !== ""
  ) {
    throw new Error("f2p_ai_private_experiment_requires_isolated_local");
  }
  return true;
}

// Storage-managed visibility can drift; a PRIVATE database marker is never
// sufficient proof that the actual Storage origin is private.
export async function assertApprovedPrivateAiAudioBucket(
  client: ReturnType<typeof createAdminClient>
): Promise<typeof PRIVATE_AI_AUDIO_BUCKET> {
  const { data, error } = await client.storage.getBucket(PRIVATE_AI_AUDIO_BUCKET);
  if (error || !data ||
      data.id !== PRIVATE_AI_AUDIO_BUCKET ||
      data.name !== PRIVATE_AI_AUDIO_BUCKET ||
      data.public !== false) {
    throw new Error("private_ai_audio_bucket_not_verified");
  }
  return PRIVATE_AI_AUDIO_BUCKET;
}
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
  const localPrivateFirst = isApprovedLocalPrivateAiExperiment({
    LIBREAD_F2P_AI_PRIVATE_FIRST_EXPERIMENT: process.env.LIBREAD_F2P_AI_PRIVATE_FIRST_EXPERIMENT,
    DO_NOT_CONTACT_PRODUCTION: process.env.DO_NOT_CONTACT_PRODUCTION,
    R0_EPHEMERAL_CONFIRM: process.env.R0_EPHEMERAL_CONFIRM,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NODE_ENV: process.env.NODE_ENV,
    VERCEL_ENV: process.env.VERCEL_ENV,
  });
  const admin = createAdminClient();
  const { data, error } = await admin.from("series")
    .select("content_rating, content_warnings").eq("id", seriesId).single();
  if (error || !data) throw new Error("recording_rating_check_failed");
  // An unapproved custom public bucket cannot be covered by the fixed
  // candidate SQL path guard. Block synthesis rather than silently using it.
  const configuredPublicBucket = process.env.NEXT_PUBLIC_SUPABASE_RECORDING_BUCKET?.trim() || "recording-audio";
  if (configuredPublicBucket !== "recording-audio") {
    throw new Error("b2_unverified_public_audio_bucket");
  }
  return isR18Series(data) || localPrivateFirst;
}
