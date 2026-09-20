import {
  LANGUAGE_REGISTRY,
  parseSupportedLanguageTag,
  type SupportedLanguageTag,
} from "@/lib/translation/languageRegistry";

export type PublicWorkLanguageFilterCandidate = {
  sourceLanguage: SupportedLanguageTag | null;
};

export const PUBLIC_SEARCH_SOURCE_LANGUAGES = Object.keys(
  LANGUAGE_REGISTRY
) as SupportedLanguageTag[];

export function parsePublicSearchSourceLanguages(
  value: unknown
): SupportedLanguageTag[] {
  const raw = Array.isArray(value)
    ? value.map((item) => String(item)).join(",")
    : typeof value === "string"
      ? value
      : "";

  const selected = new Set<SupportedLanguageTag>();
  for (const token of raw.split(",")) {
    const parsed = parseSupportedLanguageTag(token);
    if (parsed) selected.add(parsed);
  }

  return PUBLIC_SEARCH_SOURCE_LANGUAGES.filter((language) =>
    selected.has(language)
  );
}

export function matchesPublicWorkLanguageFilters(args: {
  work: PublicWorkLanguageFilterCandidate;
  sourceLanguages: readonly SupportedLanguageTag[];
}): boolean {
  if (args.sourceLanguages.length === 0) return true;
  return (
    args.work.sourceLanguage !== null &&
    args.sourceLanguages.includes(args.work.sourceLanguage)
  );
}
