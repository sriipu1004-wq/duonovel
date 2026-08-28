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
import { useBilingualWordExplanation } from "@/features/playback/useBilingualWordExplanation";
import { PRIVATE_LIBRARY_PROGRESS_EVENT } from "@/features/library/LibraryProgressTracker";
import {
  LANGUAGE_REGISTRY,
  getSupportedLanguage,
  parseSupportedLanguageTag,
  type SupportedLanguageTag,
} from "@/lib/translation/languageRegistry";
import { useAiUsage } from "@/features/usage/useAiUsage";
import { formatAiUsage } from "@/lib/aiUsage/aiUsage";

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
  sourceHash?: string;
  segments?: BilingualSegment[];
  message?: string;
  error?: string;
};

type PrivateLibraryBilingualPlaybackProps = {
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
  initialTargetLanguage: SupportedLanguageTag;
  workIndexHref: string;
  nextChapterId: string | null;
  isSubscriber: boolean;
  autoGenerateMissingTranslation: boolean;
  targetLanguageLocked: boolean;
  onDisableBilingual: (segmentIndex: number) => void;
};

type NextTranslationPrefetchState = {
  sourceChapterId: string;
  targetLanguage: SupportedLanguageTag;
  status: "preparing" | "ready" | "deferred";
};

type BilingualPreference = {
  splitRatio: number;
  upperPane: PaneSide;
  readerHeight: number | null;
  targetLanguage: SupportedLanguageTag;
};

const ALL_LANGUAGES = Object.keys(LANGUAGE_REGISTRY) as SupportedLanguageTag[];
const NEXT_CHAPTER_PREFETCH_READING_THRESHOLD = 0.5;
const NEXT_CHAPTER_PREFETCH_LANGUAGE_STABILITY_MS = 5_000;

function defaultTargetLanguage(
  sourceLanguage: SupportedLanguageTag
): SupportedLanguageTag {
  return sourceLanguage === "ja" ? "en" : "ja";
}

function clampRatio(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return Math.min(80, Math.max(20, value));
}

function readPreference(
  workId: string,
  sourceLanguage: SupportedLanguageTag,
  initialTargetLanguage: SupportedLanguageTag
): BilingualPreference {
  const fallback: BilingualPreference = {
    splitRatio: 50,
    upperPane: "source",
    readerHeight: null,
    targetLanguage:
      initialTargetLanguage !== sourceLanguage
        ? initialTargetLanguage
        : defaultTargetLanguage(sourceLanguage),
  };

  if (typeof window === "undefined") return fallback;

  try {
    const raw = window.localStorage.getItem(
      "duonovel:private-library-bilingual-display:" + workId
    );
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<BilingualPreference>;
    return {
      splitRatio:
        typeof parsed.splitRatio === "number"
          ? clampRatio(parsed.splitRatio)
          : fallback.splitRatio,
      upperPane: parsed.upperPane === "target" ? "target" : "source",
      readerHeight:
        typeof parsed.readerHeight === "number"
          ? clampBilingualReaderHeight(parsed.readerHeight)
          : null,
      targetLanguage: fallback.targetLanguage,
    };
  } catch {
    return fallback;
  }
}

export default function PrivateLibraryBilingualPlayback({
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
  initialTargetLanguage,
  workIndexHref,
  nextChapterId,
  isSubscriber,
  autoGenerateMissingTranslation,
  targetLanguageLocked,
  onDisableBilingual,
}: PrivateLibraryBilingualPlaybackProps) {
  const { snapshot: aiUsage, refresh: refreshAiUsage } = useAiUsage();
  const preference = useMemo(
    () => readPreference(workId, sourceLanguage, initialTargetLanguage),
    [initialTargetLanguage, sourceLanguage, workId]
  );
  const targetLanguages = useMemo(
    () => ALL_LANGUAGES.filter((language) => language !== sourceLanguage),
    [sourceLanguage]
  );
  const [splitRatio, setSplitRatio] = useState(preference.splitRatio);
  const [upperPane, setUpperPane] = useState<PaneSide>(preference.upperPane);
  const [readerHeight, setReaderHeight] = useState<number | null>(
    preference.readerHeight
  );
  const [targetLanguage, setTargetLanguage] =
    useState<SupportedLanguageTag>(preference.targetLanguage);
  const [translationStatus, setTranslationStatus] =
    useState<TranslationStatus>("loading");
  const [segments, setSegments] = useState<BilingualSegment[]>([]);
  const [canGenerate, setCanGenerate] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [sourceHash, setSourceHash] = useState<string | null>(null);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const [hoveredSegmentId, setHoveredSegmentId] = useState<string | null>(null);
  const [prefetchEligibleChapterId, setPrefetchEligibleChapterId] = useState<
    string | null
  >(null);
  const [nextTranslationPrefetch, setNextTranslationPrefetch] =
    useState<NextTranslationPrefetchState | null>(null);

  const sourceScrollRef = useRef<HTMLDivElement | null>(null);
  const targetScrollRef = useRef<HTMLDivElement | null>(null);
  const readerGridRef = useRef<HTMLDivElement | null>(null);
  const sourceSegmentRefs = useRef(new Map<string, HTMLSpanElement | null>());
  const targetSegmentRefs = useRef(new Map<string, HTMLSpanElement | null>());
  const generationInFlightRef = useRef(false);
  const readingSegmentIdRef = useRef<string | null>(null);
  const targetLanguageRef = useRef<SupportedLanguageTag>(preference.targetLanguage);
  const nextPrefetchAttemptRef = useRef<{
    sourceChapterId: string;
    targetLanguage: SupportedLanguageTag;
  } | null>(null);
  const autoGenerationAttemptRef = useRef<string | null>(null);
  const {
    wordInsight,
    clearWordInsight,
    selectWord: handleSelectWord,
  } = useBilingualWordExplanation({
    contentType: "private_library",
    contentId: chapterId,
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
        "duonovel:private-library-bilingual-display:" + workId,
        JSON.stringify({ splitRatio, upperPane, readerHeight, targetLanguage })
      );
    } catch {
      // local display preference persistence is non-critical
    }
  }, [readerHeight, splitRatio, targetLanguage, upperPane, workId]);

  const requestTranslationGeneration = useCallback(async () => {
    if (generationInFlightRef.current) return false;

    generationInFlightRef.current = true;
    setIsGenerating(true);
    setStatusMessage("");

    try {
      const response = await fetch("/api/library/translations/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chapterId,
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
        setStatusMessage(
          `対訳サーバーから正しい応答を受け取れませんでした（${response.status}）。もう一度お試しください。`
        );
        setTranslationStatus("error");
        return false;
      }
      await refreshAiUsage();

      if (targetLanguageRef.current !== targetLanguage) return true;

      if (!response.ok || !payload.ok) {
        setStatusMessage(payload.message || "対訳を生成できませんでした。");
        if (
          payload.error === "translation_openai_failed" ||
          payload.error === "translation_exception" ||
          payload.error === "missing_openai_api_key" ||
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
      setStatusMessage(
        "対訳の通信が中断されました。ページを開いたまま、もう一度お試しください。"
      );
      setTranslationStatus("error");
      return false;
    } finally {
      generationInFlightRef.current = false;
      setIsGenerating(false);
    }
  }, [chapterId, refreshAiUsage, sourceLanguage, targetLanguage]);

  const loadTranslation = useCallback(async () => {
    try {
      const response = await fetch(
        "/api/library/translations/" +
          encodeURIComponent(chapterId) +
          "?sourceLanguage=" +
          encodeURIComponent(sourceLanguage) +
          "&targetLanguage=" +
          encodeURIComponent(targetLanguage),
        { cache: "no-store" }
      );
      const payload = (await response.json()) as TranslationStatusResponse;

      if (targetLanguageRef.current !== targetLanguage) return;

      if (!response.ok || !payload.ok) {
        setTranslationStatus("error");
        setStatusMessage(
          payload.message || "対訳の状態を取得できませんでした。"
        );
        return;
      }

      setCanGenerate(payload.canGenerate === true);
      setSourceHash(payload.sourceHash ?? null);
      const nextStatus = payload.status ?? "missing";

      if (nextStatus === "ready" && Array.isArray(payload.segments)) {
        setTranslationStatus("ready");
        setSegments(payload.segments);
        const firstId = payload.segments[0]?.id ?? null;
        setSelectedSegmentId((current) => current ?? firstId);
        readingSegmentIdRef.current = readingSegmentIdRef.current ?? firstId;
        setStatusMessage("");
        return;
      }

      setSegments([]);

      setTranslationStatus(nextStatus);
      setStatusMessage(payload.message || "");
    } catch {
      if (targetLanguageRef.current !== targetLanguage) return;
      setTranslationStatus("error");
      setStatusMessage("対訳の状態を取得できませんでした。");
    }
  }, [chapterId, sourceLanguage, targetLanguage]);

  useEffect(() => {
    readingSegmentIdRef.current = null;
    setTranslationStatus("loading");
    setSegments([]);
    setSelectedSegmentId(null);
    setHoveredSegmentId(null);
    setSourceHash(null);
    clearWordInsight();
    void loadTranslation();
  }, [chapterId, clearWordInsight, loadTranslation]);

  useEffect(() => {
    const attemptKey = `${chapterId}:${sourceLanguage}:${targetLanguage}`;
    if (
      !autoGenerateMissingTranslation ||
      translationStatus !== "missing" ||
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
    chapterId,
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
  }, [loadTranslation, translationStatus]);

  useEffect(() => {
    if (
      !nextChapterId ||
      !isSubscriber ||
      translationStatus !== "ready" ||
      prefetchEligibleChapterId !== chapterId ||
      nextPrefetchAttemptRef.current?.sourceChapterId === chapterId
    ) {
      return;
    }

    const stableTargetLanguage = targetLanguage;
    const timer = window.setTimeout(() => {
      if (nextPrefetchAttemptRef.current?.sourceChapterId === chapterId) return;

      nextPrefetchAttemptRef.current = {
        sourceChapterId: chapterId,
        targetLanguage: stableTargetLanguage,
      };
      setNextTranslationPrefetch({
        sourceChapterId: chapterId,
        targetLanguage: stableTargetLanguage,
        status: "preparing",
      });

      void (async () => {
        const statusUrl =
          "/api/library/translations/" +
          encodeURIComponent(nextChapterId) +
          "?sourceLanguage=" +
          encodeURIComponent(sourceLanguage) +
          "&targetLanguage=" +
          encodeURIComponent(stableTargetLanguage);

        try {
          const statusResponse = await fetch(statusUrl, { cache: "no-store" });
          const statusPayload =
            (await statusResponse.json()) as TranslationStatusResponse;

          if (!statusResponse.ok || !statusPayload.ok) {
            setNextTranslationPrefetch({
              sourceChapterId: chapterId,
              targetLanguage: stableTargetLanguage,
              status: "deferred",
            });
            return;
          }

          if (statusPayload.status === "ready") {
            setNextTranslationPrefetch({
              sourceChapterId: chapterId,
              targetLanguage: stableTargetLanguage,
              status: "ready",
            });
            return;
          }

          if (statusPayload.status === "translating") return;

          if (
            (statusPayload.status !== "missing" &&
              statusPayload.status !== "stale") ||
            statusPayload.canAutoGenerate !== true
          ) {
            setNextTranslationPrefetch({
              sourceChapterId: chapterId,
              targetLanguage: stableTargetLanguage,
              status: "deferred",
            });
            return;
          }

          const generationResponse = await fetch(
            "/api/library/translations/generate",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chapterId: nextChapterId,
                sourceLanguage,
                targetLanguage: stableTargetLanguage,
                generationPurpose: "prefetch",
              }),
              keepalive: true,
            }
          );
          const generationPayload =
            (await generationResponse.json()) as TranslationStatusResponse;
          await refreshAiUsage();

          if (
            generationResponse.ok &&
            generationPayload.ok &&
            generationPayload.status === "ready"
          ) {
            setNextTranslationPrefetch({
              sourceChapterId: chapterId,
              targetLanguage: stableTargetLanguage,
              status: "ready",
            });
            return;
          }

          if (
            generationResponse.ok &&
            generationPayload.ok &&
            generationPayload.status === "translating"
          ) {
            return;
          }

          setNextTranslationPrefetch({
            sourceChapterId: chapterId,
            targetLanguage: stableTargetLanguage,
            status: "deferred",
          });
        } catch {
          setNextTranslationPrefetch({
            sourceChapterId: chapterId,
            targetLanguage: stableTargetLanguage,
            status: "deferred",
          });
        }
      })();
    }, NEXT_CHAPTER_PREFETCH_LANGUAGE_STABILITY_MS);

    return () => window.clearTimeout(timer);
  }, [
    chapterId,
    nextChapterId,
    isSubscriber,
    prefetchEligibleChapterId,
    refreshAiUsage,
    sourceLanguage,
    targetLanguage,
    translationStatus,
  ]);

  function centerInPane(
    container: HTMLDivElement | null,
    node: HTMLSpanElement | null
  ) {
    if (!container || !node) return;
    const containerRect = container.getBoundingClientRect();
    const nodeRect = node.getBoundingClientRect();
    const target =
      container.scrollTop +
      (nodeRect.top - containerRect.top) -
      container.clientHeight / 2 +
      nodeRect.height / 2;

    container.scrollTo({
      top: Math.max(0, target),
      behavior:
        window.matchMedia("(pointer: coarse)").matches ||
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
    });
  }

  function centerSegment(id: string) {
    window.requestAnimationFrame(() => {
      centerInPane(
        sourceScrollRef.current,
        sourceSegmentRefs.current.get(id) ?? null
      );
      centerInPane(
        targetScrollRef.current,
        targetSegmentRefs.current.get(id) ?? null
      );
    });
  }

  function handleSelectSegment(id: string) {
    readingSegmentIdRef.current = id;
    setSelectedSegmentId(id);
    centerSegment(id);
  }

  function handleReadingPositionChange(id: string) {
    readingSegmentIdRef.current = id;

    const segmentIndex = segments.findIndex((segment) => segment.id === id);
    const progressRatio =
      segmentIndex >= 0 && segments.length > 0
        ? (segmentIndex + 1) / segments.length
        : 0;
    window.dispatchEvent(
      new CustomEvent(PRIVATE_LIBRARY_PROGRESS_EVENT, {
        detail: {
          chapterId,
          progressRatio,
          segmentIndex: segmentIndex >= 0 ? segmentIndex : null,
        },
      })
    );

    if (!isSubscriber || !nextChapterId || prefetchEligibleChapterId === chapterId) return;

    if (
      segmentIndex >= 0 &&
      (segmentIndex + 1) / segments.length >=
        NEXT_CHAPTER_PREFETCH_READING_THRESHOLD
    ) {
      setPrefetchEligibleChapterId(chapterId);
    }
  }

  function handleSwapLanguages() {
    setUpperPane((current) =>
      current === "source" ? "target" : "source"
    );
    if (selectedSegmentId) centerSegment(selectedSegmentId);
  }

  function handleTargetLanguageChange(value: string) {
    if (targetLanguageLocked) return;
    const language = parseSupportedLanguageTag(value);
    if (!language || language === sourceLanguage || language === targetLanguage) {
      return;
    }

    targetLanguageRef.current = language;
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setTargetLanguage(language);
    clearWordInsight();
  }

  function handleDisableBilingual() {
    const positionId =
      readingSegmentIdRef.current ?? selectedSegmentId ?? segments[0]?.id ?? null;
    const segmentIndex = positionId
      ? Math.max(0, segments.findIndex((segment) => segment.id === positionId))
      : 0;
    onDisableBilingual(segmentIndex);
  }

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
                  PRIVATE LIBRARY BILINGUAL
                </p>
                <Link
                  href={workIndexHref}
                  className="mt-2 inline-flex text-sm text-neutral-600 hover:text-black"
                >
                  {workTitle || "無題"}
                </Link>
                <h1 className="mt-1 text-xl font-semibold text-black sm:text-2xl">
                  {chapterTitle || `第${chapterNumber}話`}
                </h1>
                <p className="mt-1 text-[11px] text-neutral-500">
                  第{sectionNumber}話
                  {partCount > 1 ? `・${partNumber}/${partCount}` : ""}
                </p>
                <p className="mt-2 text-xs text-neutral-500">
                  {authorName ? `作者 ${authorName}` : "個人本棚・本人限定"}
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2">
                <label className="flex items-center gap-2 rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs text-neutral-600">
                  <span className="shrink-0">対訳言語</span>
                  <select
                    aria-label="対訳言語"
                    value={targetLanguage}
                    disabled={targetLanguageLocked}
                    onChange={(event) => handleTargetLanguageChange(event.target.value)}
                    className="min-w-0 max-w-28 bg-transparent font-medium text-black outline-none disabled:cursor-not-allowed disabled:opacity-60 sm:max-w-none"
                  >
                    {targetLanguages.map((language) => (
                      <option key={language} value={language}>
                        {getSupportedLanguage(language).nativeLabel}
                      </option>
                    ))}
                  </select>
                </label>
                {targetLanguageLocked ? (
                  <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs text-neutral-700">
                    このタブで言語固定
                  </span>
                ) : null}
                <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-medium text-black">
                  対訳 ON
                </span>
                <button
                  type="button"
                  onClick={handleDisableBilingual}
                  className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs text-neutral-700 transition hover:bg-neutral-50"
                >
                  OFFに戻す
                </button>
              </div>
            </div>
          </header>

          {translationStatus === "ready" && segments.length > 0 ? (
            <>
              <BilingualStudyControls
                segments={segments}
                selectedSegmentId={selectedSegmentId}
                onSelectSegment={handleSelectSegment}
                targetLanguage={targetLanguage}
                seriesId={`private-library:${workId}`}
              />
              <div className="border-b border-black/10 bg-white px-4 py-2 text-right text-[11px] text-neutral-500 sm:px-6">
                文を選択後、語をタップして意味・品詞を確認　単語解説 {formatAiUsage(aiUsage?.actions.word_explanation)}
              </div>

              <div
                ref={readerGridRef}
                className="grid h-[calc(100dvh-16rem)] overflow-hidden bg-white"
                style={{
                  height: readerHeight ?? undefined,
                  minHeight: readerHeight === null ? "27rem" : "20rem",
                  maxHeight: readerHeight === null ? "57rem" : "90rem",
                  gridTemplateRows:
                    `${splitRatio}fr 44px ${100 - splitRatio}fr`,
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
                    scrollRef={sourceScrollRef}
                    registerSegmentRef={(id, node) =>
                      sourceSegmentRefs.current.set(id, node)
                    }
                    onSelectSegment={handleSelectSegment}
                    onHoverSegment={setHoveredSegmentId}
                    onReadingPositionChange={handleReadingPositionChange}
                    onSelectWord={handleSelectWord}
                    wordInsight={wordInsight}
                  />
                ) : (
                  <BilingualPane
                    side="target"
                    languageLabel={targetLanguageLabel}
                    languageTag={targetLanguage}
                    segments={segments}
                    selectedSegmentId={selectedSegmentId}
                    hoveredSegmentId={hoveredSegmentId}
                    scrollRef={targetScrollRef}
                    registerSegmentRef={(id, node) =>
                      targetSegmentRefs.current.set(id, node)
                    }
                    onSelectSegment={handleSelectSegment}
                    onHoverSegment={setHoveredSegmentId}
                    onReadingPositionChange={handleReadingPositionChange}
                    onSelectWord={handleSelectWord}
                    wordInsight={wordInsight}
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
                    scrollRef={targetScrollRef}
                    registerSegmentRef={(id, node) =>
                      targetSegmentRefs.current.set(id, node)
                    }
                    onSelectSegment={handleSelectSegment}
                    onHoverSegment={setHoveredSegmentId}
                    onReadingPositionChange={handleReadingPositionChange}
                    onSelectWord={handleSelectWord}
                    wordInsight={wordInsight}
                  />
                ) : (
                  <BilingualPane
                    side="source"
                    languageLabel={sourceLanguageLabel}
                    languageTag={sourceLanguage}
                    segments={segments}
                    selectedSegmentId={selectedSegmentId}
                    hoveredSegmentId={hoveredSegmentId}
                    scrollRef={sourceScrollRef}
                    registerSegmentRef={(id, node) =>
                      sourceSegmentRefs.current.set(id, node)
                    }
                    onSelectSegment={handleSelectSegment}
                    onHoverSegment={setHoveredSegmentId}
                    onReadingPositionChange={handleReadingPositionChange}
                    onSelectWord={handleSelectWord}
                    wordInsight={wordInsight}
                  />
                )}
              </div>

              <BilingualHeightHandle
                readerRef={readerGridRef}
                readerHeight={readerHeight}
                onReaderHeightChange={setReaderHeight}
              />
            </>
          ) : (
            <div className="flex min-h-[30rem] items-center justify-center px-5 py-10">
              <div className="w-full max-w-xl rounded-[28px] border border-black/10 bg-neutral-50 p-6 text-center">
                {translationStatus === "loading" ? (
                  <>
                    <p className="text-lg font-semibold">対訳を確認中</p>
                    <p className="mt-2 text-sm leading-7 text-neutral-600">
                      この話の保存済み翻訳を確認しています。
                    </p>
                  </>
                ) : translationStatus === "translating" ? (
                  <>
                    <p className="text-lg font-semibold">対訳を準備中</p>
                    <p className="mt-2 text-sm leading-7 text-neutral-600">
                      今開いている話だけを生成し、完成後は同じ言語の翻訳を再利用します。
                    </p>
                  </>
                ) : translationStatus === "failed" ? (
                  <>
                    <p className="text-lg font-semibold">対訳を表示できません</p>
                    <p className="mt-2 text-sm leading-7 text-neutral-600">
                      {statusMessage || "前回の生成が完了していません。"}
                    </p>
                  </>
                ) : translationStatus === "error" ? (
                  <>
                    <p className="text-lg font-semibold">対訳を読み込めません</p>
                    <p className="mt-2 text-sm leading-7 text-neutral-600">
                      {statusMessage || "翻訳データ基盤を確認してください。"}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-lg font-semibold">
                      {translationStatus === "missing"
                        ? "この言語の対訳は未生成です"
                        : "原文が更新されています"}
                    </p>
                    <p className="mt-2 text-sm leading-7 text-neutral-600">
                      {statusMessage || "必要な場合だけ対訳を生成します。"}
                    </p>
                  </>
                )}

                {canGenerate &&
                (translationStatus === "missing" ||
                  translationStatus === "stale" ||
                  translationStatus === "failed") ? (
                  <button
                    type="button"
                    onClick={() => void requestTranslationGeneration()}
                    disabled={
                      isGenerating ||
                      (aiUsage?.actions.translation_generation.limit !== undefined &&
                        aiUsage.actions.translation_generation.used >=
                          aiUsage.actions.translation_generation.limit)
                    }
                    className="mt-5 rounded-full bg-black px-5 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isGenerating
                      ? "生成中…"
                      : translationStatus === "missing"
                        ? `対訳を生成 ${formatAiUsage(aiUsage?.actions.translation_generation)}`
                        : `対訳を再生成 ${formatAiUsage(aiUsage?.actions.translation_generation)}`}
                  </button>
                ) : null}

                {statusMessage && translationStatus !== "error" ? (
                  <p className="mt-4 text-sm text-neutral-600">{statusMessage}</p>
                ) : null}
              </div>
            </div>
          )}
        </section>
        <BilingualStoppedFooter
          currentIndex={Math.max(
            0,
            segments.findIndex((segment) => segment.id === selectedSegmentId)
          )}
          total={segments.length}
        >
          <div className="mt-2 text-xs text-neutral-500">
            {nextTranslationPrefetch?.sourceChapterId === chapterId ? (
              <span className="mt-1 block">
                {nextTranslationPrefetch.status === "ready"
                  ? `次話の${getSupportedLanguage(nextTranslationPrefetch.targetLanguage).nativeLabel}対訳 準備済み`
                  : nextTranslationPrefetch.status === "preparing"
                    ? `次話の${getSupportedLanguage(nextTranslationPrefetch.targetLanguage).nativeLabel}対訳を準備中…`
                    : "次話の対訳は移動後に準備します"}
              </span>
            ) : null}
            {!isSubscriber && nextChapterId ? (
              <span className="mt-1 block">50%次話先読みはサブスク限定</span>
            ) : null}
          </div>
        </BilingualStoppedFooter>
      </div>
    </main>
  );
}
