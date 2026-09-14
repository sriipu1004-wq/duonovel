import {
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import PublicSearchReadIntentProvider from "@/components/search/PublicSearchReadIntentProvider";
import { getCachedPublicBaseWorkCards } from "@/lib/publicWorks";
import {
  parsePublicSearchReadLanguage,
  parsePublicSearchSourceLanguage,
} from "@/lib/search/publicWorkLanguageFilter";
import { runWithPublicSearchLanguageFilters } from "@/lib/search/publicSearchRequestContext";
import SearchPageLegacy from "./SearchPageLegacy";

type SearchPageProps = Parameters<typeof SearchPageLegacy>[0];

function replaceExactText(
  node: ReactNode,
  from: string,
  to: string
): ReactNode {
  if (typeof node === "string") {
    return node === from ? to : node;
  }

  if (Array.isArray(node)) {
    return node.map((child) => replaceExactText(child, from, to));
  }

  if (!isValidElement(node)) {
    return node;
  }

  const element = node as ReactElement<{ children?: ReactNode }>;
  if (!("children" in element.props)) {
    return element;
  }

  return cloneElement(element, {
    children: replaceExactText(element.props.children, from, to),
  });
}

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

  const renderedPage =
    sourceLanguage || readLanguage
      ? replaceExactText(
          page,
          "まだ公開作品がない。",
          "条件に合う公開作品がない。"
        )
      : page;

  return (
    <PublicSearchReadIntentProvider
      sourceLanguage={sourceLanguage}
      readLanguage={readLanguage}
      workMetadata={visibleWorkMetadata}
    >
      {renderedPage}
    </PublicSearchReadIntentProvider>
  );
}
