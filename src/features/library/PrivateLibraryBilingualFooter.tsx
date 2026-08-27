"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  NARRATION_STOPPED_CHANGED_EVENT,
  readNarrationStopped,
  readWebSpeechSettings,
  writeNarrationStopped,
} from "@/lib/playback/webSpeechPreferences";

type PrivateLibraryBilingualFooterProps = {
  seriesId: string;
  languageLabel: string;
  onReturn: () => void;
  children?: ReactNode;
};

export default function PrivateLibraryBilingualFooter({
  seriesId,
  languageLabel,
  onReturn,
  children,
}: PrivateLibraryBilingualFooterProps) {
  const [stopped, setStopped] = useState(() => readNarrationStopped(seriesId));
  const [settings, setSettings] = useState(() => readWebSpeechSettings(seriesId));

  useEffect(() => {
    function sync() {
      setStopped(readNarrationStopped(seriesId));
      setSettings(readWebSpeechSettings(seriesId));
    }
    window.addEventListener("storage", sync);
    window.addEventListener(NARRATION_STOPPED_CHANGED_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(NARRATION_STOPPED_CHANGED_EVENT, sync);
    };
  }, [seriesId]);

  return (
    <section className="mt-5 rounded-[28px] border border-black/10 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-black/10 bg-neutral-50 px-3 py-1.5 text-xs text-neutral-700">
              {stopped ? "朗読停止中" : "ブラウザ読み上げ"}
            </span>
            <span className="text-xs text-neutral-500">{languageLabel} 対訳</span>
          </div>
          <p className="mt-2 text-[11px] text-neutral-500">
            速度 {settings.rate.toFixed(1)}　音量 {Math.round(settings.volume * 100)}%　声の高さ {settings.pitch.toFixed(1)}
          </p>
          {children}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const next = !stopped;
              if (next && "speechSynthesis" in window) window.speechSynthesis.cancel();
              setStopped(next);
              writeNarrationStopped(seriesId, next);
            }}
            className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-neutral-700 transition hover:bg-neutral-50"
          >
            {stopped ? "停止解除" : "朗読停止"}
          </button>
          <button
            type="button"
            onClick={onReturn}
            className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-neutral-700 transition hover:bg-neutral-50"
          >
            原文表示に戻る
          </button>
        </div>
      </div>
    </section>
  );
}
