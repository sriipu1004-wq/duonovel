import PublicSearchReadIntentProvider from "@/components/search/PublicSearchReadIntentProvider";
import { getCachedPublicBaseWorkCards } from "@/lib/publicWorks";
import {
  parsePublicSearchReadLanguage,
  parsePublicSearchSourceLanguage,
} from "@/lib/search/publicWorkLanguageFilter";
import { runWithPublicSearchLanguageFilters } from "@/lib/search/publicSearchRequestContext";
import SearchPageLegacy from "./SearchPageLegacy";

type SearchPageProps = Parameters<typeof SearchPageLegacy>[0];

export default async function SearchPage(props: SearchPageProps) {
  const resolvedSearchParams = props.searchParams
    ? await props.searchParams
    : undefined;
  const rawParams = (resolvedSearchParams ?? {}) as Record<string, unknown>;
  const sourceLanguage = parsePublicSearchSourceLanguage(
    rawParams.source_language
  );
  const readLanguage = parsePublicSearchReadLanguage(rawParams.read_language);

  const visibleWorkMetadata = readLanguage
    ? (await getCachedPublicBaseWorkCards()).map((work) => ({
        seriesId: work.seriesId,
        sourceLanguage: work.sourceLanguage,
        translationEligible: work.translationEligible,
      }))
    : [];

  const page = await runWithPublicSearchLanguageFilters(
    { sourceLanguage, readLanguage },
    () => SearchPageLegacy(props)
  );

  return (
    <PublicSearchReadIntentProvider
      sourceLanguage={sourceLanguage}
      readLanguage={readLanguage}
      workMetadata={visibleWorkMetadata}
    >
      {page}
    </PublicSearchReadIntentProvider>
  );
}
