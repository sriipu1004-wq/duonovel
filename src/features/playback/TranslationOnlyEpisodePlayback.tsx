"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BilingualPane, {
  type BilingualSegment,
} from "@/features/playback/BilingualPane";
import TranslationLanguageSelect from "@/features/playback/TranslationLanguageSelect";
import TranslationOnlyFooter from "@/features/playback/TranslationOnlyFooter";
import { useReaderDisplaySettings } from "@/features/playback/useReaderDisplaySettings";
import { useAiUsage } from "@/features/usage/useAiUsage";
import {
  formatAiUsage,
  isAiUsageLimitReached,
} from "@/lib/aiUsage/aiUsage";
import {
  readEpisodeReadingPosition,
  resolveReadingPositionIndex,
  writeReadingHistory,
} from "@/lib/playback/readingBookmark";
import {
  getSupportedLanguage,
  type PublicTranslationTargetLanguage,
  type SupportedLanguageTag,
} from "@/lib/translation/languageRegistry";
import { useUiLocale } from "@/i18n/UiLocaleProvider";
import { readerDictionaries } from "@/i18n/dictionaries/reader";

type TranslationStatus =
  | "loading"
  | "missing"
  | "translating"
  | "ready"
  | "failed"
  | "stale"
  | "error";

type TranslationStatusResponse = {
  ok: boolean;
  status?: Exclude<TranslationStatus, "loading" | "error">;
  canGenerate?: boolean;
  sourceHash?: string;
  segments?: BilingualSegment[];
  message?: string;
  error?: string;
};

type Props = {
  seriesId: string;
  episodeId: string;
  episodeNumber: number;
  seriesTitle?: string;
  episodeTitle?: string;
  workAuthorName?: string;
  workEditorName?: string;
  workIndexHref?: string | null;
  prevEpisodeHref?: string | null;
  nextEpisodeHref?: string | null;
  initialTargetLanguage: PublicTranslationTargetLanguage;
  sourceLanguage: SupportedLanguageTag;
  autoGenerateMissingTranslation: boolean;
  targetLanguageLocked: boolean;
};

function safeText(value: string | undefined, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export default function TranslationOnlyEpisodePlayback({
  seriesId,
  episodeId,
  episodeNumber,
  seriesTitle,
  episodeTitle,
  workAuthorName,
  workEditorName,
  workIndexHref,
  prevEpisodeHref,
  nextEpisodeHref,
  initialTargetLanguage,
  sourceLanguage,
  autoGenerateMissingTranslation,
  targetLanguageLocked,
}: Props) {
  const dictionary = readerDictionaries[useUiLocale()];
  const { snapshot: aiUsage, refresh: refreshAiUsage } = useAiUsage();
  const { displaySettings, setDisplaySettings } = useReaderDisplaySettings(seriesId);
  const [targetLanguage, setTargetLanguage] =
    useState<PublicTranslationTargetLanguage>(initialTargetLanguage);
  const targetLanguageRef = useRef(initialTargetLanguage);
  const [translationStatus, setTranslationStatus] =
    useState<TranslationStatus>("loading");
  const [segments, setSegments] = useState<BilingualSegment[]>([]);
  const [canGenerate, setCanGenerate] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const [hoveredSegmentId, setHoveredSegmentId] = useState<string | null>(null);
  const [currentPositionIndex, setCurrentPositionIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const segmentRefs = useRef(new Map<string, HTMLSpanElement | null>());
  const generationInFlightRef = useRef(false);
  const autoGenerationAttemptRef = useRef<string | null>(null);
  const restoredKeyRef = useRef<string | null>(null);

  useEffect(() => {
    targetLanguageRef.current = initialTargetLanguage;
    setTargetLanguage(initialTargetLanguage);
  }, [initialTargetLanguage]);

  const loadTranslation = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/episode-translations/${encodeURIComponent(episodeId)}?sourceLanguage=${encodeURIComponent(sourceLanguage)}&targetLanguage=${encodeURIComponent(targetLanguage)}`,
        { cache: "no-store" }
      );
      const payload = (await response.json()) as TranslationStatusResponse;
      if (targetLanguageRef.current !== targetLanguage) return;
      if (!response.ok || !payload.ok) {
        setTranslationStatus("error");
        setStatusMessage(payload.message || dictionary.translationLoadFailed);
        return;
      }
      setCanGenerate(payload.canGenerate === true);
      const nextStatus = payload.status ?? "missing";
      if (nextStatus === "ready" && Array.isArray(payload.segments)) {
        setTranslationStatus("ready");
        setSegments(payload.segments);
        const firstId = payload.segments[0]?.id ?? null;
        setSelectedSegmentId((current) => current ?? firstId);
        setStatusMessage("");
        return;
      }
      setSegments([]);
      setTranslationStatus(nextStatus);
      setStatusMessage(payload.message || "");
    } catch {
      if (targetLanguageRef.current !== targetLanguage) return;
      setTranslationStatus("error");
      setStatusMessage(dictionary.translationLoadFailed);
    }
  }, [dictionary.translationLoadFailed, episodeId, sourceLanguage, targetLanguage]);

  const requestTranslationGeneration = useCallback(async () => {
    if (generationInFlightRef.current) return false;
    generationInFlightRef.current = true;
    setIsGenerating(true);
    setStatusMessage("");
    try {
      const response = await fetch("/api/episode-translations/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ episodeId, sourceLanguage, targetLanguage }),
      });
      const responseText = await response.text();
      let payload: TranslationStatusResponse;
      try {
        payload = JSON.parse(responseText) as TranslationStatusResponse;
      } catch {
        setTranslationStatus("error");
        setStatusMessage(dictionary.translationLoadFailed);
        return false;
      }
      await refreshAiUsage();
      if (targetLanguageRef.current !== targetLanguage) return true;
      if (!response.ok || !payload.ok) {
        setStatusMessage(payload.message || dictionary.translationFailed);
        if (
          payload.error === "translation_openai_failed" ||
          payload.error === "translation_exception" ||
          payload.error === "missing_openai_api_key" ||
          payload.error === "translation_retry_forbidden" ||
          payload.error === "translation_timeout"
        ) {
          setTranslationStatus("failed");
        } else {
          setTranslationStatus("error");
        }
        return false;
      }
      setTranslationStatus(payload.status === "ready" ? "ready" : "translating");
      if (payload.status === "ready") void loadTranslation();
      return true;
    } catch {
      if (targetLanguageRef.current === targetLanguage) {
        setTranslationStatus("error");
        setStatusMessage(dictionary.translationLoadFailed);
      }
      return false;
    } finally {
      generationInFlightRef.current = false;
      setIsGenerating(false);
    }
  }, [
    dictionary.translationFailed,
    dictionary.translationLoadFailed,
    episodeId,
    loadTranslation,
    refreshAiUsage,
    sourceLanguage,
    targetLanguage,
  ]);

  useEffect(() => {
    setTranslationStatus("loading");
    setSegments([]);
    setSelectedSegmentId(null);
    setHoveredSegmentId(null);
    restoredKeyRef.current = null;
    void loadTranslation();
  }, [episodeId, loadTranslation]);

  useEffect(() => {
    if (translationStatus !== "translating") return;
    const timer = window.setInterval(() => void loadTranslation(), 2500);
    return () => window.clearInterval(timer);
  }, [loadTranslation, translationStatus]);

  useEffect(() => {
    const attemptKey = `${episodeId}:${sourceLanguage}:${targetLanguage}`;
    if (
      !autoGenerateMissingTranslation ||
      !["missing", "stale", "failed"].includes(translationStatus) ||
      !canGenerate ||
      autoGenerationAttemptRef.current === attemptKey
    ) {
      return;
    }
    autoGenerationAttemptRef.current = attemptKey;
    void requestTranslationGeneration();
  }, [
    autoGenerateMissingTranslation,
    canGenerate,
    episodeId,
    requestTranslationGeneration,
    sourceLanguage,
    targetLanguage,
    translationStatus,
  ]);

  useEffect(() => {
    if (translationStatus !== "ready" || segments.length === 0) return;
    const key = `${episodeNumber}:${sourceLanguage}:${targetLanguage}`;
    if (restoredKeyRef.current === key) return;
    restoredKeyRef.current = key;
    const location = readEpisodeReadingPosition(seriesId, episodeNumber);
    const index = location ? resolveReadingPositionIndex(segments, location) : 0;
    const segment = segments[index];
    if (!segment) return;
    setCurrentPositionIndex(index);
    setSelectedSegmentId(segment.id);
    writeReadingHistory({
      seriesId,
      episodeNumber,
      positionIndex: index,
      paragraphIndex: segment.paragraphIndex,
      sentenceIndex: segment.sentenceIndex,
      mode: "translation",
      sourceLanguage,
      targetLanguage,
    });
    window.requestAnimationFrame(() => {
      const container = scrollRef.current;
      const node = segmentRefs.current.get(segment.id);
      if (!container || !node) return;
      const a = container.getBoundingClientRect();
      const b = node.getBoundingClientRect();
      container.scrollTop += b.top - a.top;
    });
  }, [
    episodeNumber,
    segments,
    seriesId,
    sourceLanguage,
    targetLanguage,
    translationStatus,
  ]);

  function handlePositionChange(id: string) {
    const index = segments.findIndex((segment) => segment.id === id);
    if (index < 0) return;
    const segment = segments[index];
    setCurrentPositionIndex(index);
    writeReadingHistory({
      seriesId,
      episodeNumber,
      positionIndex: index,
      paragraphIndex: segment.paragraphIndex,
      sentenceIndex: segment.sentenceIndex,
      mode: "translation",
      sourceLanguage,
      targetLanguage,
    });
  }

  function handleSelectSegment(id: string) {
    handlePositionChange(id);
    setSelectedSegmentId(id);
  }

  function handleTargetLanguageChange(language: PublicTranslationTargetLanguage) {
    if (targetLanguageLocked || language === targetLanguage || language === sourceLanguage) {
      return;
    }
    targetLanguageRef.current = language;
    autoGenerationAttemptRef.current = null;
    setTargetLanguage(language);
  }

  const safeSeriesTitle = safeText(seriesTitle, "無題");
  const safeEpisodeTitle = safeText(episodeTitle, `第${episodeNumber}話`);
  const safeAuthorName = safeText(workAuthorName, "作者名未設定");
  const safeEditorName = safeText(workEditorName, "");
  const targetLanguageLabel = getSupportedLanguage(targetLanguage).nativeLabel;
  const currentSegment = segments[currentPositionIndex];
  const narrationUnits = useMemo(
    () => segments.map((segment) => segment.translatedText),
    [segments]
  );

  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto w-full max-w-4xl px-3 py-4 sm:px-6 sm:py-6">
        <section className="overflow-hidden rounded-[28px] border border-black/10 bg-white shadow-sm">
          <header className="border-b border-black/10 px-4 py-4 sm:px-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs tracking-[0.18em] text-neutral-500">
                  LIB READ · {dictionary.translationOnlyTitle}
                </p>
                {workIndexHref ? (
                  <Link
                    href={workIndexHref}
                    className="mt-2 inline-flex text-sm text-neutral-600 hover:text-black"
                  >
                    {safeSeriesTitle}
                  </Link>
                ) : (
                  <p className="mt-2 text-sm text-neutral-600">{safeSeriesTitle}</p>
                )}
                <h1 className="mt-1 text-xl font-semibold sm:text-2xl">
                  {safeEpisodeTitle}
                </h1>
                <p className="mt-2 text-xs text-neutral-500">
                  {safeAuthorName}
                  {safeEditorName ? ` / ${safeEditorName}` : ""}
                </p>
              </div>
              <TranslationLanguageSelect
                value={targetLanguage}
                sourceLanguage={sourceLanguage}
                onChange={handleTargetLanguageChange}
                disabled={targetLanguageLocked}
              />
            </div>
          </header>

          {translationStatus === "ready" && segments.length > 0 ? (
            <div className="h-[calc(100dvh-16rem)] min-h-[30rem] max-h-[64rem] bg-white">
              <BilingualPane
                side="target"
                languageLabel={targetLanguageLabel}
                languageTag={targetLanguage}
                segments={segments}
                selectedSegmentId={selectedSegmentId}
                hoveredSegmentId={hoveredSegmentId}
                scrollRef={scrollRef}
                registerSegmentRef={(id, node) => segmentRefs.current.set(id, node)}
                onSelectSegment={handleSelectSegment}
                onHoverSegment={setHoveredSegmentId}
                onReadingPositionChange={handlePositionChange}
                displaySettings={displaySettings}
              />
            </div>
          ) : (
            <div className="flex min-h-[30rem] items-center justify-center px-5 py-10">
              <div className="w-full max-w-xl rounded-[28px] border border-black/10 bg-neutral-50 p-6 text-center">
                <p className="text-lg font-semibold">
                  {translationStatus === "loading"
                    ? dictionary.checkingTranslation
                    : translationStatus === "translating"
                      ? dictionary.preparingTranslation
                      : translationStatus === "stale"
                        ? dictionary.translationStale
                        : translationStatus === "failed"
                          ? dictionary.translationFailed
                          : translationStatus === "error"
                            ? dictionary.translationLoadFailed
                            : dictionary.translationMissing}
                </p>
                {statusMessage ? (
                  <p className="mt-2 text-sm leading-7 text-neutral-600">
                    {statusMessage}
                  </p>
                ) : null}
                {canGenerate &&
                ["missing", "stale", "failed"].includes(translationStatus) ? (
                  <button
                    type="button"
                    onClick={() => void requestTranslationGeneration()}
                    disabled={
                      isGenerating ||
                      isAiUsageLimitReached(aiUsage?.actions.translation_generation)
                    }
                    className="mt-5 rounded-full bg-black px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {isGenerating
                      ? dictionary.preparingTranslation
                      : `${translationStatus === "missing" ? dictionary.generateTranslation : dictionary.regenerateTranslation} ${formatAiUsage(aiUsage?.actions.translation_generation)}`}
                  </button>
                ) : null}
              </div>
            </div>
          )}
        </section>

        {translationStatus === "ready" && segments.length > 0 ? (
          <TranslationOnlyFooter
            seriesId={seriesId}
            episodeNumber={episodeNumber}
            positionIndex={currentPositionIndex}
            paragraphIndex={currentSegment?.paragraphIndex}
            sentenceIndex={currentSegment?.sentenceIndex}
            narrationUnits={narrationUnits}
            sourceLanguage={sourceLanguage}
            targetLanguage={targetLanguage}
            prevHref={prevEpisodeHref}
            nextHref={nextEpisodeHref}
            displaySettings={displaySettings}
            onDisplaySettingsChange={setDisplaySettings}
            onPositionIndexChange={(index, shouldFollow) => {
              const segment = segments[index];
              if (!segment) return;
              handlePositionChange(segment.id);
              setSelectedSegmentId(segment.id);
              if (shouldFollow) {
                const container = scrollRef.current;
                const node = segmentRefs.current.get(segment.id);
                if (container && node) {
                  const a = container.getBoundingClientRect();
                  const b = node.getBoundingClientRect();
                  container.scrollTo({
                    top: container.scrollTop + b.top - a.top - container.clientHeight / 2,
                    behavior: "smooth",
                  });
                }
              }
            }}
          />
        ) : null}
      </div>
    </main>
  );
}
