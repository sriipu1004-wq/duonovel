"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

type WorkPagePrefetcherProps = {
  seriesId: string;
  currentTab: "toc" | "readers";
  currentRangeStart: number;
  selectedReaderKey?: string;
  selectedReaderName?: string;
};

type ReaderSelectionEventDetail = {
  seriesId: string;
  readerKey?: string;
  readerName?: string;
};

const READER_SELECTION_EVENT = "libread:reader-selection-change";

function buildWorksHref(args: {
  seriesId: string;
  tab: "toc" | "readers";
  rangeStart: number;
  readerKey?: string;
  readerName?: string;
}): string {
  const query = new URLSearchParams();
  query.set("tab", args.tab);
  query.set("range", String(args.rangeStart));

  if (args.readerKey) {
    query.set("readerKey", args.readerKey);
  }

  if (args.readerName) {
    query.set("readerName", args.readerName);
  }

  return `/works/${args.seriesId}?${query.toString()}`;
}

function scheduleIdleTask(callback: () => void): void {
  if (typeof window === "undefined") {
    return;
  }

  const requestIdle =
    window.requestIdleCallback ??
    ((run: IdleRequestCallback) =>
      window.setTimeout(() => {
        run({
          didTimeout: false,
          timeRemaining: () => 0,
        });
      }, 200));

  requestIdle(() => callback());
}

export default function WorkPagePrefetcher({
  seriesId,
  currentRangeStart,
  selectedReaderKey,
  selectedReaderName,
}: WorkPagePrefetcherProps) {
  const router = useRouter();

  useEffect(() => {
    const prefetchTabs = (readerKey?: string, readerName?: string) => {
      scheduleIdleTask(() => {
        router.prefetch(
          buildWorksHref({
            seriesId,
            tab: "toc",
            rangeStart: currentRangeStart,
            readerKey,
            readerName,
          })
        );

        router.prefetch(
          buildWorksHref({
            seriesId,
            tab: "readers",
            rangeStart: currentRangeStart,
            readerKey,
            readerName,
          })
        );
      });
    };

    prefetchTabs(selectedReaderKey, selectedReaderName);

    if (typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem(`duonovel:selected-reader:${seriesId}`);
        const parsed = raw
          ? (JSON.parse(raw) as { readerKey?: string; readerName?: string })
          : null;

        if (parsed?.readerKey || parsed?.readerName) {
          prefetchTabs(parsed.readerKey, parsed.readerName);
        }
      } catch {
        // 保存済み選択のprefetchに失敗してもページ動作は止めない
      }
    }

    const handleReaderSelectionChange = (event: Event) => {
      const customEvent = event as CustomEvent<ReaderSelectionEventDetail>;
      const detail = customEvent.detail;

      if (!detail || detail.seriesId !== seriesId) {
        return;
      }

      prefetchTabs(detail.readerKey, detail.readerName);
    };

    window.addEventListener(READER_SELECTION_EVENT, handleReaderSelectionChange);

    return () => {
      window.removeEventListener(READER_SELECTION_EVENT, handleReaderSelectionChange);
    };
  }, [
    currentRangeStart,
    router,
    selectedReaderKey,
    selectedReaderName,
    seriesId,
  ]);

  return null;
}