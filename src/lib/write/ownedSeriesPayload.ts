/** Browser-submitted workspace edit payload restrictions, without auth or DB. */
const EDITABLE_KEYS = new Set([
  "title",
  "description",
  "publication_status",
  "reviews_enabled",
  "episode_comments_enabled",
  "genres",
  "tags",
  "recording_permission_mode",
  "translation_permission_mode",
  "human_translation_permission_mode",
  "effect_settings",
]);

/** effect_settings keys only the operator writes (never from a client). */
const PROTECTED_EFFECT_SETTINGS_KEYS = ["publicDomain", "legacyAttribution"] as const;

export function isValidSeriesId(value: string): boolean {
  return /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
}

function isBoundedStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= 200 &&
    value.every((item) => typeof item === "string" && item.length <= 500)
  );
}

export function isOwnedSeriesWorkspacePayload(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  const keys = Object.keys(data);

  // Only the author's existing workspace fields are editable. Never take
  // author_id / id / created_at / content_rating / source_language from a
  // client, even when the caller is authenticated.
  if (keys.length === 0 || keys.some((key) => !EDITABLE_KEYS.has(key))) return false;
  if (typeof data.title !== "string" || !data.title.trim() || data.title.length > 500) return false;
  if (typeof data.description !== "string" || data.description.length > 100_000) return false;
  if (data.publication_status !== "private" && data.publication_status !== "public") return false;

  if (typeof data.reviews_enabled !== "boolean" || typeof data.episode_comments_enabled !== "boolean") return false;
  if (!isBoundedStringArray(data.genres) || !isBoundedStringArray(data.tags)) return false;
  for (const name of ["recording_permission_mode", "translation_permission_mode", "human_translation_permission_mode"]) {
    if (data[name] !== "open" && data[name] !== "closed") return false;
  }
  if (
    data.effect_settings !== null &&
    (typeof data.effect_settings !== "object" || Array.isArray(data.effect_settings))
  ) return false;
  // Public Domain evidence and the legacy official attribution are operator
  // records, not author-editable styling.
  if (
    data.effect_settings !== null &&
    PROTECTED_EFFECT_SETTINGS_KEYS.some((key) =>
      Object.prototype.hasOwnProperty.call(data.effect_settings, key)
    )
  ) return false;
  // Bound serialized input size without inspecting or logging the serialized
  // effect settings (which may contain authored presentation content).
  try {
    if (JSON.stringify(data).length > 500_000) return false;
  } catch {
    return false;
  }
  return true;
}

function settingsRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Workspace presentation edits must not discard or forge reviewed rights
 * provenance (effect_settings.publicDomain) or the legacy official
 * attribution (effect_settings.legacyAttribution). Only the existing
 * owner-readable database value may supply these fields.
 */
export function preserveSeriesPublicDomainMetadata(
  editable: unknown,
  stored: unknown
): Record<string, unknown> | null {
  const clientSettings = settingsRecord(editable);
  const storedSettings = settingsRecord(stored);
  let next: Record<string, unknown> | null = clientSettings ? { ...clientSettings } : null;
  if (next) {
    for (const key of PROTECTED_EFFECT_SETTINGS_KEYS) delete next[key];
  }
  for (const key of PROTECTED_EFFECT_SETTINGS_KEYS) {
    if (storedSettings && Object.prototype.hasOwnProperty.call(storedSettings, key)) {
      next = { ...(next ?? {}), [key]: storedSettings[key] };
    }
  }
  return next;
}
