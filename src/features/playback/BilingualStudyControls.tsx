"use client";

import { useEffect, useState } from "react";
import type { BilingualSegment } from "@/features/playback/BilingualPane";
import {
  getSupportedLanguage,
  type PublicTranslationTargetLanguage,
} from "@/lib/translation/languageRegistry";

type BilingualStudyControlsProps = {
  segments: BilingualSegment[];
  selectedSegmentId: string | null;
  onSelectSegment: (id: string) => void;
  targetLanguage: PublicTranslationTargetLanguage;
};

export default function BilingualStudyControls({
  segments,
  selectedSegmentId,
  onSelectSegment,
  targetLanguage,
}: BilingualStudyControlsProps) {
  const [speechAvailable, setSpeechAvailable] = useState(
    () => typeof window !== "undefined" && "speechSynthesis" in window
  );

  const selectedSegment =
    segments.find((segment) => segment.id === selectedSegmentId) ?? segments[0] ?? null;

  useEffect(() => {
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

    const text = selectedSegment.translatedText.trim();
    if (!text) return;

    window.speechSynthesis.cancel();
    onSelectSegment(selectedSegment.id);

    const utterance = new SpeechSynthesisUtterance(text);
    const speechLanguage = getSupportedLanguage(targetLanguage).speechLanguage;
    const normalizedSpeechLanguage = speechLanguage.toLowerCase();
    const primaryLanguage = normalizedSpeechLanguage.split("-")[0];
    const voices = window.speechSynthesis.getVoices();
    const selectedVoice =
      voices.find(
        (voice) => voice.lang.toLowerCase() === normalizedSpeechLanguage
      ) ??
      voices.find((voice) => {
        const voiceLanguage = voice.lang.toLowerCase();
        return (
          voiceLanguage === primaryLanguage ||
          voiceLanguage.startsWith(primaryLanguage + "-")
        );
      });

    utterance.lang = selectedVoice?.lang || speechLanguage;
    utterance.rate = 1;
    if (selectedVoice) utterance.voice = selectedVoice;
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
            このブラウザでは対訳文の読み上げを利用できません。
          </span>
        ) : null}
      </div>
    </div>
  );
}
