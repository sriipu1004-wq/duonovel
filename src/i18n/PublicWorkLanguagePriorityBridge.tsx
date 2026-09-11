"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { stripUiLocalePrefix, type UiLocale } from "./config";
import type { ContentLanguage } from "./contentLanguage";

const DISCOVERY_PATHS = new Set(["/", "/search", "/search/saved"]);

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

function applyPriority(locale: UiLocale) {
  const cards = Array.from(
    document.querySelectorAll<HTMLElement>("[data-content-language]")
  );

  for (const card of cards) {
    const language = card.dataset.contentLanguage as ContentLanguage | undefined;
    const item = findSortableItem(card);
    item.style.order = language === locale ? "-1" : "0";
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

    const run = () => applyPriority(locale);
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

    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [locale, route]);

  return null;
}
