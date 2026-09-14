import {
  LANGUAGE_REGISTRY,
  PUBLIC_TRANSLATION_TARGET_LANGUAGES,
  parseSupportedLanguageTag,
  type PublicTranslationTargetLanguage,
  type SupportedLanguageTag,
} from "@/lib/translation/languageRegistry";

export const PUBLIC_SEARCH_SOURCE_LANGUAGE_HEADER =
  "x-libread-search-source-language";
export const PUBLIC_SEARCH_READ_LANGUAGE_HEADER =
  "x-libread-search-read-language";

export type PublicWorkLanguageFilterCandidate = {
  sourceLanguage: SupportedLanguageTag | null;
  translationEligible: boolean;
};

export const PUBLIC_SEARCH_SOURCE_LANGUAGES = Object.keys(
  LANGUAGE_REGISTRY
) as SupportedLanguageTag[];

export const PUBLIC_SEARCH_READ_LANGUAGES = [
  ...PUBLIC_TRANSLATION_TARGET_LANGUAGES,
] as readonly PublicTranslationTargetLanguage[];

export function parsePublicSearchSourceLanguage(
  value: unknown
): SupportedLanguageTag | null {
  return parseSupportedLanguageTag(value);
}

export function parsePublicSearchReadLanguage(
  value: unknown
): PublicTranslationTargetLanguage | null {
  const parsed = parseSupportedLanguageTag(value);
  if (!parsed) return null;
  return PUBLIC_SEARCH_READ_LANGUAGES.includes(
    parsed as PublicTranslationTargetLanguage
  )
    ? (parsed as PublicTranslationTargetLanguage)
    : null;
}

export function matchesPublicWorkLanguageFilters(args: {
  work: PublicWorkLanguageFilterCandidate;
  sourceLanguage: SupportedLanguageTag | null;
  readLanguage: PublicTranslationTargetLanguage | null;
}): boolean {
  const { work, sourceLanguage, readLanguage } = args;

  if (sourceLanguage && work.sourceLanguage !== sourceLanguage) {
    return false;
  }

  if (!readLanguage) {
    return true;
  }

  if (!work.sourceLanguage) {
    return false;
  }

  if (work.sourceLanguage === readLanguage) {
    return true;
  }

  return work.translationEligible;
}

export function buildPublicWorkReadIntentHref(args: {
  seriesId: string;
  sourceLanguage: SupportedLanguageTag | null;
  readLanguage: PublicTranslationTargetLanguage | null;
}): string {
  const baseHref = `/works/${encodeURIComponent(args.seriesId)}`;
  if (
    !args.readLanguage ||
    !args.sourceLanguage ||
    args.readLanguage === args.sourceLanguage
  ) {
    return baseHref;
  }

  return `${baseHref}/translations/${encodeURIComponent(args.readLanguage)}`;
}
