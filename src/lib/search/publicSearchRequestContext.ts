import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import type { SupportedLanguageTag } from "@/lib/translation/languageRegistry";

export type PublicSearchLanguageFilters = {
  sourceLanguages: SupportedLanguageTag[];
};

const publicSearchLanguageStorage =
  new AsyncLocalStorage<PublicSearchLanguageFilters>();

export function runWithPublicSearchLanguageFilters<T>(
  filters: PublicSearchLanguageFilters,
  callback: () => T
): T {
  return publicSearchLanguageStorage.run(filters, callback);
}

export function getPublicSearchLanguageFilters(): PublicSearchLanguageFilters | null {
  return publicSearchLanguageStorage.getStore() ?? null;
}
