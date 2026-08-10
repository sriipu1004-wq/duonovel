"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BilingualSegment } from "@/features/playback/BilingualPane";

type BilingualStudyControlsProps = {
  segments: BilingualSegment[];
  selectedSegmentId: string | null;
  tapRevealEnabled: boolean;
  onToggleTapReveal: () => void;
  onSelectSegment: (id: string) => void;
};

export default function BilingualStudyControls({
  segments,
  selectedSegmentId,
  tapRevealEnabled,
  onToggleTapReveal,
  onSelectSegment,
}: BilingualStudyControlsProps) {
  const [repeating, setRepeating] = useState(false);
  const [speechAvailable, setSpeechAvailable] = useState(true);
  const repeatRef = useRef(false);
  const runIdRef = useRef(0);
  const timeoutRef = useRef<number | null>(null);

  const selectedSegment =
    segments.find((segment) => segment.id === selectedSegmentId) ?? segments[0] ?? null;

  const stopSpeech = useCallback(() => {
    runIdRef.current += 1;
    repeatRef.current = false;
    setRepeating(false);

    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }, []);

  const speakSegment = useCallback(
    (segment: BilingualSegment, shouldRepeat: boolean) => {
      if (
        typeof window === "undefined" ||
        !("speechSynthesis" in window) ||
        typeof SpeechSynthesisUtterance === "undefined"
      ) {
        setSpeechAvailable(false);
        return;
      }

      const text = segment.en.trim();
      if (!text) return;

      runIdRef.current += 1;
      const runId = runIdRef.current;
      window.speechSynthesis.cancel();
      onSelectSegment(segment.id);

      const utterance = new SpeechSynthesisUtterance(text);
      const englishVoice = window.speechSynthesis
        .getVoices()
        .find((voice) => voice.lang.toLowerCase().startsWith("en"));

      utterance.lang = englishVoice?.lang || "en-US";
      utterance.rate = 1;
      if (englishVoice) utterance.voice = englishVoice;

      utterance.onend = () => {
        if (
          runIdRef.current !== runId ||
          !shouldRepeat ||
          !repeatRef.current
        ) {
          return;
        }

        timeoutRef.current = window.setTimeout(() => {
          timeoutRef.current = null;
          if (repeatRef.current) {
            speakSegment(segment, true);
          }
        }, 350);
      };

      utterance.onerror = () => {
        if (runIdRef.current === runId) {
          repeatRef.current = false;
          setRepeating(false);
        }
      };

      window.speechSynthesis.speak(utterance);
    },
    [onSelectSegment]
  );

  useEffect(() => {
    setSpeechAvailable(
      typeof window !== "undefined" && "speechSynthesis" in window
    );

    return () => {
      runIdRef.current += 1;
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  useEffect(() => {
    if (!repeating || !selectedSegment) return;
    repeatRef.current = true;
    speakSegment(selectedSegment, true);
  }, [selectedSegmentId]);

  function playOnce() {
    if (!selectedSegment) return;
    stopSpeech();
    speakSegment(selectedSegment, false);
  }

  function toggleRepeat() {
    if (repeating) {
      stopSpeech();
      return;
    }

    if (!selectedSegment) return;
    repeatRef.current = true;
    setRepeating(true);
    speakSegment(selectedSegment, true);
  }

  return (
    <div className="border-b border-black/10 bg-neutral-50 px-4 py-3 sm:px-6">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onToggleTapReveal}
          aria-pressed={tapRevealEnabled}
          className={[
            "rounded-full border px-3 py-2 text-xs font-medium transition",
            tapRevealEnabled
              ? "border-sky-300 bg-sky-100 text-black"
              : "border-black/10 bg-white text-neutral-700 hover:bg-neutral-50",
          ].join(" ")}
        >
          タップ対訳 {tapRevealEnabled ? "ON" : "OFF"}
        </button>

        <button
          type="button"
          onClick={playOnce}
          disabled={!speechAvailable || !selectedSegment}
          className="rounded-full border border-black/10 bg-white px-3 py-2 text-xs font-medium text-neutral-700 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          ▶ 1文再生
        </button>

        <button
          type="button"
          onClick={toggleRepeat}
          disabled={!speechAvailable || !selectedSegment}
          aria-pressed={repeating}
          className={[
            "rounded-full border px-3 py-2 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40",
            repeating
              ? "border-sky-300 bg-sky-100 text-black"
              : "border-black/10 bg-white text-neutral-700 hover:bg-neutral-50",
          ].join(" ")}
        >
          ↻ リピート {repeating ? "ON" : "OFF"}
        </button>

        <button
          type="button"
          onClick={stopSpeech}
          disabled={!speechAvailable}
          className="rounded-full border border-black/10 bg-white px-3 py-2 text-xs font-medium text-neutral-700 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          ■ 停止
        </button>

        {!speechAvailable ? (
          <span className="text-xs text-neutral-500">
            このブラウザでは英文読み上げを利用できません。
          </span>
        ) : null}
      </div>
    </div>
  );
}
