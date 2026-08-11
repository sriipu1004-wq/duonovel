"use client";

import { useEffect, useState } from "react";
import type { BilingualSegment } from "@/features/playback/BilingualPane";

type BilingualStudyControlsProps = {
  segments: BilingualSegment[];
  selectedSegmentId: string | null;
  onSelectSegment: (id: string) => void;
};

export default function BilingualStudyControls({
  segments,
  selectedSegmentId,
  onSelectSegment,
}: BilingualStudyControlsProps) {
  const [speechAvailable, setSpeechAvailable] = useState(true);

  const selectedSegment =
    segments.find((segment) => segment.id === selectedSegmentId) ?? segments[0] ?? null;

  useEffect(() => {
    setSpeechAvailable(
      typeof window !== "undefined" && "speechSynthesis" in window
    );

    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  function playOnce() {
    if (!selectedSegment) return;

    if (
      typeof window === "undefined" ||
      !("speechSynthesis" in window) ||
      typeof SpeechSynthesisUtterance === "undefined"
    ) {
      setSpeechAvailable(false);
      return;
    }

    const text = selectedSegment.en.trim();
    if (!text) return;

    window.speechSynthesis.cancel();
    onSelectSegment(selectedSegment.id);

    const utterance = new SpeechSynthesisUtterance(text);
    const englishVoice = window.speechSynthesis
      .getVoices()
      .find((voice) => voice.lang.toLowerCase().startsWith("en"));

    utterance.lang = englishVoice?.lang || "en-US";
    utterance.rate = 1;
    if (englishVoice) utterance.voice = englishVoice;
    window.speechSynthesis.speak(utterance);
  }

  return (
    <div className="border-b border-black/10 bg-neutral-50 px-4 py-3 sm:px-6">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={playOnce}
          disabled={!speechAvailable || !selectedSegment}
          className="rounded-full border border-black/10 bg-white px-3 py-2 text-xs font-medium text-neutral-700 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          ▶ 1文再生
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
