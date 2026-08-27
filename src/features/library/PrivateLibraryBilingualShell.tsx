"use client";

import { useMemo, useState, type ReactNode } from "react";
import BilingualActionBridge from "@/features/playback/BilingualActionBridge";
import BilingualResumeBridge from "@/features/playback/BilingualResumeBridge";
import PrivateLibraryBilingualPlayback from "@/features/library/PrivateLibraryBilingualPlayback";
import {
  LANGUAGE_REGISTRY,
  getSupportedLanguage,
  parseSupportedLanguageTag,
  type SupportedLanguageTag,
} from "@/lib/translation/languageRegistry";

type PrivateLibraryBilingualShellProps = {
  children: ReactNode;
  workId: string;
  chapterId: string;
  chapterNumber: number;
  sectionNumber: number;
  partNumber: number;
  partCount: number;
  workTitle: string;
  chapterTitle: string;
  authorName?: string;
  sourceLanguage: SupportedLanguageTag;
  workIndexHref: string;
  nextChapterId: string | null;
  isSubscriber: boolean;
};

export default function PrivateLibraryBilingualShell({
  children,
  workId,
  chapterId,
  chapterNumber,
  sectionNumber,
  partNumber,
  partCount,
  workTitle,
  chapterTitle,
  authorName,
  sourceLanguage,
  workIndexHref,
  nextChapterId,
  isSubscriber,
}: PrivateLibraryBilingualShellProps) {
  const [mode, setMode] = useState<"standard" | "bilingual">("standard");
  const availableTargetLanguages = useMemo(
    () =>
      (Object.keys(LANGUAGE_REGISTRY) as SupportedLanguageTag[]).filter(
        (language) => language !== sourceLanguage
      ),
    [sourceLanguage]
  );
  const [isLanguagePickerOpen, setIsLanguagePickerOpen] = useState(false);
  const [selectedTargetLanguage, setSelectedTargetLanguage] =
    useState<SupportedLanguageTag>(() => {
      if (typeof window !== "undefined") {
        try {
          const stored = parseSupportedLanguageTag(
            window.localStorage.getItem(
              `duonovel:private-library-bilingual-target:${workId}`
            )
          );
          if (stored && stored !== sourceLanguage) return stored;
        } catch {
          // fall through to a safe non-source language
        }
      }
      return sourceLanguage === "ja" ? "en" : "ja";
    });
  const [resumeSegmentIndex, setResumeSegmentIndex] = useState<number | null>(null);
  const [restoreToken, setRestoreToken] = useState(0);

  function enableBilingual() {
    setIsLanguagePickerOpen(true);
  }

  function confirmBilingualLanguage() {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }

    document.querySelectorAll<HTMLAudioElement>("main audio").forEach((audio) => {
      audio.pause();
    });

    try {
      window.localStorage.setItem(
        `duonovel:private-library-bilingual-target:${workId}`,
        selectedTargetLanguage
      );
    } catch {
      // local preference persistence is non-critical
    }

    setIsLanguagePickerOpen(false);
    setMode("bilingual");
  }

  function disableBilingual(segmentIndex: number) {
    setResumeSegmentIndex(segmentIndex);
    setMode("standard");
    setRestoreToken((current) => current + 1);
  }

  if (mode === "bilingual") {
    return (
      <PrivateLibraryBilingualPlayback
        workId={workId}
        chapterId={chapterId}
        chapterNumber={chapterNumber}
        sectionNumber={sectionNumber}
        partNumber={partNumber}
        partCount={partCount}
        workTitle={workTitle}
        chapterTitle={chapterTitle}
        authorName={authorName}
        sourceLanguage={sourceLanguage}
        initialTargetLanguage={selectedTargetLanguage}
        workIndexHref={workIndexHref}
        nextChapterId={nextChapterId}
        isSubscriber={isSubscriber}
        onDisableBilingual={disableBilingual}
      />
    );
  }

  return (
    <>
      {children}
      <BilingualActionBridge enabled onEnable={enableBilingual} />
      <BilingualResumeBridge
        segmentIndex={resumeSegmentIndex}
        restoreToken={restoreToken}
      />
      {isLanguagePickerOpen ? (
        <div
          role="presentation"
          className="fixed inset-0 z-50 grid place-items-center bg-black/35 px-4 py-8"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsLanguagePickerOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="private-library-bilingual-language-title"
            className="w-full max-w-md rounded-[28px] border border-black/10 bg-white p-6 shadow-xl"
          >
            <p className="text-xs tracking-[0.18em] text-neutral-500">
              BILINGUAL READER
            </p>
            <h2
              id="private-library-bilingual-language-title"
              className="mt-2 text-xl font-semibold text-black"
            >
              対訳する言語を選択
            </h2>
            <p className="mt-2 text-sm leading-7 text-neutral-600">
              保存済みの対訳があればそのまま表示します。未作成の場合は、次の画面で生成するか選べます。
            </p>
            <label className="mt-5 grid gap-2">
              <span className="text-sm text-neutral-700">対訳言語</span>
              <select
                autoFocus
                value={selectedTargetLanguage}
                onChange={(event) => {
                  const language = parseSupportedLanguageTag(event.target.value);
                  if (language && language !== sourceLanguage) {
                    setSelectedTargetLanguage(language);
                  }
                }}
                className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm outline-none focus:border-sky-300"
              >
                {availableTargetLanguages.map((language) => (
                  <option key={language} value={language}>
                    {getSupportedLanguage(language).nativeLabel}
                  </option>
                ))}
              </select>
            </label>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsLanguagePickerOpen(false)}
                className="rounded-full border border-black/10 bg-white px-5 py-2.5 text-sm text-neutral-700 transition hover:bg-neutral-50"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={confirmBilingualLanguage}
                className="rounded-full bg-black px-5 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-800"
              >
                この言語で対訳を開く
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
