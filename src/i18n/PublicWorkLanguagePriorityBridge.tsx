"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { stripUiLocalePrefix, type UiLocale } from "./config";
import {
  CONTENT_LANGUAGE_FILTER_COOKIE,
  CONTENT_LANGUAGE_FILTER_EVENT,
  parseContentLanguageList,
  type ContentLanguage,
} from "./contentLanguage";

const DISCOVERY_PATHS = new Set(["/", "/search", "/search/saved"]);
const SEARCH_PATHS = new Set(["/search", "/search/saved"]);

function countLanguageCards(element: Element): number {
  const selfCount =
    element instanceof HTMLElement && element.hasAttribute("data-content-language")
      ? 1
      : 0;
  return selfCount + element.querySelectorAll("[data-content-language]").length;
}

function findSortableItem(card: HTMLElement): HTMLElement {
  let item: HTMLElement = card;

  for (let depth = 0; depth < 5; depth += 1) {
    const parent = item.parentElement;
    if (!parent) return card;

    const singleCardChildren = Array.from(parent.children).filter(
      (sibling) => countLanguageCards(sibling) === 1
    );

    if (
      countLanguageCards(item) === 1 &&
      singleCardChildren.length >= 2 &&
      singleCardChildren.includes(item)
    ) {
      return item;
    }

    item = parent;
  }

  return card;
}

function readSelectedLanguages(): ContentLanguage[] {
  const cookie = document.cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${CONTENT_LANGUAGE_FILTER_COOKIE}=`));
  if (!cookie) return [];

  try {
    return parseContentLanguageList(
      decodeURIComponent(cookie.slice(cookie.indexOf("=") + 1))
    );
  } catch {
    return [];
  }
}

function applyPriorityAndFilter(locale: UiLocale, route: string) {
  const cards = Array.from(
    document.querySelectorAll<HTMLElement>("[data-content-language]")
  );
  const selectedLanguages = SEARCH_PATHS.has(route)
    ? new Set(readSelectedLanguages())
    : null;
  const hasLanguageFilter = Boolean(selectedLanguages && selectedLanguages.size > 0);
  const handledItems = new Set<HTMLElement>();

  for (const card of cards) {
    const language = card.dataset.contentLanguage as ContentLanguage | undefined;
    const item = findSortableItem(card);

    if (!handledItems.has(item)) {
      item.style.order = language === locale ? "-1" : "0";
      item.hidden = Boolean(
        hasLanguageFilter && language && !selectedLanguages?.has(language)
      );
      handledItems.add(item);
    }
  }
}

export default function PublicWorkLanguagePriorityBridge({
  locale,
}: {
  locale: UiLocale;
}) {
  const pathname = usePathname();
  const route = stripUiLocalePrefix(pathname);

  useEffect(() => {
    if (!DISCOVERY_PATHS.has(route)) return;

    const run = () => applyPriorityAndFilter(locale, route);
    run();

    let scheduled = false;
    const observer = new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        run();
      });
    });

    const handleLanguageFilterChange = () => run();

    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener(CONTENT_LANGUAGE_FILTER_EVENT, handleLanguageFilterChange);

    return () => {
      observer.disconnect();
      window.removeEventListener(
        CONTENT_LANGUAGE_FILTER_EVENT,
        handleLanguageFilterChange
      );
    };
  }, [locale, route]);

  return null;
}
