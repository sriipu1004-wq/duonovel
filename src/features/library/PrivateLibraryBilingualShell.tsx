"use client";

import { useRef, useState, type ReactNode } from "react";
import BilingualActionBridge from "@/features/playback/BilingualActionBridge";
import BilingualResumeBridge from "@/features/playback/BilingualResumeBridge";
import PrivateLibraryBilingualPlayback from "@/features/library/PrivateLibraryBilingualPlayback";
import BilingualLanguagePickerDialog, {
  type BilingualTranslationAvailability,
} from "@/features/playback/BilingualLanguagePickerDialog";
import { useAiUsage } from "@/features/usage/useAiUsage";
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

type PrivateLibraryBilingualShellProps = {
  children: ReactNode;
  workId: string;
  chapterId: string;
  chapterNumber: number;
  partNumber: number;
  partCount: number;
  workTitle: string;
  chapterTitle: string;
  authorName?: string;
  sourceLanguage: SupportedLanguageTag;
  workIndexHref: string;
  previousChapterHref: string | null;
  nextChapterHref: string | null;
  hasMultipleChapters: boolean;
  nextChapterId: string | null;
  isSubscriber: boolean;
};

export default function PrivateLibraryBilingualShell({
  children,
  workId,
  chapterId,
  chapterNumber,
  partNumber,
  partCount,
  workTitle,
  chapterTitle,
  authorName,
  sourceLanguage,
  workIndexHref,
  previousChapterHref,
  nextChapterHref,
  hasMultipleChapters,
  nextChapterId,
  isSubscriber,
}: PrivateLibraryBilingualShellProps) {
  const { snapshot: aiUsage } = useAiUsage();
  const [mode, setMode] = useState<"standard" | "bilingual">("standard");
  const [isLanguagePickerOpen, setIsLanguagePickerOpen] = useState(false);
  const [translationAvailability, setTranslationAvailability] =
    useState<BilingualTranslationAvailability>("checking");
  const [rememberForTab, setRememberForTab] = useState(false);
  const [sessionLanguageLocked, setSessionLanguageLocked] = useState(false);
  const [autoGenerateMissingTranslation, setAutoGenerateMissingTranslation] =
    useState(false);
  const [selectedTargetLanguage, setSelectedTargetLanguage] =
    useState<PublicTranslationTargetLanguage>(() => {
      if (typeof window !== "undefined") {
        try {
          const stored = parseSupportedLanguageTag(
            window.localStorage.getItem(
              `duonovel:private-library-bilingual-target:${workId}`
            )
          );
          if (
            stored &&
            stored !== sourceLanguage &&
            isPublicTranslationTargetLanguage(stored)
          ) {
            return stored;
          }
        } catch {
          // fall through to a safe non-source language
        }
      }
      return sourceLanguage === "ja" ? "en" : "ja";
    });
  const [resumeSegmentIndex, setResumeSegmentIndex] = useState<number | null>(null);
  const [restoreToken, setRestoreToken] = useState(0);
  const availabilityCheckVersionRef = useRef(0);

  async function checkTranslationAvailability(
    language: PublicTranslationTargetLanguage,
    existingVersion?: number
  ) {
    const checkVersion = existingVersion ?? ++availabilityCheckVersionRef.current;
    if (existingVersion === undefined) setTranslationAvailability("checking");
    try {
      const response = await fetch(
        `/api/library/translations/${encodeURIComponent(chapterId)}?sourceLanguage=${encodeURIComponent(sourceLanguage)}&targetLanguage=${encodeURIComponent(language)}`,
        { cache: "no-store" }
      );
      const payload = (await response.json()) as {
        ok?: boolean;
        status?: BilingualTranslationAvailability;
      };
      if (availabilityCheckVersionRef.current !== checkVersion) return;
      if (!response.ok || !payload.ok || !payload.status) {
        setTranslationAvailability("error");
        return;
      }
      setTranslationAvailability(payload.status);
      if (payload.status === "translating") {
        window.setTimeout(
          () => void checkTranslationAvailability(language, checkVersion),
          2500
        );
      }
    } catch {
      if (availabilityCheckVersionRef.current !== checkVersion) return;
      setTranslationAvailability("error");
    }
  }

  function enableBilingual() {
    const sessionPreference = hasMultipleChapters
      ? readBilingualSessionPreference(
          "private-library",
          workId,
          sourceLanguage
        )
      : null;
    if (sessionPreference) {
      setSelectedTargetLanguage(sessionPreference.targetLanguage);
      setSessionLanguageLocked(true);
      setAutoGenerateMissingTranslation(true);
      openBilingual();
      return;
    }
    setRememberForTab(false);
    setIsLanguagePickerOpen(true);
    void checkTranslationAvailability(selectedTargetLanguage);
  }

  function openBilingual() {
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

  function confirmBilingualLanguage() {
    if (rememberForTab && hasMultipleChapters) {
      writeBilingualSessionPreference(
        "private-library",
        workId,
        selectedTargetLanguage
      );
    }
    setSessionLanguageLocked(rememberForTab && hasMultipleChapters);
    setAutoGenerateMissingTranslation(translationAvailability !== "ready");
    openBilingual();
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
        partNumber={partNumber}
        partCount={partCount}
        workTitle={workTitle}
        chapterTitle={chapterTitle}
        authorName={authorName}
        sourceLanguage={sourceLanguage}
        initialTargetLanguage={selectedTargetLanguage}
        workIndexHref={workIndexHref}
        previousChapterHref={previousChapterHref}
        nextChapterHref={nextChapterHref}
        nextChapterId={nextChapterId}
        isSubscriber={isSubscriber}
        autoGenerateMissingTranslation={autoGenerateMissingTranslation}
        targetLanguageLocked={sessionLanguageLocked}
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
        <BilingualLanguagePickerDialog
          sourceLanguage={sourceLanguage}
          targetLanguage={selectedTargetLanguage}
          availability={translationAvailability}
          rememberForTab={rememberForTab}
          showRememberForTab={hasMultipleChapters}
          translationUsage={aiUsage?.actions.translation_generation}
          isSubscriber={aiUsage?.isSubscriber === true}
          onTargetLanguageChange={(language) => {
            setSelectedTargetLanguage(language);
            void checkTranslationAvailability(language);
          }}
          onRememberForTabChange={setRememberForTab}
          onCancel={() => setIsLanguagePickerOpen(false)}
          onConfirm={confirmBilingualLanguage}
          onRetry={() =>
            void checkTranslationAvailability(selectedTargetLanguage)
          }
        />
      ) : null}
    </>
  );
}
