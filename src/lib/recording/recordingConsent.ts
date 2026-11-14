export const RECORDING_GLOBAL_CONSENT_KEY = "recording_studio_global";
export const RECORDING_GLOBAL_CONSENT_VERSION = "2026-04-16";

// PLAYBACK of already published narration (owner decision 2026-11-14:
// 「取り消したら止める」). A narrator's existing consent row must be one of
// these versions; a missing row (consent withdrawn) stops playback. When
// RECORDING_GLOBAL_CONSENT_VERSION is bumped, ADD the new version here and
// keep the old ones so past narration keeps playing. This list does not
// govern NEW recordings (upload/commit checks keep the current version).
export const ACCEPTED_RECORDING_PLAYBACK_CONSENT_VERSIONS: readonly string[] = [
  "2026-04-16",
];

// Pure predicate; the narrator's current consent row must be fetched
// server-side on each request (null/undefined = no row = withdrawn).
export function isAcceptedRecordingConsentVersion(value: unknown): boolean {
  return (
    typeof value === "string" &&
    ACCEPTED_RECORDING_PLAYBACK_CONSENT_VERSIONS.includes(value)
  );
}
export const RECORDING_CONSENT_HREF = "/record/consent";
export const RECORDING_TERMS_HREF = "/record/terms";

export function normalizeRecordingConsentNextPath(
  value: unknown,
  fallback = "/record"
): string {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return fallback;
  }

  if (!trimmed.startsWith("/")) {
    return fallback;
  }

  if (trimmed.startsWith("//")) {
    return fallback;
  }

  return trimmed;
}

export function buildRecordingConsentPath(nextPath: string): string {
  const params = new URLSearchParams();

  params.set("next", normalizeRecordingConsentNextPath(nextPath));

  return `${RECORDING_CONSENT_HREF}?${params.toString()}`;
}