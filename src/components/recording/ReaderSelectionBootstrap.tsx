"use client";

import { useEffect } from "react";

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

function getStorageKey(seriesId: string): string {
  return `${READER_SELECTION_STORAGE_PREFIX}${seriesId}`;
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

    const parsed = JSON.parse(raw) as StoredReaderSelection | null;
    if (!parsed) {
      return null;
    }

    return normalizeReaderSelection(parsed);
  } catch {
    return null;
  }
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

function writeStoredReaderSelection(
  seriesId: string,
  selection: StoredReaderSelection
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
  selection: StoredReaderSelection
): void {
  if (selection.readerKey) {
    searchParams.set("readerKey", selection.readerKey);
  } else {
    searchParams.delete("readerKey");
  }

  if (selection.readerName) {
    searchParams.set("readerName", selection.readerName);
  } else {
    searchParams.delete("readerName");
  }
}

function applyReaderSelectionToCurrentUrl(args: {
  seriesId: string;
  currentTab: "toc" | "readers";
  currentRangeStart: number;
  selection: StoredReaderSelection;
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

  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

function applyReaderSelectionToPageLinks(args: {
  seriesId: string;
  selection: StoredReaderSelection;
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

function dispatchReaderSelection(args: {
  seriesId: string;
  selection: StoredReaderSelection;
}): void {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<ReaderSelectionEventDetail>(READER_SELECTION_EVENT, {
      detail: {
        seriesId: args.seriesId,
        readerKey: args.selection.readerKey,
        readerName: args.selection.readerName,
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
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const initialSelection =
      normalizeReaderSelection({
        readerKey: currentReaderKey,
        readerName: currentReaderName,
      }) ?? readStoredReaderSelection(seriesId);

    if (!initialSelection) {
      return;
    }

    writeStoredReaderSelection(seriesId, initialSelection);
    applyReaderSelectionToCurrentUrl({
      seriesId,
      currentTab,
      currentRangeStart,
      selection: initialSelection,
    });
    applyReaderSelectionToPageLinks({
      seriesId,
      selection: initialSelection,
    });
    dispatchReaderSelection({
      seriesId,
      selection: initialSelection,
    });

    const handleReaderSelectionChange = (event: Event) => {
      const customEvent = event as CustomEvent<ReaderSelectionEventDetail>;
      const detail = customEvent.detail;

      if (!detail || detail.seriesId !== seriesId) {
        return;
      }

      const nextSelection = normalizeReaderSelection({
        readerKey: detail.readerKey,
        readerName: detail.readerName,
      });

      if (!nextSelection) {
        return;
      }

      writeStoredReaderSelection(seriesId, nextSelection);
      applyReaderSelectionToCurrentUrl({
        seriesId,
        currentTab,
        currentRangeStart,
        selection: nextSelection,
      });
      applyReaderSelectionToPageLinks({
        seriesId,
        selection: nextSelection,
      });
    };

    window.addEventListener(READER_SELECTION_EVENT, handleReaderSelectionChange);

    return () => {
      window.removeEventListener(READER_SELECTION_EVENT, handleReaderSelectionChange);
    };
  }, [
    currentRangeStart,
    currentReaderKey,
    currentReaderName,
    currentTab,
    seriesId,
  ]);

  return null;
}