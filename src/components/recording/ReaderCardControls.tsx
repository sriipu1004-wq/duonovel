"use client";

import { useEffect, useRef, useState } from "react";
import {
  buildNemoTimingPublicUrlFromAudioPublicUrl,
  parseNemoGeneratedSentenceTimings,
} from "@/lib/recording/nemoTiming";

type ReaderCardControlsProps = {
  seriesId: string;
  readerKey: string;
  readerName: string;
  isSelected: boolean;
  demoAudioUrl?: string | null;
  currentTab: "toc" | "readers";
  currentRangeStart: number;
};

type ReaderSelectionEventDetail = {
  seriesId: string;
  readerKey?: string;
  readerName?: string;
};

const DEMO_PREVIEW_TARGET_SECONDS = 10;
const DEMO_PREVIEW_MAX_SECONDS = 14;
const READER_SELECTION_EVENT = "libread:reader-selection-change";

function getDemoPreviewEndSecondsFromPayload(payload: unknown): number {
  const timings = parseNemoGeneratedSentenceTimings(payload);

  if (timings.length === 0) {
    return DEMO_PREVIEW_TARGET_SECONDS;
  }

  const firstBoundaryAfterTarget = timings.find(
    (timing) =>
      Number.isFinite(timing.timeSeconds) &&
      timing.timeSeconds >= DEMO_PREVIEW_TARGET_SECONDS
  );

  if (firstBoundaryAfterTarget) {
    return Math.min(
      Math.max(firstBoundaryAfterTarget.timeSeconds, DEMO_PREVIEW_TARGET_SECONDS),
      DEMO_PREVIEW_MAX_SECONDS
    );
  }

  const lastTiming = timings[timings.length - 1];
  const lastEndSeconds =
    lastTiming.timeSeconds + Math.max(lastTiming.durationSeconds, 0);

  if (Number.isFinite(lastEndSeconds) && lastEndSeconds > 0) {
    return Math.min(
      Math.max(lastEndSeconds, DEMO_PREVIEW_TARGET_SECONDS),
      DEMO_PREVIEW_MAX_SECONDS
    );
  }

  return DEMO_PREVIEW_TARGET_SECONDS;
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isSameReader(args: {
  currentReaderKey?: string;
  currentReaderName?: string;
  readerKey: string;
  readerName: string;
}): boolean {
  const currentReaderKey = normalizeText(args.currentReaderKey);
  const currentReaderName = normalizeText(args.currentReaderName);

  return (
    (!!currentReaderKey && currentReaderKey === args.readerKey) ||
    (!!currentReaderName && currentReaderName === args.readerName)
  );
}

function updateCurrentWorksUrl(args: {
  seriesId: string;
  currentTab: "toc" | "readers";
  currentRangeStart: number;
  readerKey?: string;
  readerName?: string;
}): void {
  if (typeof window === "undefined") {
    return;
  }

  const url = new URL(window.location.href);
  const worksPath = `/works/${args.seriesId}`;

  if (url.pathname !== worksPath) {
    return;
  }

  url.searchParams.set("tab", args.currentTab);
  url.searchParams.set("range", String(args.currentRangeStart));

  if (args.readerKey) {
    url.searchParams.set("readerKey", args.readerKey);
  } else {
    url.searchParams.delete("readerKey");
  }

  if (args.readerName) {
    url.searchParams.set("readerName", args.readerName);
  } else {
    url.searchParams.delete("readerName");
  }

  window.history.replaceState(
    window.history.state,
    "",
    `${url.pathname}${url.search}${url.hash}`
  );
}

function dispatchReaderSelection(args: {
  seriesId: string;
  readerKey?: string;
  readerName?: string;
}): void {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<ReaderSelectionEventDetail>(READER_SELECTION_EVENT, {
      detail: args,
    })
  );
}

export default function ReaderCardControls({
  seriesId,
  readerKey,
  readerName,
  isSelected,
  demoAudioUrl,
  currentTab,
  currentRangeStart,
}: ReaderCardControlsProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stopAtSecondsRef = useRef<number>(DEMO_PREVIEW_TARGET_SECONDS);

  const [isDemoPlaying, setIsDemoPlaying] = useState(false);
  const [isDemoLoading, setIsDemoLoading] = useState(false);
  const [activeReader, setActiveReader] = useState<{
    readerKey?: string;
    readerName?: string;
  }>(() =>
    isSelected
      ? {
          readerKey,
          readerName,
        }
      : {}
  );

  const selected = isSameReader({
    currentReaderKey: activeReader.readerKey,
    currentReaderName: activeReader.readerName,
    readerKey,
    readerName,
  });

  useEffect(() => {
    const handleReaderSelectionChange = (event: Event) => {
      const customEvent = event as CustomEvent<ReaderSelectionEventDetail>;
      const detail = customEvent.detail;

      if (!detail || detail.seriesId !== seriesId) {
        return;
      }

      setActiveReader({
        readerKey: detail.readerKey,
        readerName: detail.readerName,
      });
    };

    window.addEventListener(READER_SELECTION_EVENT, handleReaderSelectionChange);

    return () => {
      window.removeEventListener(READER_SELECTION_EVENT, handleReaderSelectionChange);
    };
  }, [seriesId]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        audioRef.current = null;
      }
    };
  }, []);

  async function handleSelect() {
    const shouldClearSelection = selected;

    if (typeof window !== "undefined") {
      if (shouldClearSelection) {
        window.localStorage.removeItem(`duonovel:selected-reader:${seriesId}`);
      } else {
        window.localStorage.setItem(
          `duonovel:selected-reader:${seriesId}`,
          JSON.stringify({
            readerKey,
            readerName,
          })
        );
      }
    }

    const nextReader = shouldClearSelection
      ? {}
      : {
          readerKey,
          readerName,
        };

    setActiveReader(nextReader);

    updateCurrentWorksUrl({
      seriesId,
      currentTab,
      currentRangeStart,
      readerKey: nextReader.readerKey,
      readerName: nextReader.readerName,
    });

    dispatchReaderSelection({
      seriesId,
      readerKey: nextReader.readerKey,
      readerName: nextReader.readerName,
    });
  }

  async function resolveDemoEndSeconds(): Promise<number> {
    if (!demoAudioUrl) {
      return DEMO_PREVIEW_TARGET_SECONDS;
    }

    const timingUrl = buildNemoTimingPublicUrlFromAudioPublicUrl(demoAudioUrl);
    if (!timingUrl) {
      return DEMO_PREVIEW_TARGET_SECONDS;
    }

    try {
      const response = await fetch(timingUrl, {
        cache: "force-cache",
      });

      if (!response.ok) {
        return DEMO_PREVIEW_TARGET_SECONDS;
      }

      const payload = await response.json();
      return getDemoPreviewEndSecondsFromPayload(payload);
    } catch {
      return DEMO_PREVIEW_TARGET_SECONDS;
    }
  }

  async function handleToggleDemo() {
    if (!demoAudioUrl) {
      return;
    }

    if (audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsDemoPlaying(false);
      setIsDemoLoading(false);
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }

    setIsDemoLoading(true);

    const previewEndSeconds = await resolveDemoEndSeconds();
    stopAtSecondsRef.current = previewEndSeconds;

    const audio = new Audio(demoAudioUrl);
    audio.preload = "auto";
    audio.volume = 1;
    audioRef.current = audio;

    const stopPlayback = () => {
      audio.pause();
      audio.currentTime = 0;
      setIsDemoPlaying(false);
      setIsDemoLoading(false);
    };

    const handleTimeUpdate = () => {
      if (audio.currentTime >= stopAtSecondsRef.current) {
        stopPlayback();
      }
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", stopPlayback, { once: true });

    try {
      await audio.play();
      setIsDemoPlaying(true);
      setIsDemoLoading(false);
    } catch {
      stopPlayback();
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        disabled={!demoAudioUrl || isDemoLoading}
        onClick={() => {
          void handleToggleDemo();
        }}
        className={[
          "rounded-full border px-4 py-2 text-sm transition",
          !demoAudioUrl
            ? "border-black/10 bg-neutral-100 text-neutral-400"
            : "border-black/10 bg-white text-neutral-800 hover:bg-neutral-50",
        ].join(" ")}
      >
        {isDemoLoading ? "読込中..." : isDemoPlaying ? "デモ停止" : "デモ再生"}
      </button>

      <button
        type="button"
        onClick={() => {
          void handleSelect();
        }}
        className={[
          "rounded-full border px-4 py-2 text-sm font-medium transition",
          selected
            ? "border-sky-200 bg-sky-50 text-black"
            : "border-black/10 bg-neutral-200 text-black hover:bg-neutral-300",
        ].join(" ")}
      >
        {selected ? "選択中" : "選択する"}
      </button>
    </div>
  );
}