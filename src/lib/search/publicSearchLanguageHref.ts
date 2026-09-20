import type { SupportedLanguageTag } from "@/lib/translation/languageRegistry";

type PublicSearchLanguageState = {
  sourceLanguages: readonly SupportedLanguageTag[];
};

export function preservePublicSearchLanguageFilters(
  href: string,
  { sourceLanguages }: PublicSearchLanguageState
): string {
  const hashIndex = href.indexOf("#");
  const hash = hashIndex >= 0 ? href.slice(hashIndex) : "";
  const withoutHash = hashIndex >= 0 ? href.slice(0, hashIndex) : href;
  const queryIndex = withoutHash.indexOf("?");
  const pathname = queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash;

  if (pathname !== "/search") return href;

  const queryString = queryIndex >= 0 ? withoutHash.slice(queryIndex + 1) : "";
  const params = new URLSearchParams(queryString);

  params.delete("read_language");
  if (sourceLanguages.length > 0) {
    params.set("source_language", sourceLanguages.join(","));
  } else {
    params.delete("source_language");
  }

  const nextQuery = params.toString();
  return `${pathname}${nextQuery ? `?${nextQuery}` : ""}${hash}`;
}
