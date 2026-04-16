export const RECORDING_GLOBAL_CONSENT_KEY = "recording_studio_global";
export const RECORDING_GLOBAL_CONSENT_VERSION = "2026-04-16";
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