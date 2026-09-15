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
import { preservePublicSearchLanguageFilters } from "@/lib/search/publicSearchLanguageHref";
import { runWithPublicSearchLanguageFilters } from "@/lib/search/publicSearchRequestContext";
import { localizeLegacySearchText } from "@/lib/search/searchLocaleCopy";
import type {
  PublicTranslationTargetLanguage,
  SupportedLanguageTag,
} from "@/lib/translation/languageRegistry";
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

function localizeSplitLegacyText(value: string, locale: Exclude<UiLocale, "ja">) {
  if (value.trim() === "現在表示:") {
    return value.replace(
      "現在表示:",
      locale === "en" ? "Current shelf:" : "현재 표시:"
    );
  }
  return localizeLegacySearchText(value, locale);
}

function localizeLegacySearchNode(
  node: ReactNode,
  locale: UiLocale,
  sourceLanguage: SupportedLanguageTag | null,
  readLanguage: PublicTranslationTargetLanguage | null
): ReactNode {
  if (typeof node === "string") {
    return locale === "ja" ? node : localizeSplitLegacyText(node, locale);
  }

  if (Array.isArray(node)) {
    if (
      locale !== "ja" &&
      node.length === 2 &&
      typeof node[0] === "number" &&
      node[1] === "件"
    ) {
      const count = node[0];
      return [
        count,
        locale === "en"
          ? count === 1
            ? " work"
            : " works"
          : "개 작품",
      ];
    }
    return node.map((child) =>
      localizeLegacySearchNode(child, locale, sourceLanguage, readLanguage)
    );
  }

  if (!isValidElement(node)) {
    return node;
  }

  const element = node as ReactElement<SearchElementProps>;
  const nextProps: SearchElementProps = {};
  let changed = false;

  if ("children" in element.props) {
    nextProps.children = localizeLegacySearchNode(
      element.props.children,
      locale,
      sourceLanguage,
      readLanguage
    );
    changed = nextProps.children !== element.props.children;
  }

  if (typeof element.props.href === "string" && element.props.href.startsWith("/")) {
    const preservedHref = preservePublicSearchLanguageFilters(element.props.href, {
      sourceLanguage,
      readLanguage,
    });
    const localizedHref = localizePath(preservedHref, locale);
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

  const renderedPage = localizeLegacySearchNode(
    filteredEmptyStatePage,
    locale,
    sourceLanguage,
    readLanguage
  );

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
