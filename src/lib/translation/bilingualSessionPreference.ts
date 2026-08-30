import {
  parseSupportedLanguageTag,
  type SupportedLanguageTag,
} from "@/lib/translation/languageRegistry";

export type BilingualSessionScope = "series" | "generated" | "private-library";

type BilingualSessionPreference = {
  targetLanguage: SupportedLanguageTag;
  autoGenerate: true;
};

function storageKey(scope: BilingualSessionScope, contentId: string): string {
  return `duonovel:bilingual-session:${scope}:${contentId}`;
}

export function readBilingualSessionPreference(
  scope: BilingualSessionScope,
  contentId: string,
  sourceLanguage: SupportedLanguageTag
): BilingualSessionPreference | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(storageKey(scope, contentId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const targetLanguage = parseSupportedLanguageTag(parsed.targetLanguage);
    if (!targetLanguage || targetLanguage === sourceLanguage) return null;
    return { targetLanguage, autoGenerate: true };
  } catch {
    return null;
  }
}

export function writeBilingualSessionPreference(
  scope: BilingualSessionScope,
  contentId: string,
  targetLanguage: SupportedLanguageTag
): void {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(
      storageKey(scope, contentId),
      JSON.stringify({ targetLanguage, autoGenerate: true })
    );
  } catch {
    // Session preference is best effort and intentionally not persisted.
  }
}
