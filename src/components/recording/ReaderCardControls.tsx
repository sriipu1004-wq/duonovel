"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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

const DEMO_PREVIEW_TARGET_SECONDS = 10;
const DEMO_PREVIEW_MAX_SECONDS = 14;

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

export default function ReaderCardControls({
  seriesId,
  readerKey,
  readerName,
  isSelected,
  demoAudioUrl,
  currentTab,
  currentRangeStart,
}: ReaderCardControlsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stopAtSecondsRef = useRef<number>(DEMO_PREVIEW_TARGET_SECONDS);
  const [isDemoPlaying, setIsDemoPlaying] = useState(false);
  const [isDemoLoading, setIsDemoLoading] = useState(false);

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
    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        `duonovel:selected-reader:${seriesId}`,
        JSON.stringify({
          readerKey,
          readerName,
        })
      );
    }

    const nextQuery = new URLSearchParams(searchParams.toString());
    nextQuery.set("tab", currentTab);
    nextQuery.set("range", String(currentRangeStart));
    nextQuery.set("readerKey", readerKey);
    nextQuery.set("readerName", readerName);

    router.replace(`${pathname}?${nextQuery.toString()}`, {
      scroll: false,
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
          isSelected
            ? "border-sky-200 bg-sky-50 text-black"
            : "border-black/10 bg-neutral-200 text-black hover:bg-neutral-300",
        ].join(" ")}
      >
        {isSelected ? "選択中" : "選択する"}
      </button>
    </div>
  );
}