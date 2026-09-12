"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import BilingualActionBridge from "@/features/playback/BilingualActionBridge";
import BilingualEpisodePlayback from "@/features/playback/BilingualEpisodePlayback";
import BilingualLanguagePickerDialog, {
  type BilingualTranslationAvailability,
} from "@/features/playback/BilingualLanguagePickerDialog";
import BilingualResumeBridge from "@/features/playback/BilingualResumeBridge";
import ReaderModeSelector from "@/features/playback/ReaderModeSelector";
import TranslationLanguageSelect, {
  TRANSLATION_TARGET_LANGUAGE_CHANGED_EVENT,
} from "@/features/playback/TranslationLanguageSelect";
import TranslationOnlyEpisodePlayback from "@/features/playback/TranslationOnlyEpisodePlayback";
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
import { useUiLocale } from "@/i18n/UiLocaleProvider";

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
  hasMultipleEpisodes: boolean;
  workIndexHref?: string | null;
  prevEpisodeHref?: string | null;
  nextEpisodeHref?: string | null;
};

function defaultTargetLanguage(
  sourceLanguage: SupportedLanguageTag,
  uiLocale: "ja" | "en" | "ko"
): PublicTranslationTargetLanguage {
  if (uiLocale !== sourceLanguage && isPublicTranslationTargetLanguage(uiLocale)) {
    return uiLocale;
  }
  return sourceLanguage === "ja" ? "en" : "ja";
}

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
  hasMultipleEpisodes,
  workIndexHref,
  prevEpisodeHref,
  nextEpisodeHref,
}: ReadBilingualShellProps) {
  const uiLocale = useUiLocale();
  const { snapshot: aiUsage } = useAiUsage();
  const [mode, setMode] = useState<ReadingMode>("standard");
  const [isLanguagePickerOpen, setIsLanguagePickerOpen] = useState(false);
  const [translationAvailability, setTranslationAvailability] =
    useState<BilingualTranslationAvailability>("checking");
  const [rememberForTab, setRememberForTab] = useState(false);
  const [sessionLanguageLocked, setSessionLanguageLocked] = useState(false);
  const [autoGenerateMissingTranslation, setAutoGenerateMissingTranslation] =
    useState(false);
  const [targetLanguage, setTargetLanguage] =
    useState<PublicTranslationTargetLanguage>(() =>
      defaultTargetLanguage(sourceLanguage, uiLocale)
    );
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
        `/api/episode-translations/${encodeURIComponent(episodeId)}?sourceLanguage=${encodeURIComponent(sourceLanguage)}&targetLanguage=${encodeURIComponent(language)}`,
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

  function stopOriginalPlayback() {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    document.querySelectorAll<HTMLAudioElement>("main audio").forEach((audio) => {
      audio.pause();
    });
  }

  function replaceReaderUrl(
    nextMode: ReadingMode,
    nextTargetLanguage = targetLanguage,
    autoGenerate = false,
    lockLanguage = false
  ) {
    const history = readReadingHistory(seriesId);
    const baseHref =
      history?.episodeNumber === episodeNumber
        ? applyReadingModeToHref(window.location.href, {
            ...history,
            mode: nextMode,
            sourceLanguage,
            targetLanguage: nextTargetLanguage,
          })
        : window.location.href;
    const url = new URL(baseHref, window.location.origin);
    url.searchParams.set("readingMode", nextMode);

    if (nextMode === "bilingual" || nextMode === "translation") {
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
    } else {
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
    }

    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`
    );
  }

  function openTranslatedMode(
    nextMode: "bilingual" | "translation",
    nextTargetLanguage = targetLanguage,
    autoGenerate = true,
    lockLanguage = sessionLanguageLocked
  ) {
    if (!translationEligible || nextTargetLanguage === sourceLanguage) return;
    stopOriginalPlayback();
    setTargetLanguage(nextTargetLanguage);
    setAutoGenerateMissingTranslation(autoGenerate);
    setSessionLanguageLocked(lockLanguage);
    replaceReaderUrl(
      nextMode,
      nextTargetLanguage,
      autoGenerate,
      lockLanguage
    );
    setIsLanguagePickerOpen(false);
    setMode(nextMode);
  }

  function enableBilingual() {
    if (!translationEligible) return;
    const sessionPreference = hasMultipleEpisodes
      ? readBilingualSessionPreference("series", seriesId, sourceLanguage)
      : null;
    if (
      sessionPreference &&
      isPublicTranslationTargetLanguage(sessionPreference.targetLanguage) &&
      sessionPreference.targetLanguage !== sourceLanguage
    ) {
      setTargetLanguage(sessionPreference.targetLanguage);
      setSessionLanguageLocked(true);
      setAutoGenerateMissingTranslation(true);
      openTranslatedMode("bilingual", sessionPreference.targetLanguage, true, true);
      return;
    }

    setRememberForTab(false);
    setIsLanguagePickerOpen(true);
    void checkTranslationAvailability(targetLanguage);
  }

  function confirmBilingual() {
    if (rememberForTab && hasMultipleEpisodes) {
      writeBilingualSessionPreference("series", seriesId, targetLanguage);
    }
    const lockLanguage = rememberForTab && hasMultipleEpisodes;
    setSessionLanguageLocked(lockLanguage);
    const autoGenerate = translationAvailability !== "ready";
    setAutoGenerateMissingTranslation(autoGenerate);
    openTranslatedMode("bilingual", targetLanguage, autoGenerate, lockLanguage);
  }

  function disableTranslated(segmentIndex = 0) {
    replaceReaderUrl("standard");
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
    if (!translationEligible) return;
    openTranslatedMode(nextMode, targetLanguage, true, sessionLanguageLocked);
  }

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ language?: unknown }>).detail;
      const language = parseSupportedLanguageTag(detail?.language);
      if (
        !language ||
        language === sourceLanguage ||
        !isPublicTranslationTargetLanguage(language)
      ) {
        return;
      }
      setTargetLanguage(language);
      if (mode === "bilingual" || mode === "translation") {
        replaceReaderUrl(
          mode,
          language,
          autoGenerateMissingTranslation,
          sessionLanguageLocked
        );
      }
    };
    window.addEventListener(TRANSLATION_TARGET_LANGUAGE_CHANGED_EVENT, handler);
    return () =>
      window.removeEventListener(TRANSLATION_TARGET_LANGUAGE_CHANGED_EVENT, handler);
  }, [
    autoGenerateMissingTranslation,
    mode,
    sessionLanguageLocked,
    sourceLanguage,
  ]);

  useEffect(() => {
    if (!translationEligible || typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const remembered =
      readReadingHistory(seriesId) ??
      readEpisodeReadingPosition(seriesId, episodeNumber);
    const explicitMode = params.get("readingMode");
    const hasTranslatedFlag =
      params.get("bilingual") === "1" || params.get("translationOnly") === "1";

    if (
      !hasTranslatedFlag &&
      explicitMode !== "standard" &&
      (remembered?.mode === "bilingual" || remembered?.mode === "translation") &&
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

    const requestedTarget = parseSupportedLanguageTag(params.get("targetLanguage"));
    const requestedAutoGenerate = params.get("autoGenerate") === "1";
    const requestedLanguageLock = params.get("lockLanguage") === "1";
    const requestedMode: ReadingMode =
      params.get("translationOnly") === "1" || params.get("readingMode") === "translation"
        ? "translation"
        : params.get("bilingual") === "1" || params.get("readingMode") === "bilingual"
          ? "bilingual"
          : "standard";

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
      setTargetLanguage(requestedTarget);
      setSessionLanguageLocked(requestedLanguageLock);
      setAutoGenerateMissingTranslation(requestedAutoGenerate);
      stopOriginalPlayback();
      setMode(requestedMode);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [episodeId, episodeNumber, seriesId, sourceLanguage, translationEligible]);

  if (mode === "bilingual") {
    return (
      <>
        <ReaderModeSelector
          mode={mode}
          translationEnabled={translationEligible}
          onChange={handleModeChange}
        />
        <BilingualEpisodePlayback
          seriesId={seriesId}
          episodeId={episodeId}
          episodeNumber={episodeNumber}
          seriesTitle={seriesTitle}
          episodeTitle={episodeTitle}
          workAuthorName={workAuthorName}
          workEditorName={workEditorName}
          workIndexHref={workIndexHref}
          prevEpisodeHref={prevEpisodeHref}
          nextEpisodeHref={nextEpisodeHref}
          initialTargetLanguage={targetLanguage}
          sourceLanguage={sourceLanguage}
          autoGenerateMissingTranslation={autoGenerateMissingTranslation}
          targetLanguageLocked={sessionLanguageLocked}
          onDisableBilingual={disableTranslated}
        />
      </>
    );
  }

  if (mode === "translation") {
    return (
      <>
        <ReaderModeSelector
          mode={mode}
          translationEnabled={translationEligible}
          onChange={handleModeChange}
        />
        <TranslationOnlyEpisodePlayback
          seriesId={seriesId}
          episodeId={episodeId}
          episodeNumber={episodeNumber}
          seriesTitle={seriesTitle}
          episodeTitle={episodeTitle}
          workAuthorName={workAuthorName}
          workEditorName={workEditorName}
          workIndexHref={workIndexHref}
          prevEpisodeHref={prevEpisodeHref}
          nextEpisodeHref={nextEpisodeHref}
          initialTargetLanguage={targetLanguage}
          sourceLanguage={sourceLanguage}
          autoGenerateMissingTranslation={autoGenerateMissingTranslation}
          targetLanguageLocked={sessionLanguageLocked}
        />
      </>
    );
  }

  return (
    <>
      <ReaderModeSelector
        mode={mode}
        translationEnabled={translationEligible}
        onChange={handleModeChange}
      />
      {translationEligible ? (
        <div className="mx-auto flex w-full max-w-4xl justify-end px-3 pt-2 sm:px-6">
          <TranslationLanguageSelect
            value={targetLanguage}
            sourceLanguage={sourceLanguage}
            onChange={setTargetLanguage}
          />
        </div>
      ) : null}
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
        <BilingualLanguagePickerDialog
          sourceLanguage={sourceLanguage}
          targetLanguage={targetLanguage}
          availability={translationAvailability}
          rememberForTab={rememberForTab}
          showRememberForTab={hasMultipleEpisodes}
          translationUsage={aiUsage?.actions.translation_generation}
          isSubscriber={aiUsage?.isSubscriber === true}
          onTargetLanguageChange={(language) => {
            setTargetLanguage(language);
            void checkTranslationAvailability(language);
          }}
          onRememberForTabChange={setRememberForTab}
          onCancel={() => setIsLanguagePickerOpen(false)}
          onConfirm={confirmBilingual}
          onRetry={() => void checkTranslationAvailability(targetLanguage)}
        />
      ) : null}
    </>
  );
}
