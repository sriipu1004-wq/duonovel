"use client";

import { useEffect, useState } from "react";
import type { BilingualSegment } from "@/features/playback/BilingualPane";
import {
  getSupportedLanguage,
  type SupportedLanguageTag,
} from "@/lib/translation/languageRegistry";
import {
  NARRATION_STOPPED_CHANGED_EVENT,
  readNarrationStopped,
  readWebSpeechSettings,
} from "@/lib/playback/webSpeechPreferences";

type BilingualStudyControlsProps = {
  segments: BilingualSegment[];
  selectedSegmentId: string | null;
  onSelectSegment: (id: string) => void;
  targetLanguage: SupportedLanguageTag;
  seriesId: string;
};

export default function BilingualStudyControls({
  segments,
  selectedSegmentId,
  onSelectSegment,
  targetLanguage,
  seriesId,
}: BilingualStudyControlsProps) {
  const [speechAvailable, setSpeechAvailable] = useState(
    () => typeof window !== "undefined" && "speechSynthesis" in window
  );
  const [narrationStopped, setNarrationStopped] = useState(() =>
    readNarrationStopped(seriesId)
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

  useEffect(() => {
    function syncStopped() {
      setNarrationStopped(readNarrationStopped(seriesId));
    }
    syncStopped();
    window.addEventListener("storage", syncStopped);
    window.addEventListener(NARRATION_STOPPED_CHANGED_EVENT, syncStopped);
    return () => {
      window.removeEventListener("storage", syncStopped);
      window.removeEventListener(NARRATION_STOPPED_CHANGED_EVENT, syncStopped);
    };
  }, [seriesId]);

  function playOnce() {
    if (!selectedSegment || narrationStopped) return;

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
    const settings = readWebSpeechSettings(seriesId);
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
    utterance.rate = settings.rate;
    utterance.pitch = settings.pitch;
    utterance.volume = settings.volume;
    const storedVoice = voices.find(
      (voice) =>
        voice.voiceURI === settings.voiceURI &&
        (voice.lang.toLowerCase() === normalizedSpeechLanguage ||
          voice.lang.toLowerCase().startsWith(primaryLanguage + "-"))
    );
    if (storedVoice ?? selectedVoice) utterance.voice = storedVoice ?? selectedVoice!;
    window.speechSynthesis.speak(utterance);
  }

  return (
    <div className="border-b border-black/10 bg-neutral-50 px-4 py-3 sm:px-6">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={playOnce}
          disabled={!speechAvailable || !selectedSegment || narrationStopped}
          className="rounded-full border border-black/10 bg-white px-3 py-2 text-xs font-medium text-neutral-700 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {narrationStopped ? "朗読停止中" : "▶ 1文再生"}
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
