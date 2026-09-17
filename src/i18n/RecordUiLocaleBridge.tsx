"use client";

import { useLayoutEffect } from "react";
import type { UiLocale } from "./config";
import { stripUiLocalePrefix } from "./config";
import { localizePath } from "./navigation";

function setHrefIfChanged(anchor: HTMLAnchorElement | null, next: string) {
  if (!anchor) return;
  if (anchor.getAttribute("href") !== next) {
    anchor.setAttribute("href", next);
  }
}

function repairRecordNavigation(root: HTMLElement, locale: UiLocale) {
  setHrefIfChanged(
    root.querySelector<HTMLAnchorElement>('a[href="#record-submitted"]'),
    localizePath("/record?filter=submitted#record-search-results", locale)
  );

  setHrefIfChanged(
    root.querySelector<HTMLAnchorElement>('a[href="#record-bookmarked"]'),
    localizePath("/record?filter=bookmarked#record-search-results", locale)
  );

  const legacyRequests = root.querySelector<HTMLAnchorElement>('a[href="#record-requests"]');
  if (legacyRequests && !legacyRequests.hidden) {
    legacyRequests.hidden = true;
  }
}

export default function RecordUiLocaleBridge({ locale }: { locale: UiLocale }) {
  useLayoutEffect(() => {
    if (stripUiLocalePrefix(window.location.pathname) !== "/record") return;

    const run = () => {
      const root = document.querySelector<HTMLElement>("main");
      if (root) repairRecordNavigation(root, locale);
    };

    run();

    const observer = new MutationObserver(run);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
    });

    return () => observer.disconnect();
  }, [locale]);

  return null;
}
