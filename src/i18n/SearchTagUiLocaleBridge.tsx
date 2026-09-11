"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import type { UiLocale } from "./config";
import { stripUiLocalePrefix } from "./config";
import { localizeTagLabel } from "./tagLabels";

export default function SearchTagUiLocaleBridge({ locale }: { locale: UiLocale }) {
  const pathname = usePathname();

  useEffect(() => {
    if (locale === "ja") return;
    const route = stripUiLocalePrefix(pathname);
    if (route !== "/search" && route !== "/search/saved") return;

    const apply = () => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const nodes: Text[] = [];
      while (walker.nextNode()) nodes.push(walker.currentNode as Text);

      for (const node of nodes) {
        const parent = node.parentElement;
        if (!parent || parent.closest("script, style, textarea, input, [data-no-ui-localize]")) {
          continue;
        }
        const raw = node.data.trim();
        if (!raw.startsWith("#") || /\s/u.test(raw.slice(1))) continue;
        const localized = localizeTagLabel(raw, locale);
        if (localized === raw) continue;
        const leading = node.data.match(/^\s*/u)?.[0] ?? "";
        const trailing = node.data.match(/\s*$/u)?.[0] ?? "";
        node.data = `${leading}${localized}${trailing}`;
      }
    };

    apply();
    let scheduled = false;
    const observer = new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        apply();
      });
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [locale, pathname]);

  return null;
}
