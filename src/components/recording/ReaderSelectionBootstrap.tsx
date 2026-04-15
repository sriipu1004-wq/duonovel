"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

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

function readStoredReaderSelection(seriesId: string): StoredReaderSelection | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(`duonovel:selected-reader:${seriesId}`);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as StoredReaderSelection | null;
    if (!parsed) {
      return null;
    }

    return {
      readerKey:
        typeof parsed.readerKey === "string" && parsed.readerKey.trim().length > 0
          ? parsed.readerKey
          : undefined,
      readerName:
        typeof parsed.readerName === "string" && parsed.readerName.trim().length > 0
          ? parsed.readerName
          : undefined,
    };
  } catch {
    return null;
  }
}

export default function ReaderSelectionBootstrap({
  seriesId,
  currentTab,
  currentRangeStart,
  currentReaderKey,
  currentReaderName,
}: ReaderSelectionBootstrapProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (currentReaderKey || currentReaderName) {
      window.localStorage.setItem(
        `duonovel:selected-reader:${seriesId}`,
        JSON.stringify({
          readerKey: currentReaderKey ?? "",
          readerName: currentReaderName ?? "",
        })
      );
      return;
    }

    const stored = readStoredReaderSelection(seriesId);
    if (!stored) {
      return;
    }

    if (!stored.readerKey && !stored.readerName) {
      return;
    }

    const nextQuery = new URLSearchParams(searchParams.toString());
    nextQuery.set("tab", currentTab);
    nextQuery.set("range", String(currentRangeStart));

    if (stored.readerKey) {
      nextQuery.set("readerKey", stored.readerKey);
    }

    if (stored.readerName) {
      nextQuery.set("readerName", stored.readerName);
    }

    router.replace(`${pathname}?${nextQuery.toString()}`, {
      scroll: false,
    });
  }, [
    currentRangeStart,
    currentReaderKey,
    currentReaderName,
    currentTab,
    pathname,
    router,
    searchParams,
    seriesId,
  ]);

  return null;
}