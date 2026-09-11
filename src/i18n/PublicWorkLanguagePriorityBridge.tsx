"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { stripUiLocalePrefix, type UiLocale } from "./config";
import type { ContentLanguage } from "./contentLanguage";

const DISCOVERY_PATHS = new Set(["/", "/search", "/search/saved"]);

function directLanguageCard(element: Element): HTMLElement | null {
  if (element instanceof HTMLElement && element.hasAttribute("data-content-language")) {
    return element;
  }

  for (const child of Array.from(element.children)) {
    if (child instanceof HTMLElement && child.hasAttribute("data-content-language")) {
      return child;
    }
  }

  return null;
}

function findSortableItem(card: HTMLElement): HTMLElement {
  let item: HTMLElement = card;

  for (let depth = 0; depth < 3; depth += 1) {
    const parent = item.parentElement;
    if (!parent) return item;

    const siblingsWithCards = Array.from(parent.children).filter((sibling) =>
      Boolean(directLanguageCard(sibling))
    );

    if (siblingsWithCards.length >= 2) return item;
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
