import {
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import PublicSearchReadIntentProvider from "@/components/search/PublicSearchReadIntentProvider";
import { getUiLocale } from "@/i18n/server";
import { localizePath } from "@/i18n/navigation";
import type { UiLocale } from "@/i18n/config";
import { getCachedPublicBaseWorkCards } from "@/lib/publicWorks";
import {
  parsePublicSearchReadLanguage,
  parsePublicSearchSourceLanguage,
} from "@/lib/search/publicWorkLanguageFilter";
import { runWithPublicSearchLanguageFilters } from "@/lib/search/publicSearchRequestContext";
import { localizeLegacySearchText } from "@/lib/search/searchLocaleCopy";
import SearchPageLegacy from "./SearchPageLegacy";

type SearchPageProps = Parameters<typeof SearchPageLegacy>[0];

type SearchElementProps = {
  children?: ReactNode;
  href?: string;
};

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

  const element = node as ReactElement<SearchElementProps>;
  if (!("children" in element.props)) {
    return element;
  }

  return cloneElement(element, {
    children: replaceExactText(element.props.children, from, to),
  });
}

function localizeLegacySearchNode(
  node: ReactNode,
  locale: UiLocale
): ReactNode {
  if (locale === "ja") return node;

  if (typeof node === "string") {
    return localizeLegacySearchText(node, locale);
  }

  if (Array.isArray(node)) {
    return node.map((child) => localizeLegacySearchNode(child, locale));
  }

  if (!isValidElement(node)) {
    return node;
  }

  const element = node as ReactElement<SearchElementProps>;
  const nextProps: SearchElementProps = {};
  let changed = false;

  if ("children" in element.props) {
    nextProps.children = localizeLegacySearchNode(element.props.children, locale);
    changed = nextProps.children !== element.props.children;
  }

  if (typeof element.props.href === "string" && element.props.href.startsWith("/")) {
    const localizedHref = localizePath(element.props.href, locale);
    if (localizedHref !== element.props.href) {
      nextProps.href = localizedHref;
      changed = true;
    }
  }

  return changed ? cloneElement(element, nextProps) : element;
}

export default async function SearchPage(props: SearchPageProps) {
  const locale = await getUiLocale();
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

  const filteredEmptyStatePage =
    sourceLanguage || readLanguage
      ? replaceExactText(
          page,
          "まだ公開作品がない。",
          "条件に合う公開作品がない。"
        )
      : page;

  const renderedPage = localizeLegacySearchNode(filteredEmptyStatePage, locale);

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
