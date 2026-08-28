"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import BilingualActionBridge from "@/features/playback/BilingualActionBridge";
import BilingualEpisodePlayback from "@/features/playback/BilingualEpisodePlayback";
import BilingualLanguagePickerDialog, {
  type BilingualTranslationAvailability,
} from "@/features/playback/BilingualLanguagePickerDialog";
import BilingualResumeBridge from "@/features/playback/BilingualResumeBridge";
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
  const [translationAvailability, setTranslationAvailability] =
    useState<BilingualTranslationAvailability>("checking");
  const [rememberForTab, setRememberForTab] = useState(false);
  const [sessionLanguageLocked, setSessionLanguageLocked] = useState(false);
  const [autoGenerateMissingTranslation, setAutoGenerateMissingTranslation] =
    useState(false);
  const [targetLanguage, setTargetLanguage] =
    useState<PublicTranslationTargetLanguage>(
      sourceLanguage === "ja" ? "en" : "ja"
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

    setRememberForTab(false);
    setIsLanguagePickerOpen(true);
    void checkTranslationAvailability(targetLanguage);
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
    if (rememberForTab) {
      writeBilingualSessionPreference("series", seriesId, targetLanguage);
    }
    setSessionLanguageLocked(rememberForTab);
    setAutoGenerateMissingTranslation(translationAvailability !== "ready");
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
    const requestedLanguageLock = params.get("lockLanguage") === "1";
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
    setSessionLanguageLocked(requestedLanguageLock);
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
        <BilingualLanguagePickerDialog
          sourceLanguage={sourceLanguage}
          targetLanguage={targetLanguage}
          availability={translationAvailability}
          rememberForTab={rememberForTab}
          translationUsage={aiUsage?.actions.translation_generation}
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
