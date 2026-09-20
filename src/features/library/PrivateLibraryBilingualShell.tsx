"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import BilingualResumeBridge from "@/features/playback/BilingualResumeBridge";
import PrivateLibraryBilingualPlayback from "@/features/library/PrivateLibraryBilingualPlayback";
import BilingualLanguagePickerDialog, {
  type BilingualTranslationAvailability,
} from "@/features/playback/BilingualLanguagePickerDialog";
import ReaderModeSelector from "@/features/playback/ReaderModeSelector";
import TranslationLanguageSelect from "@/features/playback/TranslationLanguageSelect";
import {
  readReadingHistory,
  readEpisodeReadingPosition,
  applyReadingModeToHref,
  type ReadingMode,
} from "@/lib/playback/readingBookmark";
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
  const [mode, setMode] = useState<ReadingMode>("standard");
  const [pendingMode, setPendingMode] = useState<"bilingual" | "translation">(
    "bilingual"
  );
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
          // local preference is best effort
        }
      }
      return sourceLanguage === "ja" ? "en" : "ja";
    });
  const [resumeSegmentIndex, setResumeSegmentIndex] = useState<number | null>(
    null
  );
  const [restoreToken, setRestoreToken] = useState(0);
  const availabilityCheckVersionRef = useRef(0);

  async function checkTranslationAvailability(
    language: PublicTranslationTargetLanguage,
    existingVersion?: number
  ) {
    const checkVersion =
      existingVersion ?? ++availabilityCheckVersionRef.current;
    if (existingVersion === undefined) {
      setTranslationAvailability("checking");
    }

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

  function stopOriginalPlayback() {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    document.querySelectorAll<HTMLAudioElement>("main audio").forEach((audio) => {
      audio.pause();
    });
  }

  function openTranslatedMode(
    nextMode: "bilingual" | "translation",
    nextTargetLanguage = selectedTargetLanguage,
    autoGenerate = autoGenerateMissingTranslation,
    lockLanguage = sessionLanguageLocked
  ) {
    stopOriginalPlayback();

    try {
      window.localStorage.setItem(
        `duonovel:private-library-bilingual-target:${workId}`,
        nextTargetLanguage
      );
    } catch {
      // local preference is best effort
    }

    const seriesId = `private-library:${workId}`;
    const history = readReadingHistory(seriesId);
    const baseHref =
      history?.episodeNumber === chapterNumber
        ? applyReadingModeToHref(window.location.href, {
            ...history,
            mode: nextMode,
            sourceLanguage,
            targetLanguage: nextTargetLanguage,
          })
        : window.location.href;

    const url = new URL(baseHref, window.location.origin);
    url.searchParams.set("readingMode", nextMode);
    url.searchParams.set("sourceLanguage", sourceLanguage);
    url.searchParams.set("targetLanguage", nextTargetLanguage);

    if (nextMode === "bilingual") {
      url.searchParams.set("bilingual", "1");
      url.searchParams.delete("translationOnly");
    } else {
      url.searchParams.set("translationOnly", "1");
      url.searchParams.delete("bilingual");
    }

    if (autoGenerate) url.searchParams.set("autoGenerate", "1");
    else url.searchParams.delete("autoGenerate");
    if (lockLanguage) url.searchParams.set("lockLanguage", "1");
    else url.searchParams.delete("lockLanguage");

    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`
    );

    setSelectedTargetLanguage(nextTargetLanguage);
    setAutoGenerateMissingTranslation(autoGenerate);
    setSessionLanguageLocked(lockLanguage);
    setIsLanguagePickerOpen(false);
    setMode(nextMode);
  }

  function requestTranslatedMode(nextMode: "bilingual" | "translation") {
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
      openTranslatedMode(
        nextMode,
        sessionPreference.targetLanguage,
        true,
        true
      );
      return;
    }

    setPendingMode(nextMode);
    setRememberForTab(false);
    setIsLanguagePickerOpen(true);
    void checkTranslationAvailability(selectedTargetLanguage);
  }

  function confirmTranslatedLanguage() {
    const lockLanguage = rememberForTab && hasMultipleChapters;
    if (lockLanguage) {
      writeBilingualSessionPreference(
        "private-library",
        workId,
        selectedTargetLanguage
      );
    }

    openTranslatedMode(
      pendingMode,
      selectedTargetLanguage,
      translationAvailability !== "ready",
      lockLanguage
    );
  }

  function disableTranslated(segmentIndex = 0) {
    const seriesId = `private-library:${workId}`;
    const history = readReadingHistory(seriesId);
    const baseHref =
      history?.episodeNumber === chapterNumber
        ? applyReadingModeToHref(window.location.href, {
            ...history,
            mode: "standard",
          })
        : window.location.href;
    const url = new URL(baseHref, window.location.origin);
    url.searchParams.set("readingMode", "standard");

    for (const key of [
      "bilingual",
      "translationOnly",
      "sourceLanguage",
      "targetLanguage",
      "autoGenerate",
      "lockLanguage",
    ]) {
      url.searchParams.delete(key);
    }

    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`
    );
    setResumeSegmentIndex(segmentIndex);
    setMode("standard");
    setAutoGenerateMissingTranslation(false);
    setSessionLanguageLocked(false);
    setRestoreToken((current) => current + 1);
  }

  function handleModeChange(nextMode: ReadingMode) {
    if (nextMode === mode) return;

    if (nextMode === "standard") {
      disableTranslated(resumeSegmentIndex ?? 0);
      return;
    }

    if (mode === "bilingual" || mode === "translation") {
      openTranslatedMode(
        nextMode,
        selectedTargetLanguage,
        autoGenerateMissingTranslation,
        sessionLanguageLocked
      );
      return;
    }

    requestTranslatedMode(nextMode);
  }

  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const seriesId = `private-library:${workId}`;
    const remembered =
      readReadingHistory(seriesId) ??
      readEpisodeReadingPosition(seriesId, chapterNumber);

    const explicitMode = params.get("readingMode");
    const hasTranslatedFlag =
      params.get("bilingual") === "1" ||
      params.get("translationOnly") === "1";

    if (
      !hasTranslatedFlag &&
      explicitMode !== "standard" &&
      (remembered?.mode === "bilingual" ||
        remembered?.mode === "translation") &&
      remembered.targetLanguage
    ) {
      params.set("readingMode", remembered.mode);
      params.set(
        remembered.mode === "translation" ? "translationOnly" : "bilingual",
        "1"
      );
      params.set("sourceLanguage", sourceLanguage);
      params.set("targetLanguage", remembered.targetLanguage);
      window.history.replaceState(
        window.history.state,
        "",
        `${window.location.pathname}?${params}${window.location.hash}`
      );
    }

    const requestedMode: ReadingMode =
      params.get("translationOnly") === "1" ||
      params.get("readingMode") === "translation"
        ? "translation"
        : params.get("bilingual") === "1" ||
            params.get("readingMode") === "bilingual"
          ? "bilingual"
          : "standard";

    const requestedTarget = parseSupportedLanguageTag(
      params.get("targetLanguage")
    );

    const timer = window.setTimeout(() => {
      if (requestedMode === "standard") {
        setMode("standard");
        setSessionLanguageLocked(false);
        setAutoGenerateMissingTranslation(false);
        return;
      }

      if (
        !requestedTarget ||
        requestedTarget === sourceLanguage ||
        !isPublicTranslationTargetLanguage(requestedTarget)
      ) {
        setMode("standard");
        return;
      }

      setSelectedTargetLanguage(requestedTarget);
      setSessionLanguageLocked(params.get("lockLanguage") === "1");
      setAutoGenerateMissingTranslation(params.get("autoGenerate") === "1");
      stopOriginalPlayback();
      setMode(requestedMode);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [chapterId, chapterNumber, sourceLanguage, workId]);

  if (mode === "bilingual" || mode === "translation") {
    return (
      <>
        <ReaderModeSelector
          mode={mode}
          translationEnabled
          onChange={handleModeChange}
        />
        <PrivateLibraryBilingualPlayback
          mode={mode}
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
          onDisableTranslated={disableTranslated}
        />
      </>
    );
  }

  return (
    <>
      <ReaderModeSelector
        mode={mode}
        translationEnabled
        onChange={handleModeChange}
      />
      <div className="mx-auto flex w-full max-w-4xl justify-end px-3 pt-2 sm:px-6">
        <TranslationLanguageSelect
          value={selectedTargetLanguage}
          sourceLanguage={sourceLanguage}
          onChange={setSelectedTargetLanguage}
        />
      </div>
      {children}
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
          onConfirm={confirmTranslatedLanguage}
          onRetry={() =>
            void checkTranslationAvailability(selectedTargetLanguage)
          }
        />
      ) : null}
    </>
  );
}
