"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import BilingualActionBridge from "@/features/playback/BilingualActionBridge";
import BilingualResumeBridge from "@/features/playback/BilingualResumeBridge";
import PrivateLibraryBilingualPlayback from "@/features/library/PrivateLibraryBilingualPlayback";
import BilingualLanguagePickerDialog, {
  type BilingualTranslationAvailability,
} from "@/features/playback/BilingualLanguagePickerDialog";
import { readReadingHistory, readEpisodeReadingPosition, applyReadingModeToHref } from "@/lib/playback/readingBookmark";
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
        { cache: "no-store", signal: AbortSignal.timeout(20_000) }
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
      openBilingual(sessionPreference.targetLanguage, true, true);
      return;
    }
    setRememberForTab(false);
    setIsLanguagePickerOpen(true);
    void checkTranslationAvailability(selectedTargetLanguage);
  }

  function openBilingual(
    nextTargetLanguage = selectedTargetLanguage,
    autoGenerate = autoGenerateMissingTranslation,
    lockLanguage = sessionLanguageLocked
  ) {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }

    document.querySelectorAll<HTMLAudioElement>("main audio").forEach((audio) => {
      audio.pause();
    });

    try {
      window.localStorage.setItem(
        `duonovel:private-library-bilingual-target:${workId}`,
        nextTargetLanguage
      );
    } catch {
      // local preference persistence is non-critical
    }

    const history = readReadingHistory(`private-library:${workId}`);
    const baseHref = history?.episodeNumber === chapterNumber
      ? applyReadingModeToHref(window.location.href, { ...history, mode: "bilingual", sourceLanguage, targetLanguage: nextTargetLanguage })
      : window.location.href;
    const url = new URL(baseHref, window.location.origin);
    url.searchParams.set("readingMode", "bilingual");
    url.searchParams.set("bilingual", "1");
    url.searchParams.set("sourceLanguage", sourceLanguage);
    url.searchParams.set("targetLanguage", nextTargetLanguage);
    if (autoGenerate) url.searchParams.set("autoGenerate", "1");
    else url.searchParams.delete("autoGenerate");
    if (lockLanguage) url.searchParams.set("lockLanguage", "1");
    else url.searchParams.delete("lockLanguage");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);

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
    openBilingual(
      selectedTargetLanguage,
      translationAvailability !== "ready",
      rememberForTab && hasMultipleChapters
    );
  }

  function disableBilingual(segmentIndex: number) {
    const history = readReadingHistory(`private-library:${workId}`);
    const baseHref = history?.episodeNumber === chapterNumber
      ? applyReadingModeToHref(window.location.href, { ...history, mode: "standard" })
      : window.location.href;
    const url = new URL(baseHref, window.location.origin);
    url.searchParams.set("readingMode", "standard");
    for (const key of [
      "bilingual",
      "sourceLanguage",
      "targetLanguage",
      "autoGenerate",
      "lockLanguage",
    ]) {
      url.searchParams.delete(key);
    }
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    setResumeSegmentIndex(segmentIndex);
    setMode("standard");
    setRestoreToken((current) => current + 1);
  }

  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const remembered = readReadingHistory(`private-library:${workId}`) ?? readEpisodeReadingPosition(`private-library:${workId}`, chapterNumber);
    if (!params.has("bilingual") && params.get("readingMode") !== "standard" && remembered?.mode === "bilingual" && remembered.targetLanguage) {
      params.set("bilingual", "1");
      params.set("sourceLanguage", sourceLanguage);
      params.set("targetLanguage", remembered.targetLanguage);
      window.history.replaceState(window.history.state, "", `${window.location.pathname}?${params}${window.location.hash}`);
    }
    const timer = window.setTimeout(() => {
      if (params.get("bilingual") !== "1") {
        setMode("standard");
        setSessionLanguageLocked(false);
        setAutoGenerateMissingTranslation(false);
        return;
      }

      const requestedTarget = parseSupportedLanguageTag(
        params.get("targetLanguage")
      );
      if (
        !requestedTarget ||
        requestedTarget === sourceLanguage ||
        !isPublicTranslationTargetLanguage(requestedTarget)
      ) {
        setMode("standard");
        setIsLanguagePickerOpen(true);
        return;
      }

      setSelectedTargetLanguage(requestedTarget);
      setSessionLanguageLocked(params.get("lockLanguage") === "1");
      setAutoGenerateMissingTranslation(params.get("autoGenerate") === "1");
      setIsLanguagePickerOpen(false);

      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      document
        .querySelectorAll<HTMLAudioElement>("main audio")
        .forEach((audio) => audio.pause());
      setMode("bilingual");
    }, 0);

    return () => window.clearTimeout(timer);
  }, [chapterId, sourceLanguage]);

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
