"use client";

import { useEffect } from "react";

export const PRIVATE_LIBRARY_PROGRESS_EVENT =
  "duonovel:private-library-reading-progress";

type PrivateLibraryProgressDetail = {
  chapterId: string;
  progressRatio: number;
  segmentIndex?: number | null;
};

export default function LibraryProgressTracker({
  chapterId,
}: {
  workId: string;
  chapterId: string;
  chapterNumber: number;
}) {
  useEffect(() => {
    let highestRatio = 0;
    let lastSentRatio = -1;
    let lastSegmentIndex: number | null = null;
    let sendTimer: number | null = null;

    function sendProgress(keepalive = false) {
      if (lastSentRatio >= 0 && highestRatio - lastSentRatio < 0.04) return;
      lastSentRatio = highestRatio;
      void fetch("/api/library/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chapterId,
          progressRatio: Math.min(1, Math.max(0, highestRatio)),
          segmentIndex: lastSegmentIndex,
        }),
        keepalive,
      }).catch(() => {
        // Progress is retried by future scroll/segment events.
      });
    }

    function scheduleProgressSend() {
      if (sendTimer !== null) return;
      sendTimer = window.setTimeout(() => {
        sendTimer = null;
        sendProgress();
      }, 800);
    }

    function handleWindowScroll() {
      const scrollable =
        document.documentElement.scrollHeight - window.innerHeight;
      const ratio = scrollable > 0 ? window.scrollY / scrollable : 1;
      highestRatio = Math.max(highestRatio, Math.min(1, Math.max(0, ratio)));
      scheduleProgressSend();
    }

    function handleBilingualProgress(event: Event) {
      const detail = (event as CustomEvent<PrivateLibraryProgressDetail>).detail;
      if (!detail || detail.chapterId !== chapterId) return;
      highestRatio = Math.max(
        highestRatio,
        Math.min(1, Math.max(0, Number(detail.progressRatio) || 0))
      );
      lastSegmentIndex =
        typeof detail.segmentIndex === "number" ? detail.segmentIndex : null;
      scheduleProgressSend();
    }

    function handlePageHide() {
      if (sendTimer !== null) window.clearTimeout(sendTimer);
      sendTimer = null;
      sendProgress(true);
    }

    // Register the chapter as last-opened even if the reader leaves at the top.
    sendProgress();
    window.addEventListener("scroll", handleWindowScroll, { passive: true });
    window.addEventListener(
      PRIVATE_LIBRARY_PROGRESS_EVENT,
      handleBilingualProgress
    );
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      if (sendTimer !== null) window.clearTimeout(sendTimer);
      window.removeEventListener("scroll", handleWindowScroll);
      window.removeEventListener(
        PRIVATE_LIBRARY_PROGRESS_EVENT,
        handleBilingualProgress
      );
      window.removeEventListener("pagehide", handlePageHide);
      sendProgress(true);
    };
  }, [chapterId]);

  return null;
}
