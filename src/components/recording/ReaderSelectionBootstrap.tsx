"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

type ReaderSelectionBootstrapProps = {
  seriesId: string;
  currentTab: "toc" | "readers";
  currentRangeStart: number;
  currentReaderKey?: string;
  currentReaderName?: string;
};

type StoredReaderSelection = {
  readerKey?: string;
  readerName?: string;
};

type ReaderSelectionEventDetail = {
  seriesId: string;
  readerKey?: string;
  readerName?: string;
};

const READER_SELECTION_STORAGE_PREFIX = "duonovel:selected-reader:";
const READER_SELECTION_EVENT = "libread:reader-selection-change";

const SELECTED_CARD_CLASS = "border-sky-200 bg-sky-50/60";
const UNSELECTED_CARD_CLASS = "border-black/10 bg-neutral-50";

function getStorageKey(seriesId: string): string {
  return `${READER_SELECTION_STORAGE_PREFIX}${seriesId}`;
}

function normalizeReaderSelection(
  value: StoredReaderSelection | null | undefined
): StoredReaderSelection | null {
  const readerKey =
    typeof value?.readerKey === "string" && value.readerKey.trim().length > 0
      ? value.readerKey.trim()
      : undefined;

  const readerName =
    typeof value?.readerName === "string" && value.readerName.trim().length > 0
      ? value.readerName.trim()
      : undefined;

  if (!readerKey && !readerName) {
    return null;
  }

  return {
    readerKey,
    readerName,
  };
}

function readStoredReaderSelection(seriesId: string): StoredReaderSelection | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(getStorageKey(seriesId));
    if (!raw) {
      return null;
    }

    return normalizeReaderSelection(JSON.parse(raw) as StoredReaderSelection);
  } catch {
    return null;
  }
}

function writeStoredReaderSelection(
  seriesId: string,
  selection: StoredReaderSelection | null
): void {
  if (typeof window === "undefined") {
    return;
  }

  const normalized = normalizeReaderSelection(selection);

  if (!normalized) {
    window.localStorage.removeItem(getStorageKey(seriesId));
    return;
  }

  window.localStorage.setItem(getStorageKey(seriesId), JSON.stringify(normalized));
}

function applyReaderSelectionToUrlSearchParams(
  searchParams: URLSearchParams,
  selection: StoredReaderSelection | null
): void {
  const normalized = normalizeReaderSelection(selection);

  if (normalized?.readerKey) {
    searchParams.set("readerKey", normalized.readerKey);
  } else {
    searchParams.delete("readerKey");
  }

  if (normalized?.readerName) {
    searchParams.set("readerName", normalized.readerName);
  } else {
    searchParams.delete("readerName");
  }
}

function applyReaderSelectionToCurrentUrl(args: {
  seriesId: string;
  currentTab: "toc" | "readers";
  currentRangeStart: number;
  selection: StoredReaderSelection | null;
}): void {
  if (typeof window === "undefined") {
    return;
  }

  const url = new URL(window.location.href);
  const worksPath = `/works/${args.seriesId}`;

  if (url.pathname !== worksPath) {
    return;
  }

  if (!url.searchParams.get("tab")) {
    url.searchParams.set("tab", args.currentTab);
  }

  if (!url.searchParams.get("range")) {
    url.searchParams.set("range", String(args.currentRangeStart));
  }

  applyReaderSelectionToUrlSearchParams(url.searchParams, args.selection);

  window.history.replaceState(
    window.history.state,
    "",
    `${url.pathname}${url.search}${url.hash}`
  );
}

function applyReaderSelectionToPageLinks(args: {
  seriesId: string;
  selection: StoredReaderSelection | null;
}): void {
  if (typeof window === "undefined") {
    return;
  }

  const readPathPrefix = `/read/${args.seriesId}/`;
  const worksPath = `/works/${args.seriesId}`;

  document.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((anchor) => {
    const rawHref = anchor.getAttribute("href");
    if (!rawHref) {
      return;
    }

    let url: URL;

    try {
      url = new URL(rawHref, window.location.origin);
    } catch {
      return;
    }

    if (url.origin !== window.location.origin) {
      return;
    }

    const shouldUpdate =
      url.pathname.startsWith(readPathPrefix) || url.pathname === worksPath;

    if (!shouldUpdate) {
      return;
    }

    applyReaderSelectionToUrlSearchParams(url.searchParams, args.selection);

    anchor.setAttribute("href", `${url.pathname}${url.search}${url.hash}`);
  });
}

function updateSelectedReaderLabel(selection: StoredReaderSelection | null): void {
  if (typeof document === "undefined") {
    return;
  }

  const label = document.querySelector<HTMLElement>("[data-selected-reader-label]");
  if (!label) {
    return;
  }

  const normalized = normalizeReaderSelection(selection);
  const text = normalized?.readerName || normalized?.readerKey || "";

  if (!text) {
    label.hidden = true;
    label.textContent = "";
    return;
  }

  label.hidden = false;
  label.textContent = `選択中朗読者: ${text}`;
}

function isSameReader(args: {
  selection: StoredReaderSelection | null;
  readerKey: string;
  readerName: string;
}): boolean {
  const selection = normalizeReaderSelection(args.selection);
  if (!selection) {
    return false;
  }

  return (
    (!!selection.readerKey && selection.readerKey === args.readerKey) ||
    (!!selection.readerName && selection.readerName === args.readerName)
  );
}

function updateReaderCards(selection: StoredReaderSelection | null): void {
  if (typeof document === "undefined") {
    return;
  }

  document.querySelectorAll<HTMLElement>("[data-reader-card]").forEach((card) => {
    const readerKey = card.dataset.readerKey ?? "";
    const readerName = card.dataset.readerName ?? "";
    const selected = isSameReader({
      selection,
      readerKey,
      readerName,
    });

    card.classList.remove(...SELECTED_CARD_CLASS.split(" "));
    card.classList.remove(...UNSELECTED_CARD_CLASS.split(" "));

    if (selected) {
      card.classList.add(...SELECTED_CARD_CLASS.split(" "));
    } else {
      card.classList.add(...UNSELECTED_CARD_CLASS.split(" "));
    }
  });
}

function dispatchReaderSelection(args: {
  seriesId: string;
  selection: StoredReaderSelection | null;
}): void {
  if (typeof window === "undefined") {
    return;
  }

  const normalized = normalizeReaderSelection(args.selection);

  window.dispatchEvent(
    new CustomEvent<ReaderSelectionEventDetail>(READER_SELECTION_EVENT, {
      detail: {
        seriesId: args.seriesId,
        readerKey: normalized?.readerKey,
        readerName: normalized?.readerName,
      },
    })
  );
}

export default function ReaderSelectionBootstrap({
  seriesId,
  currentTab,
  currentRangeStart,
  currentReaderKey,
  currentReaderName,
}: ReaderSelectionBootstrapProps) {
  const router = useRouter();

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    let activeSelection: StoredReaderSelection | null =
      normalizeReaderSelection({
        readerKey: currentReaderKey,
        readerName: currentReaderName,
      }) ?? readStoredReaderSelection(seriesId);

    const applySelection = (selection: StoredReaderSelection | null) => {
      activeSelection = normalizeReaderSelection(selection);
      writeStoredReaderSelection(seriesId, activeSelection);
      applyReaderSelectionToCurrentUrl({
        seriesId,
        currentTab,
        currentRangeStart,
        selection: activeSelection,
      });
      applyReaderSelectionToPageLinks({
        seriesId,
        selection: activeSelection,
      });
      updateSelectedReaderLabel(activeSelection);
      updateReaderCards(activeSelection);
    };

    applySelection(activeSelection);

    if (activeSelection) {
      dispatchReaderSelection({
        seriesId,
        selection: activeSelection,
      });
    }

    const handleReaderSelectionChange = (event: Event) => {
      const customEvent = event as CustomEvent<ReaderSelectionEventDetail>;
      const detail = customEvent.detail;

      if (!detail || detail.seriesId !== seriesId) {
        return;
      }

      applySelection(
        normalizeReaderSelection({
          readerKey: detail.readerKey,
          readerName: detail.readerName,
        })
      );
    };

    const handleReadLinkClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      const anchor = target.closest<HTMLAnchorElement>("a[href]");
      if (!anchor) {
        return;
      }

      const rawHref = anchor.getAttribute("href");
      if (!rawHref) {
        return;
      }

      let url: URL;

      try {
        url = new URL(rawHref, window.location.origin);
      } catch {
        return;
      }

      if (url.origin !== window.location.origin) {
        return;
      }

      const readPathPrefix = `/read/${seriesId}/`;
      if (!url.pathname.startsWith(readPathPrefix)) {
        return;
      }

      applyReaderSelectionToUrlSearchParams(url.searchParams, activeSelection);

      event.preventDefault();
      event.stopPropagation();

      router.push(`${url.pathname}${url.search}${url.hash}`);
    };

    window.addEventListener(READER_SELECTION_EVENT, handleReaderSelectionChange);
    document.addEventListener("click", handleReadLinkClick, true);

    return () => {
      window.removeEventListener(READER_SELECTION_EVENT, handleReaderSelectionChange);
      document.removeEventListener("click", handleReadLinkClick, true);
    };
  }, [
    currentRangeStart,
    currentReaderKey,
    currentReaderName,
    currentTab,
    router,
    seriesId,
  ]);

  return null;
}