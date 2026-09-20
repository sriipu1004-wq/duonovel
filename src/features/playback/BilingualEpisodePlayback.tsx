"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BilingualDivider from "@/features/playback/BilingualDivider";
import BilingualHeightHandle, {
  clampBilingualReaderHeight,
} from "@/features/playback/BilingualHeightHandle";
import BilingualPane, {
  type BilingualSegment,
  type PaneSide,
} from "@/features/playback/BilingualPane";
import BilingualStudyControls from "@/features/playback/BilingualStudyControls";
import BilingualStoppedFooter from "@/features/playback/BilingualStoppedFooter";
import { useReaderDisplaySettings } from "@/features/playback/useReaderDisplaySettings";
import { useBilingualWordExplanation } from "@/features/playback/useBilingualWordExplanation";
import TranslationLanguageSelect from "@/features/playback/TranslationLanguageSelect";
import {
  getSupportedLanguage,
  type PublicTranslationTargetLanguage,
  type SupportedLanguageTag,
} from "@/lib/translation/languageRegistry";
import { useAiUsage } from "@/features/usage/useAiUsage";
import {
  formatAiUsage,
  isAiUsageLimitReached,
} from "@/lib/aiUsage/aiUsage";
import { scrollBilingualPaneTo } from "@/lib/playback/bilingualScroll";
import {
  readEpisodeReadingPosition,
  resolveReadingPositionIndex,
  writeReadingHistory,
} from "@/lib/playback/readingBookmark";
import { useUiLocale } from "@/i18n/UiLocaleProvider";
import { readerDictionaries } from "@/i18n/dictionaries/reader";
import { bilingualReaderDictionaries } from "@/i18n/dictionaries/bilingualReader";
import { localizePath } from "@/i18n/navigation";

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
  canAutoGenerate?: boolean;
  isAllowlisted?: boolean;
  sourceHash?: string;
  segments?: BilingualSegment[];
  message?: string;
  error?: string;
};

type BilingualEpisodePlaybackProps = {
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
  onDisableBilingual: (segmentIndex: number) => void;
};

type BilingualPreference = {
  splitRatio: number;
  upperPane: PaneSide;
  readerHeight: number | null;
  targetLanguage: PublicTranslationTargetLanguage;
};

const DEFAULT_PREFERENCE: BilingualPreference = {
  splitRatio: 50,
  upperPane: "source",
  readerHeight: null,
  targetLanguage: "en",
};

function clampRatio(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return Math.min(80, Math.max(20, value));
}

function readPreference(
  seriesId: string,
  initialTargetLanguage: PublicTranslationTargetLanguage
): BilingualPreference {
  const fallback = { ...DEFAULT_PREFERENCE, targetLanguage: initialTargetLanguage };
  if (typeof window === "undefined") return fallback;

  try {
    const raw =
      window.localStorage.getItem("duonovel:bilingual-display") ??
      window.localStorage.getItem("duonovel:bilingual-display:" + seriesId);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<BilingualPreference> & {
      upperLanguage?: string;
    };
    return {
      splitRatio:
        typeof parsed.splitRatio === "number"
          ? clampRatio(parsed.splitRatio)
          : DEFAULT_PREFERENCE.splitRatio,
      upperPane:
        parsed.upperPane === "target" || parsed.upperLanguage === "en"
          ? "target"
          : DEFAULT_PREFERENCE.upperPane,
      readerHeight:
        typeof parsed.readerHeight === "number"
          ? clampBilingualReaderHeight(parsed.readerHeight)
          : DEFAULT_PREFERENCE.readerHeight,
      targetLanguage: fallback.targetLanguage,
    };
  } catch {
    return fallback;
  }
}

function safeText(value: string | undefined, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export default function BilingualEpisodePlayback({
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
  onDisableBilingual,
}: BilingualEpisodePlaybackProps) {
  const locale = useUiLocale();
  const dictionary = readerDictionaries[locale];
  const bilingualDictionary = bilingualReaderDictionaries[locale];
  const { snapshot: aiUsage, refresh: refreshAiUsage } = useAiUsage();
  const { displaySettings, setDisplaySettings } =
    useReaderDisplaySettings(seriesId);
  const preference = useMemo(
    () => readPreference(seriesId, initialTargetLanguage),
    [initialTargetLanguage, seriesId]
  );
  const [splitRatio, setSplitRatio] = useState(preference.splitRatio);
  const [upperPane, setUpperPane] = useState<PaneSide>(
    preference.upperPane
  );
  const [readerHeight, setReaderHeight] = useState<number | null>(
    preference.readerHeight
  );
  const [targetLanguage, setTargetLanguage] =
    useState<PublicTranslationTargetLanguage>(preference.targetLanguage);
  const [translationStatus, setTranslationStatus] =
    useState<TranslationStatus>("loading");
  const [segments, setSegments] = useState<BilingualSegment[]>([]);
  const [canGenerate, setCanGenerate] = useState(false);
  const [canAutoGenerate, setCanAutoGenerate] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [sourceHash, setSourceHash] = useState<string | null>(null);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const [hoveredSegmentId, setHoveredSegmentId] = useState<string | null>(null);
  const [currentPositionIndex, setCurrentPositionIndex] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const jaScrollRef = useRef<HTMLDivElement | null>(null);
  const enScrollRef = useRef<HTMLDivElement | null>(null);
  const readerGridRef = useRef<HTMLDivElement | null>(null);
  const jaSegmentRefs = useRef(new Map<string, HTMLSpanElement | null>());
  const enSegmentRefs = useRef(new Map<string, HTMLSpanElement | null>());
  const generationInFlightRef = useRef(false);
  const readingSegmentIdRef = useRef<string | null>(null);
  const settingsResumeSegmentIdRef = useRef<string | null>(null);
  const targetLanguageRef = useRef<PublicTranslationTargetLanguage>(
    preference.targetLanguage
  );
  const autoGenerationAttemptRef = useRef<string | null>(null);
  const restoredBookmarkKeyRef = useRef<string | null>(null);
  const {
    wordInsight,
    clearWordInsight,
    selectWord: handleSelectWord,
  } = useBilingualWordExplanation({
    contentType: "episode",
    contentId: episodeId,
    sourceHash,
    sourceLanguage,
    targetLanguage,
    refreshAiUsage,
  });

  useEffect(() => {
    setSplitRatio(preference.splitRatio);
    setUpperPane(preference.upperPane);
    setReaderHeight(preference.readerHeight);
    targetLanguageRef.current = preference.targetLanguage;
    setTargetLanguage(preference.targetLanguage);
  }, [preference]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        "duonovel:bilingual-display",
        JSON.stringify({ splitRatio, upperPane, readerHeight, targetLanguage })
      );
    } catch {
      // local preference persistence is non-critical
    }
  }, [readerHeight, seriesId, splitRatio, targetLanguage, upperPane]);

  useEffect(() => {
    if (translationStatus !== "ready" || segments.length === 0) return;
    const restoreKey = `${episodeNumber}:${sourceLanguage}:${targetLanguage}:${sourceHash ?? "ready"}`;
    if (restoredBookmarkKeyRef.current === restoreKey) return;
    restoredBookmarkKeyRef.current = restoreKey;
    const location = readEpisodeReadingPosition(seriesId, episodeNumber);
    const index = location
      ? resolveReadingPositionIndex(segments, location)
      : 0;
    const id = segments[index]?.id;
    if (!id) return;
    const segment = segments[index];
    readingSegmentIdRef.current = id;
    setCurrentPositionIndex(index);
    if (location) setSelectedSegmentId(id);
    writeReadingHistory({
      seriesId,
      episodeNumber,
      positionIndex: index,
      paragraphIndex: segment?.paragraphIndex,
      sentenceIndex: segment?.sentenceIndex,
      mode: "bilingual",
      sourceLanguage,
      targetLanguage,
    });
    window.requestAnimationFrame(() => alignSegmentToTop(id));
  }, [
    episodeNumber,
    segments,
    seriesId,
    sourceHash,
    sourceLanguage,
    targetLanguage,
    translationStatus,
  ]);

  const requestTranslationGeneration = useCallback(async () => {
    if (generationInFlightRef.current) return false;

    generationInFlightRef.current = true;
    setIsGenerating(true);
    setStatusMessage("");

    try {
      const response = await fetch("/api/episode-translations/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          episodeId,
          sourceLanguage,
          targetLanguage,
        }),
      });
      const responseText = await response.text();
      let payload: TranslationStatusResponse;

      try {
        payload = JSON.parse(responseText) as TranslationStatusResponse;
      } catch {
        if (targetLanguageRef.current !== targetLanguage) return false;
        setStatusMessage(bilingualDictionary.responseInvalid(response.status));
        setTranslationStatus("error");
        return false;
      }
      await refreshAiUsage();

      if (targetLanguageRef.current !== targetLanguage) return true;

      if (!response.ok || !payload.ok) {
        setStatusMessage(
          locale === "ja" && payload.message
            ? payload.message
            : bilingualDictionary.generationFailed
        );

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

      setTranslationStatus("translating");
      return true;
    } catch {
      if (targetLanguageRef.current !== targetLanguage) return false;
      setStatusMessage(bilingualDictionary.communicationInterrupted);
      setTranslationStatus("error");
      return false;
    } finally {
      generationInFlightRef.current = false;
      setIsGenerating(false);
    }
  }, [
    bilingualDictionary,
    episodeId,
    locale,
    refreshAiUsage,
    sourceLanguage,
    targetLanguage,
  ]);

  const loadTranslation = useCallback(async () => {
    try {
      const response = await fetch(
        "/api/episode-translations/" +
          encodeURIComponent(episodeId) +
          "?sourceLanguage=" +
          encodeURIComponent(sourceLanguage) +
          "&targetLanguage=" +
          encodeURIComponent(targetLanguage),
        { cache: "no-store" }
      );
      const payload = (await response.json()) as TranslationStatusResponse;

      if (targetLanguageRef.current !== targetLanguage) return;

      if (!response.ok || !payload.ok) {
        setCanAutoGenerate(false);
        setTranslationStatus("error");
        setStatusMessage(
          locale === "ja" && payload.message
            ? payload.message
            : bilingualDictionary.statusUnavailable
        );
        return;
      }

      setCanGenerate(payload.canGenerate === true);
      setCanAutoGenerate(payload.canAutoGenerate === true);
      setSourceHash(payload.sourceHash ?? null);
      const nextStatus = payload.status ?? "missing";

      if (nextStatus === "ready" && Array.isArray(payload.segments)) {
        setTranslationStatus("ready");
        setSegments(payload.segments);
        const firstId = payload.segments?.[0]?.id ?? null;
        readingSegmentIdRef.current = readingSegmentIdRef.current ?? firstId;
        setStatusMessage("");
        return;
      }

      setSegments([]);

      setTranslationStatus(nextStatus);
      setStatusMessage(
        locale === "ja" && payload.message
          ? payload.message
          : nextStatus === "stale"
            ? bilingualDictionary.staleRegenerating
            : ""
      );
    } catch {
      if (targetLanguageRef.current !== targetLanguage) return;
      setCanAutoGenerate(false);
      setTranslationStatus("error");
      setStatusMessage(bilingualDictionary.statusUnavailable);
    }
  }, [
    bilingualDictionary,
    episodeId,
    locale,
    sourceLanguage,
    targetLanguage,
  ]);

  useEffect(() => {
    readingSegmentIdRef.current = null;
    setTranslationStatus("loading");
    setCanAutoGenerate(false);
    setSegments([]);
    setSelectedSegmentId(null);
    setHoveredSegmentId(null);
    setSourceHash(null);
    clearWordInsight();
    void loadTranslation();
  }, [clearWordInsight, episodeId, loadTranslation]);

  useEffect(() => {
    const attemptKey = `${episodeId}:${sourceLanguage}:${targetLanguage}`;
    if (
      !autoGenerateMissingTranslation ||
      !["missing", "stale", "failed"].includes(translationStatus) ||
      !canGenerate ||
      !canAutoGenerate ||
      autoGenerationAttemptRef.current === attemptKey
    ) {
      return;
    }
    autoGenerationAttemptRef.current = attemptKey;
    void requestTranslationGeneration();
  }, [
    autoGenerateMissingTranslation,
    canAutoGenerate,
    canGenerate,
    episodeId,
    requestTranslationGeneration,
    sourceLanguage,
    targetLanguage,
    translationStatus,
  ]);

  useEffect(() => {
    if (translationStatus !== "translating") return;
    const timer = window.setInterval(() => {
      void loadTranslation();
    }, 2500);
    return () => window.clearInterval(timer);
  }, [translationStatus, loadTranslation]);

  function centerInPane(
    container: HTMLDivElement | null,
    node: HTMLSpanElement | null
  ) {
    if (!container || !node) return;
    const a = container.getBoundingClientRect();
    const b = node.getBoundingClientRect();
    scrollBilingualPaneTo(
      container,
      container.scrollTop + b.top - a.top - container.clientHeight / 2 + b.height / 2,
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth"
    );
  }

  function centerSegment(id: string) {
    window.requestAnimationFrame(() => {
      centerInPane(jaScrollRef.current, jaSegmentRefs.current.get(id) ?? null);
      centerInPane(enScrollRef.current, enSegmentRefs.current.get(id) ?? null);
    });
  }

  function alignSegmentToTop(id: string) {
    const align = (
      container: HTMLDivElement | null,
      node: HTMLSpanElement | null
    ) => {
      if (!container || !node) return;
      const containerRect = container.getBoundingClientRect();
      const nodeRect = node.getBoundingClientRect();
      scrollBilingualPaneTo(
        container,
        container.scrollTop + nodeRect.top - containerRect.top,
        "auto"
      );
    };
    align(jaScrollRef.current, jaSegmentRefs.current.get(id) ?? null);
    align(enScrollRef.current, enSegmentRefs.current.get(id) ?? null);
  }

  function handleReadingPositionChange(id: string) {
    readingSegmentIdRef.current = id;
    const index = segments.findIndex((segment) => segment.id === id);
    if (index >= 0) {
      const segment = segments[index];
      setCurrentPositionIndex(index);
      writeReadingHistory({
        seriesId,
        episodeNumber,
        positionIndex: index,
        paragraphIndex: segment?.paragraphIndex,
        sentenceIndex: segment?.sentenceIndex,
        mode: "bilingual",
        sourceLanguage,
        targetLanguage,
      });
    }
  }

  function handleSelectSegment(id: string) {
    readingSegmentIdRef.current = id;
    const index = segments.findIndex((segment) => segment.id === id);
    if (index >= 0) setCurrentPositionIndex(index);
    setSelectedSegmentId(id);
    centerSegment(id);
  }

  function handleSwapLanguages() {
    setUpperPane((current) =>
      current === "source" ? "target" : "source"
    );
    if (selectedSegmentId) centerSegment(selectedSegmentId);
  }

  function handleTargetLanguageChange(
    language: PublicTranslationTargetLanguage
  ) {
    if (targetLanguageLocked || language === targetLanguage) return;
    targetLanguageRef.current = language;
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setTargetLanguage(language);
    clearWordInsight();
  }

  const settingsPortalId = `bilingual-settings-${episodeId}`;

  function handleSettingsOpenChange(open: boolean) {
    if (open) {
      settingsResumeSegmentIdRef.current =
        readingSegmentIdRef.current ??
        selectedSegmentId ??
        segments[currentPositionIndex]?.id ??
        null;
      setSettingsOpen(true);
      return;
    }

    setSettingsOpen(false);
    const resumeId = settingsResumeSegmentIdRef.current;
    window.requestAnimationFrame(() => {
      if (resumeId) alignSegmentToTop(resumeId);
    });
  }

  function handleDisableBilingual() {
    const positionId =
      readingSegmentIdRef.current ?? selectedSegmentId ?? segments[0]?.id ?? null;
    const segmentIndex = positionId
      ? Math.max(0, segments.findIndex((segment) => segment.id === positionId))
      : 0;

    onDisableBilingual(segmentIndex);
  }

  async function handleGenerateTranslation() {
    if (!canGenerate || isGenerating) return;
    await requestTranslationGeneration();
  }

  const safeSeriesTitle = safeText(seriesTitle, dictionary.untitled);
  const safeEpisodeTitle = safeText(
    episodeTitle,
    bilingualDictionary.episodeFallback(episodeNumber)
  );
  const safeAuthorName = safeText(workAuthorName, dictionary.authorUnknown);
  const safeEditorName = safeText(workEditorName, "");
  const sourceLanguageLabel = getSupportedLanguage(sourceLanguage).nativeLabel;
  const targetLanguageLabel = getSupportedLanguage(targetLanguage).nativeLabel;

  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto w-full max-w-4xl px-3 py-4 sm:px-6 sm:py-6">
        <section className="overflow-hidden rounded-[28px] border border-black/10 bg-white shadow-sm">
          <header className="border-b border-black/10 px-4 py-4 sm:px-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs tracking-[0.18em] text-neutral-500">
                  LIB READ BILINGUAL
                </p>
                {workIndexHref ? (
                  <Link
                    href={workIndexHref}
                    aria-label={bilingualDictionary.workIndexAria(safeSeriesTitle)}
                    className="mt-2 inline-flex text-sm text-neutral-600 hover:text-black"
                  >
                    {safeSeriesTitle} · {dictionary.workIndex}
                  </Link>
                ) : (
                  <p className="mt-2 text-sm text-neutral-600">{safeSeriesTitle}</p>
                )}
                <h1 className="mt-1 text-xl font-semibold text-black sm:text-2xl">
                  {safeEpisodeTitle}
                </h1>
                <p className="mt-2 text-xs text-neutral-500">
                  {dictionary.author} {safeAuthorName}
                  {safeEditorName ? ` / ${dictionary.editor} ${safeEditorName}` : ""}
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2">
                <TranslationLanguageSelect
                  value={targetLanguage}
                  sourceLanguage={sourceLanguage}
                  onChange={handleTargetLanguageChange}
                  disabled={targetLanguageLocked}
                />
                {targetLanguageLocked ? (
                  <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs text-neutral-700">
                    {dictionary.languageLockedThisTab}
                  </span>
                ) : null}
                <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-medium text-black">
                  {bilingualDictionary.bilingualOn}
                </span>
                <button
                  type="button"
                  onClick={handleDisableBilingual}
                  className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs text-neutral-700 transition hover:bg-neutral-50"
                >
                  {bilingualDictionary.disableBilingual}
                </button>
              </div>
            </div>
          </header>

          {translationStatus === "ready" && segments.length > 0 ? (
            settingsOpen ? (
              <div
                id={settingsPortalId}
                className="min-h-[30rem] bg-white px-4 py-4 sm:px-6"
              />
            ) : (
            <>
              <BilingualStudyControls
                segments={segments}
                selectedSegmentId={selectedSegmentId}
                onSelectSegment={handleSelectSegment}
                targetLanguage={targetLanguage}
                seriesId={seriesId}
              />
              <div className="border-b border-black/10 bg-white px-4 py-2 text-right text-[11px] text-neutral-500 sm:px-6">
                {dictionary.studyWordHelp} {bilingualDictionary.wordExplanation}{" "}
                {formatAiUsage(aiUsage?.actions.word_explanation)}
                {isAiUsageLimitReached(aiUsage?.actions.word_explanation) &&
                !aiUsage?.isSubscriber ? (
                  <Link
                    href={localizePath("/subscription", locale)}
                    className="ml-2 font-semibold text-sky-700 underline underline-offset-2"
                  >
                    {bilingualDictionary.unlimitedUpgrade}
                  </Link>
                ) : null}
              </div>

              <div
                ref={readerGridRef}
                className="grid h-[calc(100dvh-16rem)] overflow-hidden bg-white"
                style={{
                  height: readerHeight ?? undefined,
                  minHeight: readerHeight === null ? "27rem" : "20rem",
                  maxHeight: readerHeight === null ? "57rem" : "90rem",
                  gridTemplateRows:
                    String(splitRatio) + "fr 44px " + String(100 - splitRatio) + "fr",
                }}
              >
                {upperPane === "source" ? (
                  <BilingualPane
                    side="source"
                    languageLabel={sourceLanguageLabel}
                    languageTag={sourceLanguage}
                    segments={segments}
                    selectedSegmentId={selectedSegmentId}
                    hoveredSegmentId={hoveredSegmentId}
                    scrollRef={jaScrollRef}
                    registerSegmentRef={(id, node) => jaSegmentRefs.current.set(id, node)}
                    onSelectSegment={handleSelectSegment}
                    onHoverSegment={setHoveredSegmentId}
                    onReadingPositionChange={handleReadingPositionChange}
                    wordInsight={wordInsight}
                    displaySettings={displaySettings}
                  />
                ) : (
                  <BilingualPane
                    side="target"
                    languageLabel={targetLanguageLabel}
                    languageTag={targetLanguage}
                    segments={segments}
                    selectedSegmentId={selectedSegmentId}
                    hoveredSegmentId={hoveredSegmentId}
                    scrollRef={enScrollRef}
                    registerSegmentRef={(id, node) => enSegmentRefs.current.set(id, node)}
                    onSelectSegment={handleSelectSegment}
                    onHoverSegment={setHoveredSegmentId}
                    onReadingPositionChange={handleReadingPositionChange}
                    wordInsight={wordInsight}
                    displaySettings={displaySettings}
                  />
                )}

                <BilingualDivider
                  splitRatio={splitRatio}
                  onSplitRatioChange={(ratio) => setSplitRatio(clampRatio(ratio))}
                  onSwapLanguages={handleSwapLanguages}
                />

                {upperPane === "source" ? (
                  <BilingualPane
                    side="target"
                    languageLabel={targetLanguageLabel}
                    languageTag={targetLanguage}
                    segments={segments}
                    selectedSegmentId={selectedSegmentId}
                    hoveredSegmentId={hoveredSegmentId}
                    scrollRef={enScrollRef}
                    registerSegmentRef={(id, node) => enSegmentRefs.current.set(id, node)}
                    onSelectSegment={handleSelectSegment}
                    onHoverSegment={setHoveredSegmentId}
                    onReadingPositionChange={handleReadingPositionChange}
                    onSelectWord={handleSelectWord}
                    wordInsight={wordInsight}
                    displaySettings={displaySettings}
                  />
                ) : (
                  <BilingualPane
                    side="source"
                    languageLabel={sourceLanguageLabel}
                    languageTag={sourceLanguage}
                    segments={segments}
                    selectedSegmentId={selectedSegmentId}
                    hoveredSegmentId={hoveredSegmentId}
                    scrollRef={jaScrollRef}
                    registerSegmentRef={(id, node) => jaSegmentRefs.current.set(id, node)}
                    onSelectSegment={handleSelectSegment}
                    onHoverSegment={setHoveredSegmentId}
                    onReadingPositionChange={handleReadingPositionChange}
                    onSelectWord={handleSelectWord}
                    wordInsight={wordInsight}
                    displaySettings={displaySettings}
                  />
                )}
              </div>

              <BilingualHeightHandle
                readerRef={readerGridRef}
                readerHeight={readerHeight}
                onReaderHeightChange={setReaderHeight}
              />
            </>
            )
          ) : (
            <div className="flex min-h-[30rem] items-center justify-center px-5 py-10">
              <div className="w-full max-w-xl rounded-[28px] border border-black/10 bg-neutral-50 p-6 text-center">
                {translationStatus === "loading" ? (
                  <>
                    <p className="text-lg font-semibold">{dictionary.checkingBilingual}</p>
                    <p className="mt-2 text-sm leading-7 text-neutral-600">
                      {dictionary.translationCheckingHelp}
                    </p>
                  </>
                ) : translationStatus === "translating" ? (
                  <>
                    <p className="text-lg font-semibold">{dictionary.preparingBilingual}</p>
                    <p className="mt-2 text-sm leading-7 text-neutral-600">
                      {dictionary.translationPreparingHelp}
                    </p>
                  </>
                ) : translationStatus === "stale" ? (
                  <>
                    <p className="text-lg font-semibold">{dictionary.translationStale}</p>
                    <p className="mt-2 text-sm leading-7 text-neutral-600">
                      {statusMessage || dictionary.translationStaleHelp}
                    </p>
                  </>
                ) : translationStatus === "failed" ? (
                  <>
                    <p className="text-lg font-semibold">{dictionary.translationFailed}</p>
                    <p className="mt-2 text-sm leading-7 text-neutral-600">
                      {bilingualDictionary.failedHelp}
                    </p>
                  </>
                ) : translationStatus === "error" ? (
                  <>
                    <p className="text-lg font-semibold">{dictionary.translationLoadFailed}</p>
                    <p className="mt-2 text-sm leading-7 text-neutral-600">
                      {statusMessage || bilingualDictionary.errorHelp}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-lg font-semibold">{dictionary.translationMissing}</p>
                    <p className="mt-2 text-sm leading-7 text-neutral-600">
                      {dictionary.translationMissingHelp}
                    </p>
                  </>
                )}

                {canGenerate &&
                (translationStatus === "missing" ||
                  translationStatus === "stale" ||
                  translationStatus === "failed") ? (
                  <button
                    type="button"
                    onClick={() => void handleGenerateTranslation()}
                    disabled={
                      isGenerating ||
                      isAiUsageLimitReached(
                        aiUsage?.actions.translation_generation
                      )
                    }
                    className="mt-5 rounded-full bg-black px-5 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isGenerating
                      ? dictionary.generating
                      : `${translationStatus === "missing" ? dictionary.generateBilingual : dictionary.regenerateBilingual} ${formatAiUsage(aiUsage?.actions.translation_generation)}`}
                  </button>
                ) : null}

                {isAiUsageLimitReached(aiUsage?.actions.translation_generation) &&
                !aiUsage?.isSubscriber ? (
                  <Link
                    href={localizePath("/subscription", locale)}
                    className="mt-4 inline-block text-sm font-semibold text-sky-700 underline underline-offset-4"
                  >
                    {bilingualDictionary.generationUpgrade}
                  </Link>
                ) : null}

                {statusMessage && translationStatus !== "stale" && translationStatus !== "error" ? (
                  <p className="mt-4 text-sm text-red-700">{statusMessage}</p>
                ) : null}
              </div>
            </div>
          )}
        </section>
        <BilingualStoppedFooter
          seriesId={seriesId}
          episodeNumber={episodeNumber}
          positionIndex={(() => {
            const selectedIndex = selectedSegmentId
              ? segments.findIndex((segment) => segment.id === selectedSegmentId)
              : -1;
            return selectedIndex >= 0 ? selectedIndex : currentPositionIndex;
          })()}
          paragraphIndex={(() => {
            const selectedIndex = selectedSegmentId
              ? segments.findIndex((segment) => segment.id === selectedSegmentId)
              : -1;
            return segments[selectedIndex >= 0 ? selectedIndex : currentPositionIndex]?.paragraphIndex;
          })()}
          sentenceIndex={(() => {
            const selectedIndex = selectedSegmentId
              ? segments.findIndex((segment) => segment.id === selectedSegmentId)
              : -1;
            return segments[selectedIndex >= 0 ? selectedIndex : currentPositionIndex]?.sentenceIndex;
          })()}
          sentenceCount={segments.length}
          prevHref={prevEpisodeHref}
          nextHref={nextEpisodeHref}
          upperPane={upperPane}
          narrationUnits={segments.map((segment) =>
            upperPane === "source"
              ? segment.translatedText
              : segment.sourceText
          )}
          narrationLanguage={
            getSupportedLanguage(
              upperPane === "source" ? targetLanguage : sourceLanguage
            ).speechLanguage
          }
          sourceLanguage={sourceLanguage}
          targetLanguage={targetLanguage}
          displaySettings={displaySettings}
          onDisplaySettingsChange={setDisplaySettings}
          onPositionIndexChange={(index, shouldFollow) => {
            const segment = segments[index];
            if (!segment) return;
            readingSegmentIdRef.current = segment.id;
            handleReadingPositionChange(segment.id);
            if (shouldFollow) centerSegment(segment.id);
          }}
          settingsPortalId={settingsPortalId}
          onSettingsOpenChange={handleSettingsOpenChange}
        />
      </div>
    </main>
  );
}
