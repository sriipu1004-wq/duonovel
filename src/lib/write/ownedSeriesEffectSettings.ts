/**
 * Series effect-editor save rules (Issue #221 / KD-3), without auth or DB.
 *
 * The effect editor only owns the presentation keys produced by
 * serializeEffectSettingsForSave(). Every other key already stored in
 * series.effect_settings (operator records such as publicDomain and
 * legacyAttribution, and workspace keys such as storyFormat) is kept from the
 * database value, never taken from the browser.
 */
import { emptyEffectSettings } from "@/lib/effects/effectSettings";
import {
  PROTECTED_EFFECT_SETTINGS_KEYS,
  settingsRecord,
} from "@/lib/write/ownedSeriesPayload";

/** Keys the effect editor is allowed to set, replace or clear. */
export const EFFECT_EDITOR_KEYS: readonly string[] = Object.freeze(
  Object.keys(emptyEffectSettings())
);

const EFFECT_EDITOR_KEY_SET = new Set(EFFECT_EDITOR_KEYS);
const PROTECTED_KEY_SET = new Set<string>(PROTECTED_EFFECT_SETTINGS_KEYS);

/**
 * Accepts null (clear all effects) or a plain object whose keys are all
 * effect-editor keys. Operator keys and any other key are rejected, so a
 * browser cannot add, change or delete them through this path.
 */
export function isOwnedSeriesEffectSettingsPayload(
  value: unknown
): value is Record<string, unknown> | null {
  if (value === null) return true;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  if (keys.some((key) => PROTECTED_KEY_SET.has(key))) return false;
  if (keys.some((key) => !EFFECT_EDITOR_KEY_SET.has(key))) return false;
  try {
    if (JSON.stringify(value).length > 500_000) return false;
  } catch {
    return false;
  }
  return true;
}

/**
 * Builds the value to store: every non-effect key from the stored DB value,
 * plus the effect-editor keys from the (already validated) client value.
 * Returns null only when nothing remains.
 */
export function mergeOwnedSeriesEffectSettings(
  editorSettings: Record<string, unknown> | null,
  stored: unknown
): Record<string, unknown> | null {
  const storedSettings = settingsRecord(stored);
  const next: Record<string, unknown> = {};

  if (storedSettings) {
    for (const [key, value] of Object.entries(storedSettings)) {
      if (!EFFECT_EDITOR_KEY_SET.has(key)) next[key] = value;
    }
  }
  if (editorSettings) {
    for (const [key, value] of Object.entries(editorSettings)) {
      // Defence in depth: only editor keys, never operator records.
      if (EFFECT_EDITOR_KEY_SET.has(key) && !PROTECTED_KEY_SET.has(key)) {
        next[key] = value;
      }
    }
  }
  return Object.keys(next).length > 0 ? next : null;
}
