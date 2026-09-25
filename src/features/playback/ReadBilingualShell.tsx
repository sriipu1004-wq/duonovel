"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import BilingualEpisodePlayback from "@/features/playback/BilingualEpisodePlayback";
import BilingualSettingsBridge from "@/features/playback/BilingualSettingsBridge";
import BilingualLanguagePickerDialog, {
  type BilingualTranslationAvailability,
} from "@/features/playback/BilingualLanguagePickerDialog";
import BilingualResumeBridge from "@/features/playback/BilingualResumeBridge";
import PublicTranslationUnlockGate, {
  type ReaderTranslationEntitlement,
} from "@/features/playback/PublicTranslationUnlockGate";
import ReaderModeSelector from "@/features/playback/ReaderModeSelector";
import TranslationLanguageSelect, {
  TRANSLATION_TARGET_LANGUAGE_CHANGED_EVENT,
} from "@/features/playback/TranslationLanguageSelect";
import TranslationOnlyEpisodePlayback from "@/features/playback/TranslationOnlyEpisodePlayback";
import TranslationSourceSelector, {
  type HumanTranslationSourceOption,
} from "@/features/playback/TranslationSourceSelector";
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
import { writeBilingualSessionPreference } from "@/lib/translation/bilingualSessionPreference";
import { useUiLocale } from "@/i18n/UiLocaleProvider";
import { readerDictionaries } from "@/i18n/dictionaries/reader";
import { localizePath } from "@/i18n/navigation";
import {
  TRANSLATION_READER_VISIBILITY_EVENT,
  readTranslationReaderVisible,
  writeTranslationReaderVisible,
} from "@/lib/playback/translationReaderPreference";

type ReadBilingualShellProps = {
  children: ReactNode;
  translationEligible: boolean;
  aiTranslationEligible: boolean;
  humanTranslationPermissionOpen: boolean;
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

const HUMAN_TRANSLATION_COPY = {
  ja: {
    translateYourself: "自分で翻訳する",
    missing: "この言語のHuman translationはまだありません。",
  },
  en: {
    translateYourself: "Translate it yourself",
    missing: "No Human translation is available in this language yet.",
  },
  ko: {
    translateYourself: "직접 번역하기",
    missing: "이 언어의 Human translation은 아직 없습니다.",
  },
} as const;

export default function ReadBilingualShell({
  children,
  translationEligible,
  aiTranslationEligible,
  humanTranslationPermissionOpen,
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
  const { snapshot: aiUsage, refresh: refreshAiUsage } = useAiUsage();
  const [mode, setMode] = useState<ReadingMode>("standard");
  const [translationUiVisible, setTranslationUiVisible] = useState(true);
  const [isLanguagePickerOpen, setIsLanguagePickerOpen] = useState(false);
  const [translationAvailability, setTranslationAvailability] =
    useState<BilingualTranslationAvailability>("checking");
  const [translationEntitlement, setTranslationEntitlement] =
    useState<ReaderTranslationEntitlement | null>(null);
  const [entitlementBusy, setEntitlementBusy] = useState(false);
  const [entitlementError, setEntitlementError] = useState<string | null>(null);
  const [rememberForTab, setRememberForTab] = useState(false);
  const [sessionLanguageLocked, setSessionLanguageLocked] = useState(false);
  const [autoGenerateMissingTranslation, setAutoGenerateMissingTranslation] =
    useState(false);
  const [targetLanguage, setTargetLanguage] =
    useState<PublicTranslationTargetLanguage>(() =>
      defaultTargetLanguage(sourceLanguage, uiLocale)
    );
  const [humanTranslations, setHumanTranslations] =
    useState<HumanTranslationSourceOption[]>([]);
  const [humanOptionsLoaded, setHumanOptionsLoaded] = useState(false);
  const [translationSourceKey, setTranslationSourceKey] =
    useState<string>("ai");
  const [resumeSegmentIndex, setResumeSegmentIndex] = useState<number | null>(null);
  const [restoreToken, setRestoreToken] = useState(0);
  const availabilityCheckVersionRef = useRef(0);

  async function checkTranslationAvailability(
    language: PublicTranslationTargetLanguage,
    existingVersion?: number
  ) {
    if (translationSourceKey !== "ai") {
      setTranslationAvailability("ready");
      setTranslationEntitlement(null);
      return;
    }
    if (!aiTranslationEligible) {
      setTranslationAvailability("missing");
      setTranslationEntitlement(null);
      return;
    }

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
        entitlement?: ReaderTranslationEntitlement;
      };
      if (availabilityCheckVersionRef.current !== checkVersion) return;
      if (!response.ok || !payload.ok || !payload.status) {
        setTranslationAvailability("error");
        setTranslationEntitlement(null);
        return;
      }
      setTranslationAvailability(payload.status);
      setTranslationEntitlement(payload.entitlement ?? null);
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

  async function loadHumanTranslationOptions(
    language: PublicTranslationTargetLanguage
  ) {
    setHumanOptionsLoaded(false);
    try {
      const response = await fetch(
        "/api/human-translations/episode/" +
          encodeURIComponent(episodeId) +
          "?targetLanguage=" +
          encodeURIComponent(language),
        { cache: "no-store" }
      );
      const payload = (await response.json().catch(() => null)) as
        | {
            ok?: boolean;
            translations?: HumanTranslationSourceOption[];
          }
        | null;
      const next =
        response.ok && payload?.ok && Array.isArray(payload.translations)
          ? payload.translations
          : [];
      setHumanTranslations(next);

      const params = new URLSearchParams(window.location.search);
      const requested = params.get("translationSource");
      if (
        requested?.startsWith("human:") &&
        next.some((option) => "human:" + option.id === requested)
      ) {
        setTranslationSourceKey(requested);
      } else if (requested === "ai" && aiTranslationEligible) {
        setTranslationSourceKey("ai");
      } else {
        const currentStillExists =
          translationSourceKey.startsWith("human:") &&
          next.some(
            (option) => "human:" + option.id === translationSourceKey
          );
        if (currentStillExists) {
          return;
        }

        if (!aiTranslationEligible && next[0]) {
          const nextKey = "human:" + next[0].id;
          setTranslationSourceKey(nextKey);
          if (mode === "bilingual" || mode === "translation") {
            replaceReaderUrl(
              mode,
              language,
              false,
              sessionLanguageLocked,
              nextKey
            );
          }
          return;
        }

        setTranslationSourceKey("ai");
      }
    } catch {
      setHumanTranslations([]);
    } finally {
      setHumanOptionsLoaded(true);
    }
  }

  async function completeEntitlement(method: "included" | "credit") {
    if (entitlementBusy) return;
    if (translationAvailability === "checking" || translationAvailability === "translating") {
      return;
    }

    setEntitlementError(null);
    setEntitlementBusy(true);
    try {
      const isReady = translationAvailability === "ready";
      const endpoint = isReady
        ? "/api/episode-translations/unlock"
        : "/api/episode-translations/generate";
      const body = isReady
        ? {
            episodeId,
            sourceLanguage,
            targetLanguage,
            method,
          }
        : {
            episodeId,
            sourceLanguage,
            targetLanguage,
            unlockMethod: method,
          };
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        setEntitlementError(readerDictionaries[uiLocale].translationUnlockFailed);
        await checkTranslationAvailability(targetLanguage);
        return;
      }
      await refreshAiUsage();
      await checkTranslationAvailability(targetLanguage);
    } catch {
      setEntitlementError(readerDictionaries[uiLocale].translationUnlockFailed);
    } finally {
      setEntitlementBusy(false);
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
    lockLanguage = false,
    nextTranslationSourceKey = translationSourceKey
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
      url.searchParams.set("translationSource", nextTranslationSourceKey);
    } else {
      for (const key of [
        "bilingual",
        "translationOnly",
        "sourceLanguage",
        "targetLanguage",
        "autoGenerate",
        "lockLanguage",
        "translationSource",
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

  function handleTranslationSourceChange(nextKey: string) {
    if (nextKey === translationSourceKey) return;
    if (
      nextKey !== "ai" &&
      !humanTranslations.some((option) => "human:" + option.id === nextKey)
    ) {
      return;
    }
    setTranslationSourceKey(nextKey);
    setTranslationEntitlement(null);
    setEntitlementError(null);
    setTranslationAvailability(nextKey === "ai" ? "checking" : "ready");
    if (mode === "bilingual" || mode === "translation") {
      replaceReaderUrl(
        mode,
        targetLanguage,
        nextKey === "ai" ? autoGenerateMissingTranslation : false,
        sessionLanguageLocked,
        nextKey
      );
    }
  }

  function setTranslationFeaturesVisible(visible: boolean) {
    writeTranslationReaderVisible(visible);
    setTranslationUiVisible(visible);
    if (!visible && mode !== "standard") disableTranslated(resumeSegmentIndex ?? 0);
  }

  function openTranslatedMode(
    nextMode: "bilingual" | "translation",
    nextTargetLanguage = targetLanguage,
    autoGenerate = true,
    lockLanguage = sessionLanguageLocked
  ) {
    if (!translationEligible || !translationUiVisible || nextTargetLanguage === sourceLanguage) return;
    stopOriginalPlayback();
    setTargetLanguage(nextTargetLanguage);
    const effectiveAutoGenerate =
      translationSourceKey === "ai" ? autoGenerate : false;
    setAutoGenerateMissingTranslation(effectiveAutoGenerate);
    setSessionLanguageLocked(lockLanguage);
    replaceReaderUrl(
      nextMode,
      nextTargetLanguage,
      effectiveAutoGenerate,
      lockLanguage,
      translationSourceKey
    );
    setIsLanguagePickerOpen(false);
    setMode(nextMode);
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
    setTranslationEntitlement(null);
    setRestoreToken((current) => current + 1);
  }

  function handleModeChange(nextMode: ReadingMode) {
    if (nextMode === mode) return;
    if (nextMode === "standard") {
      disableTranslated(resumeSegmentIndex ?? 0);
      return;
    }
    if (!translationEligible || !translationUiVisible) return;
    openTranslatedMode(nextMode, targetLanguage, true, sessionLanguageLocked);
  }

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setTranslationUiVisible(readTranslationReaderVisible());
    });
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ visible?: unknown }>).detail;
      if (typeof detail?.visible !== "boolean") return;
      setTranslationUiVisible(detail.visible);
    };
    window.addEventListener(TRANSLATION_READER_VISIBILITY_EVENT, handler);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener(TRANSLATION_READER_VISIBILITY_EVENT, handler);
    };
  }, []);

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
      setHumanTranslations([]);
      setHumanOptionsLoaded(false);
      setTranslationSourceKey("ai");
      if (mode === "bilingual" || mode === "translation") {
        replaceReaderUrl(
          mode,
          language,
          autoGenerateMissingTranslation,
          sessionLanguageLocked,
          "ai"
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
    if (!translationUiVisible) {
      replaceReaderUrl("standard");
      return;
    }

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
    const requestedTranslationSource = params.get("translationSource");
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
      if (
        requestedTranslationSource === "ai" ||
        requestedTranslationSource?.startsWith("human:")
      ) {
        setTranslationSourceKey(requestedTranslationSource);
      }
      setAutoGenerateMissingTranslation(
        requestedTranslationSource?.startsWith("human:")
          ? false
          : requestedAutoGenerate
      );
      stopOriginalPlayback();
      setMode(requestedMode);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [episodeId, episodeNumber, seriesId, sourceLanguage, translationEligible, translationUiVisible]);

  useEffect(() => {
    if (mode !== "bilingual" && mode !== "translation") return;
    void loadHumanTranslationOptions(targetLanguage);
  }, [episodeId, mode, targetLanguage]);

  useEffect(() => {
    if (mode !== "bilingual" && mode !== "translation") return;
    if (translationSourceKey !== "ai") {
      setTranslationAvailability("ready");
      setTranslationEntitlement(null);
      return;
    }
    void checkTranslationAvailability(targetLanguage);
  }, [
    aiTranslationEligible,
    episodeId,
    mode,
    targetLanguage,
    translationSourceKey,
  ]);

  useEffect(() => {
    if (mode !== "bilingual" && mode !== "translation") return;
    if (
      translationSourceKey !== "ai" ||
      humanTranslations.length === 0 ||
      !translationEntitlement ||
      translationEntitlement.status === "unlocked"
    ) {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    if (params.has("translationSource")) return;
    handleTranslationSourceChange("human:" + humanTranslations[0]!.id);
  }, [
    humanTranslations,
    mode,
    translationEntitlement,
    translationSourceKey,
  ]);

  const selectedHumanTranslationId = translationSourceKey.startsWith("human:")
    ? translationSourceKey.slice("human:".length)
    : null;
  const translatedModeLocked =
    translationSourceKey === "ai" &&
    (mode === "bilingual" || mode === "translation") &&
    translationEntitlement !== null &&
    translationEntitlement.status !== "unlocked";
  const translatedModeChecking =
    translationSourceKey === "ai" &&
    (mode === "bilingual" || mode === "translation") &&
    translationAvailability === "checking";
  const waitingForHumanOptions =
    !aiTranslationEligible &&
    (mode === "bilingual" || mode === "translation") &&
    !humanOptionsLoaded;
  const noReadableTranslationSource =
    !aiTranslationEligible &&
    (mode === "bilingual" || mode === "translation") &&
    humanOptionsLoaded &&
    humanTranslations.length === 0;
  const humanCopy = HUMAN_TRANSLATION_COPY[uiLocale];
  const selfTranslateHref = localizePath(
    "/translate/" +
      encodeURIComponent(seriesId) +
      "/" +
      String(episodeNumber) +
      "?targetLanguage=" +
      encodeURIComponent(targetLanguage),
    uiLocale
  );

  const translationSourceControls =
    humanTranslations.length > 0 || humanTranslationPermissionOpen ? (
      <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center justify-end gap-2 px-3 pt-2 sm:px-6">
        {humanTranslations.length > 0 ? (
          <TranslationSourceSelector
            value={translationSourceKey}
            humanTranslations={humanTranslations}
            showAi={aiTranslationEligible}
            onChange={handleTranslationSourceChange}
          />
        ) : null}
        {humanTranslationPermissionOpen ? (
          <a
            href={selfTranslateHref}
            className="rounded-full border border-black/10 bg-white px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
          >
            {humanCopy.translateYourself}
          </a>
        ) : null}
      </div>
    ) : null;

  if (waitingForHumanOptions) {
    return (
      <>
        {translationUiVisible ? (
          <ReaderModeSelector
            mode={mode}
            translationEnabled={translationEligible}
            onChange={handleModeChange}
          />
        ) : null}
        {translationSourceControls}
        <main className="min-h-[70vh] bg-white text-black">
          <div className="mx-auto flex w-full max-w-xl justify-center px-4 py-12 sm:px-6">
            <p className="rounded-[28px] border border-black/10 bg-neutral-50 px-6 py-5 text-sm text-neutral-700">
              {readerDictionaries[uiLocale].checkingTranslation}
            </p>
          </div>
        </main>
      </>
    );
  }

  if (noReadableTranslationSource) {
    return (
      <>
        {translationUiVisible ? (
          <ReaderModeSelector
            mode={mode}
            translationEnabled={translationEligible}
            onChange={handleModeChange}
          />
        ) : null}
        <main className="min-h-[70vh] bg-white text-black">
          <div className="mx-auto w-full max-w-xl px-4 py-12 sm:px-6">
            <div className="rounded-[28px] border border-black/10 bg-neutral-50 p-6 text-center">
              <p className="text-lg font-semibold">{humanCopy.missing}</p>
              {humanTranslationPermissionOpen ? (
                <a
                  href={selfTranslateHref}
                  className="mt-5 inline-flex rounded-full bg-black px-5 py-2.5 text-sm font-medium text-white"
                >
                  {humanCopy.translateYourself}
                </a>
              ) : null}
            </div>
          </div>
        </main>
      </>
    );
  }

  if (translatedModeChecking) {
    return (
      <>
        {translationUiVisible ? (
          <ReaderModeSelector
            mode={mode}
            translationEnabled={translationEligible}
            onChange={handleModeChange}
          />
        ) : null}
        {translationSourceControls}
        <main className="min-h-[70vh] bg-white text-black">
          <div className="mx-auto flex w-full max-w-xl justify-center px-4 py-12 sm:px-6">
            <p className="rounded-[28px] border border-black/10 bg-neutral-50 px-6 py-5 text-sm text-neutral-700">
              {readerDictionaries[uiLocale].checkingTranslation}
            </p>
          </div>
        </main>
      </>
    );
  }

  if (translatedModeLocked && translationEntitlement) {
    return (
      <>
        {translationUiVisible ? (
          <ReaderModeSelector
            mode={mode}
            translationEnabled={translationEligible}
            onChange={handleModeChange}
          />
        ) : null}
        {translationSourceControls}
        <main className="min-h-[70vh] bg-white text-black">
          <div className="mx-auto w-full max-w-xl px-4 py-12 sm:px-6">
            <div className="rounded-[28px] border border-black/10 bg-neutral-50 p-6 text-center">
              <PublicTranslationUnlockGate
                entitlement={translationEntitlement}
                busy={entitlementBusy}
                requiresGeneration={translationAvailability !== "ready"}
                errorMessage={entitlementError}
                onConfirmIncluded={() => completeEntitlement("included")}
                onConfirmCredit={() => completeEntitlement("credit")}
              />
              {humanTranslationPermissionOpen ? (
                <a
                  href={selfTranslateHref}
                  className="mt-5 inline-flex rounded-full border border-black/10 bg-white px-4 py-2.5 text-sm font-medium text-neutral-700"
                >
                  {humanCopy.translateYourself}
                </a>
              ) : null}
            </div>
          </div>
        </main>
      </>
    );
  }

  if (mode === "bilingual") {
    return (
      <>
        {translationUiVisible ? (
          <ReaderModeSelector
            mode={mode}
            translationEnabled={translationEligible}
            onChange={handleModeChange}
          />
        ) : null}
        {translationSourceControls}
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
          autoGenerateMissingTranslation={
            translationSourceKey === "ai" && autoGenerateMissingTranslation
          }
          targetLanguageLocked={sessionLanguageLocked}
          translationProvenance={
            selectedHumanTranslationId ? "human" : "ai"
          }
          humanTranslationId={selectedHumanTranslationId}
          onDisableBilingual={disableTranslated}
        />
      </>
    );
  }

  if (mode === "translation") {
    return (
      <>
        {translationUiVisible ? (
          <ReaderModeSelector
            mode={mode}
            translationEnabled={translationEligible}
            onChange={handleModeChange}
          />
        ) : null}
        {translationSourceControls}
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
          autoGenerateMissingTranslation={
            translationSourceKey === "ai" && autoGenerateMissingTranslation
          }
          targetLanguageLocked={sessionLanguageLocked}
          translationProvenance={
            selectedHumanTranslationId ? "human" : "ai"
          }
          humanTranslationId={selectedHumanTranslationId}
        />
      </>
    );
  }

  return (
    <>
      {translationUiVisible ? (
        <ReaderModeSelector
          mode={mode}
          translationEnabled={translationEligible}
          onChange={handleModeChange}
        />
      ) : null}
      {translationEligible && translationUiVisible ? (
        <div className="mx-auto flex w-full max-w-4xl justify-end px-3 pt-2 sm:px-6">
          <TranslationLanguageSelect
            value={targetLanguage}
            sourceLanguage={sourceLanguage}
            onChange={(language) => {
              setTargetLanguage(language);
            }}
          />
        </div>
      ) : null}
      {children}
      <BilingualSettingsBridge
        available={translationEligible}
        visible={translationUiVisible}
        onVisibleChange={setTranslationFeaturesVisible}
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
          translationUsage={translationEntitlement ? null : aiUsage?.actions.translation_generation}
          isSubscriber={translationEntitlement ? false : aiUsage?.isSubscriber === true}
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
