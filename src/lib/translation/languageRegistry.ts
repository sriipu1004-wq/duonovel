export type SupportedLanguage = {
  tag: string;
  label: string;
  nativeLabel: string;
  speechLanguage: string;
};

export const LANGUAGE_REGISTRY = {
  ja: {
    tag: "ja",
    label: "Japanese",
    nativeLabel: "日本語",
    speechLanguage: "ja-JP",
  },
  en: {
    tag: "en",
    label: "English",
    nativeLabel: "English",
    speechLanguage: "en-US",
  },
  ko: {
    tag: "ko",
    label: "Korean",
    nativeLabel: "한국어",
    speechLanguage: "ko-KR",
  },
  fr: {
    tag: "fr",
    label: "French",
    nativeLabel: "Français",
    speechLanguage: "fr-FR",
  },
  de: {
    tag: "de",
    label: "German",
    nativeLabel: "Deutsch",
    speechLanguage: "de-DE",
  },
  es: {
    tag: "es",
    label: "Spanish",
    nativeLabel: "Español",
    speechLanguage: "es-ES",
  },
  "zh-Hans": {
    tag: "zh-Hans",
    label: "Simplified Chinese",
    nativeLabel: "简体中文",
    speechLanguage: "zh-CN",
  },
  "zh-Hant": {
    tag: "zh-Hant",
    label: "Traditional Chinese",
    nativeLabel: "繁體中文",
    speechLanguage: "zh-TW",
  },
} as const satisfies Record<string, SupportedLanguage>;

export type SupportedLanguageTag = keyof typeof LANGUAGE_REGISTRY;

export const DEFAULT_TRANSLATION_SOURCE_LANGUAGE: SupportedLanguageTag = "ja";
export const DEFAULT_TRANSLATION_TARGET_LANGUAGE: SupportedLanguageTag = "en";

export const PUBLIC_TRANSLATION_TARGET_LANGUAGES = [
  "en",
  "ko",
  "zh-Hans",
  "zh-Hant",
  "fr",
  "de",
  "es",
] as const satisfies readonly SupportedLanguageTag[];

export type PublicTranslationTargetLanguage =
  (typeof PUBLIC_TRANSLATION_TARGET_LANGUAGES)[number];

const PUBLIC_TRANSLATION_TARGET_LANGUAGE_SET = new Set<SupportedLanguageTag>(
  PUBLIC_TRANSLATION_TARGET_LANGUAGES
);

const LANGUAGE_TAGS_BY_LOWERCASE = new Map<string, SupportedLanguageTag>(
  (Object.keys(LANGUAGE_REGISTRY) as SupportedLanguageTag[]).map((tag) => [
    tag.toLowerCase(),
    tag,
  ])
);

export function parseSupportedLanguageTag(
  value: unknown
): SupportedLanguageTag | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  return LANGUAGE_TAGS_BY_LOWERCASE.get(normalized) ?? null;
}

export function getSupportedLanguage(
  tag: SupportedLanguageTag
): (typeof LANGUAGE_REGISTRY)[SupportedLanguageTag] {
  return LANGUAGE_REGISTRY[tag];
}

export function isPublicTranslationTargetLanguage(
  tag: SupportedLanguageTag
): tag is PublicTranslationTargetLanguage {
  return PUBLIC_TRANSLATION_TARGET_LANGUAGE_SET.has(tag);
}

export function isPublicTranslationLanguagePair(args: {
  sourceLanguage: SupportedLanguageTag;
  targetLanguage: SupportedLanguageTag;
}): boolean {
  return (
    args.sourceLanguage === DEFAULT_TRANSLATION_SOURCE_LANGUAGE &&
    isPublicTranslationTargetLanguage(args.targetLanguage)
  );
}
