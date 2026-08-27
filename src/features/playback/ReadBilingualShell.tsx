"use client";

import { useEffect, useState, type ReactNode } from "react";
import BilingualActionBridge from "@/features/playback/BilingualActionBridge";
import BilingualEpisodePlayback from "@/features/playback/BilingualEpisodePlayback";
import BilingualResumeBridge from "@/features/playback/BilingualResumeBridge";
import TranslationLanguageSelect from "@/features/playback/TranslationLanguageSelect";
import {
  isPublicTranslationTargetLanguage,
  parseSupportedLanguageTag,
  type PublicTranslationTargetLanguage,
} from "@/lib/translation/languageRegistry";

type ReadBilingualShellProps = {
  children: ReactNode;
  translationEligible: boolean;
  seriesId: string;
  episodeId: string;
  episodeNumber: number;
  seriesTitle?: string;
  episodeTitle?: string;
  workAuthorName?: string;
  workEditorName?: string;
};

export default function ReadBilingualShell({
  children,
  translationEligible,
  seriesId,
  episodeId,
  episodeNumber,
  seriesTitle,
  episodeTitle,
  workAuthorName,
  workEditorName,
}: ReadBilingualShellProps) {
  const [mode, setMode] = useState<"standard" | "bilingual">("standard");
  const [isLanguagePickerOpen, setIsLanguagePickerOpen] = useState(false);
  const [targetLanguage, setTargetLanguage] =
    useState<PublicTranslationTargetLanguage>("en");
  const [resumeSegmentIndex, setResumeSegmentIndex] = useState<number | null>(null);
  const [restoreToken, setRestoreToken] = useState(0);

  function enableBilingual() {
    if (!translationEligible) return;

    setIsLanguagePickerOpen(true);
  }

  function confirmBilingual() {

    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }

    document.querySelectorAll<HTMLAudioElement>("main audio").forEach((audio) => {
      audio.pause();
    });

    setIsLanguagePickerOpen(false);
    setMode("bilingual");
  }

  function disableBilingual(segmentIndex: number) {
    setResumeSegmentIndex(segmentIndex);
    setMode("standard");
    setRestoreToken((current) => current + 1);
  }

  useEffect(() => {
    if (!translationEligible || typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    if (params.get("bilingual") !== "1") return;
    const requestedTarget = parseSupportedLanguageTag(params.get("targetLanguage"));
    const timer = window.setTimeout(() => {
    if (!requestedTarget || !isPublicTranslationTargetLanguage(requestedTarget)) {
      setIsLanguagePickerOpen(true);
      return;
    }
    setTargetLanguage(requestedTarget);

    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }

    document.querySelectorAll<HTMLAudioElement>("main audio").forEach((audio) => {
      audio.pause();
    });

    setMode("bilingual");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [translationEligible]);

  if (mode === "bilingual") {
    return (
      <BilingualEpisodePlayback
        seriesId={seriesId}
        episodeId={episodeId}
        episodeNumber={episodeNumber}
        seriesTitle={seriesTitle}
        episodeTitle={episodeTitle}
        workAuthorName={workAuthorName}
        workEditorName={workEditorName}
        initialTargetLanguage={targetLanguage}
        onDisableBilingual={disableBilingual}
      />
    );
  }

  return (
    <>
      {children}
      <BilingualActionBridge
        enabled={translationEligible}
        onEnable={enableBilingual}
      />
      <BilingualResumeBridge
        segmentIndex={resumeSegmentIndex}
        restoreToken={restoreToken}
      />
      {isLanguagePickerOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 px-4 py-8">
          <section className="w-full max-w-md rounded-[28px] bg-white p-6 shadow-xl" role="dialog" aria-modal="true">
            <h2 className="text-xl font-semibold text-black">対訳する言語を選択</h2>
            <p className="mt-2 text-sm leading-7 text-neutral-600">
              保存済み対訳がなければ、開いた後に生成するか選べます。
            </p>
            <div className="mt-5">
              <TranslationLanguageSelect value={targetLanguage} onChange={setTargetLanguage} />
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setIsLanguagePickerOpen(false)} className="rounded-full border border-black/10 px-5 py-2.5 text-sm text-neutral-700">
                キャンセル
              </button>
              <button type="button" onClick={confirmBilingual} className="rounded-full bg-black px-5 py-2.5 text-sm text-white">
                この言語で対訳を開く
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
