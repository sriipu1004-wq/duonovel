import type {
  PublicTranslationTargetLanguage,
  SupportedLanguageTag,
} from "@/lib/translation/languageRegistry";

type PublicSearchLanguageState = {
  sourceLanguage: SupportedLanguageTag | null;
  readLanguage: PublicTranslationTargetLanguage | null;
};

export function preservePublicSearchLanguageFilters(
  href: string,
  { sourceLanguage, readLanguage }: PublicSearchLanguageState
): string {
  const hashIndex = href.indexOf("#");
  const hash = hashIndex >= 0 ? href.slice(hashIndex) : "";
  const withoutHash = hashIndex >= 0 ? href.slice(0, hashIndex) : href;
  const queryIndex = withoutHash.indexOf("?");
  const pathname = queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash;

  if (pathname !== "/search") return href;

  const queryString = queryIndex >= 0 ? withoutHash.slice(queryIndex + 1) : "";
  const params = new URLSearchParams(queryString);

  if (sourceLanguage) params.set("source_language", sourceLanguage);
  else params.delete("source_language");

  if (readLanguage) params.set("read_language", readLanguage);
  else params.delete("read_language");

  const nextQuery = params.toString();
  return `${pathname}${nextQuery ? `?${nextQuery}` : ""}${hash}`;
}
