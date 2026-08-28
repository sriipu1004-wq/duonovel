"use client";

import { useEffect, useState, type ReactNode } from "react";
import BilingualActionBridge from "@/features/playback/BilingualActionBridge";
import BilingualEpisodePlayback from "@/features/playback/BilingualEpisodePlayback";
import BilingualResumeBridge from "@/features/playback/BilingualResumeBridge";
import TranslationLanguageSelect from "@/features/playback/TranslationLanguageSelect";
import { useAiUsage } from "@/features/usage/useAiUsage";
import { formatAiUsage } from "@/lib/aiUsage/aiUsage";
import {
  isPublicTranslationTargetLanguage,
  parseSupportedLanguageTag,
  type PublicTranslationTargetLanguage,
  type SupportedLanguageTag,
} from "@/lib/translation/languageRegistry";
import {
  readBilingualSessionPreference,
  writeBilingualSessionPreference,
} from "@/lib/translation/bilingualSessionPreference";

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
  sourceLanguage: SupportedLanguageTag;
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
  sourceLanguage,
}: ReadBilingualShellProps) {
  const { snapshot: aiUsage } = useAiUsage();
  const [mode, setMode] = useState<"standard" | "bilingual">("standard");
  const [isLanguagePickerOpen, setIsLanguagePickerOpen] = useState(false);
  const [sessionLanguageLocked, setSessionLanguageLocked] = useState(false);
  const [autoGenerateMissingTranslation, setAutoGenerateMissingTranslation] =
    useState(false);
  const [targetLanguage, setTargetLanguage] =
    useState<PublicTranslationTargetLanguage>(
      sourceLanguage === "ja" ? "en" : "ja"
    );
  const [resumeSegmentIndex, setResumeSegmentIndex] = useState<number | null>(null);
  const [restoreToken, setRestoreToken] = useState(0);

  function enableBilingual() {
    if (!translationEligible) return;

    const sessionPreference = readBilingualSessionPreference(
      "series",
      seriesId,
      sourceLanguage
    );
    if (
      sessionPreference &&
      isPublicTranslationTargetLanguage(sessionPreference.targetLanguage)
    ) {
      setTargetLanguage(sessionPreference.targetLanguage);
      setSessionLanguageLocked(true);
      setAutoGenerateMissingTranslation(true);
      openBilingual();
      return;
    }

    setIsLanguagePickerOpen(true);
  }

  function openBilingual() {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }

    document.querySelectorAll<HTMLAudioElement>("main audio").forEach((audio) => {
      audio.pause();
    });

    setIsLanguagePickerOpen(false);
    setMode("bilingual");
  }

  function confirmBilingual() {
    setSessionLanguageLocked(false);
    setAutoGenerateMissingTranslation(false);
    openBilingual();
  }

  function confirmAndRememberForTab() {
    writeBilingualSessionPreference("series", seriesId, targetLanguage);
    setSessionLanguageLocked(true);
    setAutoGenerateMissingTranslation(true);
    openBilingual();
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
    const requestedAutoGenerate = params.get("autoGenerate") === "1";
    const timer = window.setTimeout(() => {
    if (
      !requestedTarget ||
      requestedTarget === sourceLanguage ||
      !isPublicTranslationTargetLanguage(requestedTarget)
    ) {
      setIsLanguagePickerOpen(true);
      return;
    }
    setTargetLanguage(requestedTarget);
    setSessionLanguageLocked(requestedAutoGenerate);
    setAutoGenerateMissingTranslation(requestedAutoGenerate);

    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }

    document.querySelectorAll<HTMLAudioElement>("main audio").forEach((audio) => {
      audio.pause();
    });

    setMode("bilingual");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [sourceLanguage, translationEligible]);

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
        sourceLanguage={sourceLanguage}
        autoGenerateMissingTranslation={autoGenerateMissingTranslation}
        targetLanguageLocked={sessionLanguageLocked}
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
              <TranslationLanguageSelect
                value={targetLanguage}
                sourceLanguage={sourceLanguage}
                onChange={setTargetLanguage}
              />
            </div>
            <p className="mt-4 text-xs leading-6 text-neutral-500">
              下の固定ボタンは、このタブを閉じるまで同じ作品・同じ対訳言語に限って有効です。
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button type="button" onClick={() => setIsLanguagePickerOpen(false)} className="rounded-full border border-black/10 px-5 py-2.5 text-sm text-neutral-700">
                キャンセル
              </button>
              <button type="button" onClick={confirmBilingual} className="rounded-full bg-black px-5 py-2.5 text-sm text-white">
                この言語で対訳を開く
              </button>
              <button
                type="button"
                onClick={confirmAndRememberForTab}
                className="w-full rounded-full border border-violet-200 bg-violet-50 px-5 py-2.5 text-sm font-medium text-black transition hover:bg-violet-100"
              >
                次からはこの作品で表示せず対訳する {formatAiUsage(aiUsage?.actions.translation_generation)}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
