import type { SupportedLanguageTag } from "@/lib/translation/languageRegistry";

export type LivePublicCatalogSeries = {
  id: string;
  content_rating: string | null;
  source_language: string | null;
};

export type CachedPublicCatalogCard = {
  seriesId: string;
  contentRating: "general" | "r18";
  sourceLanguage: SupportedLanguageTag | null;
};

/**
 * Fail closed when a cached card is no longer public, has changed its R18
 * rating, or no longer has the same canonical source language.
 *
 * The fresh input must come from a non-cached server-side query whose SQL
 * restricts series.publication_status = 'public'. Do not reuse cached data.
 */
export function filterCachedPublicCatalogByLiveSeries<T extends CachedPublicCatalogCard>(
  cards: readonly T[],
  liveSeries: readonly LivePublicCatalogSeries[]
): T[] {
  const current = new Map(liveSeries.map((series) => [series.id, series] as const));
  return cards.filter((card) => {
    const live = current.get(card.seriesId);
    if (!live) return false;
    if (live.content_rating !== card.contentRating) return false;
    if (!live.source_language || live.source_language !== card.sourceLanguage) return false;
    return true;
  });
}
