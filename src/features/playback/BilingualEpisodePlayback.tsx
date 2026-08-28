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
import { readReadingBookmark } from "@/lib/playback/readingBookmark";

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
  const { snapshot: aiUsage, refresh: refreshAiUsage } = useAiUsage();
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
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [sourceHash, setSourceHash] = useState<string | null>(null);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const [hoveredSegmentId, setHoveredSegmentId] = useState<string | null>(null);
  const [currentPositionIndex, setCurrentPositionIndex] = useState(0);

  const jaScrollRef = useRef<HTMLDivElement | null>(null);
  const enScrollRef = useRef<HTMLDivElement | null>(null);
  const readerGridRef = useRef<HTMLDivElement | null>(null);
  const jaSegmentRefs = useRef(new Map<string, HTMLSpanElement | null>());
  const enSegmentRefs = useRef(new Map<string, HTMLSpanElement | null>());
  const generationInFlightRef = useRef(false);
  const readingSegmentIdRef = useRef<string | null>(null);
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
    const restoreKey = `${episodeNumber}:${sourceHash ?? "ready"}`;
    if (restoredBookmarkKeyRef.current === restoreKey) return;
    restoredBookmarkKeyRef.current = restoreKey;
    const bookmark = readReadingBookmark(seriesId);
    if (!bookmark || bookmark.episodeNumber !== episodeNumber) return;
    const index = Math.min(bookmark.positionIndex, segments.length - 1);
    const id = segments[index]?.id;
    if (!id) return;
    readingSegmentIdRef.current = id;
    setCurrentPositionIndex(index);
    setSelectedSegmentId(id);
    window.requestAnimationFrame(() => alignSegmentToTop(id));
  }, [episodeNumber, segments, seriesId, sourceHash, translationStatus]);

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
      setStatusMessage(
        "対訳の通信が中断されました。ページを開いたまま、もう一度お試しください。"
      );
      setTranslationStatus("error");
      return false;
    } finally {
      generationInFlightRef.current = false;
      setIsGenerating(false);
    }
  }, [episodeId, refreshAiUsage, sourceLanguage, targetLanguage]);

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
        const firstId = payload.segments?.[0]?.id ?? null;
        setSelectedSegmentId((current) => current ?? firstId);
        readingSegmentIdRef.current = readingSegmentIdRef.current ?? firstId;
        setStatusMessage("");
        return;
      }

      setSegments([]);

      setTranslationStatus(nextStatus);
      setStatusMessage(
        payload.message ||
          (nextStatus === "stale"
            ? "原文が更新されたため、対訳を再生成します。"
            : "")
      );
    } catch {
      if (targetLanguageRef.current !== targetLanguage) return;
      setTranslationStatus("error");
      setStatusMessage("対訳の状態を取得できませんでした。");
    }
  }, [episodeId, sourceLanguage, targetLanguage]);

  useEffect(() => {
    readingSegmentIdRef.current = null;
    setTranslationStatus("loading");
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
      container.scrollTo({
        top: Math.max(0, container.scrollTop + nodeRect.top - containerRect.top),
        behavior: "auto",
      });
    };
    align(jaScrollRef.current, jaSegmentRefs.current.get(id) ?? null);
    align(enScrollRef.current, enSegmentRefs.current.get(id) ?? null);
  }

  function handleReadingPositionChange(id: string) {
    readingSegmentIdRef.current = id;
    const index = segments.findIndex((segment) => segment.id === id);
    if (index >= 0) setCurrentPositionIndex(index);
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

  const safeSeriesTitle = safeText(seriesTitle, "無題");
  const safeEpisodeTitle = safeText(episodeTitle, "第" + String(episodeNumber) + "話");
  const safeAuthorName = safeText(workAuthorName, "作者名未設定");
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
                    aria-label={`${safeSeriesTitle}の作品ページ（目次）へ`}
                    className="mt-2 inline-flex text-sm text-neutral-600 hover:text-black"
                  >
                    {safeSeriesTitle} · 作品ページ（目次）
                  </Link>
                ) : (
                  <p className="mt-2 text-sm text-neutral-600">{safeSeriesTitle}</p>
                )}
                <h1 className="mt-1 text-xl font-semibold text-black sm:text-2xl">
                  {safeEpisodeTitle}
                </h1>
                <p className="mt-2 text-xs text-neutral-500">
                  作者 {safeAuthorName}
                  {safeEditorName ? " / 編集 " + safeEditorName : ""}
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
                seriesId={seriesId}
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
                    scrollRef={enScrollRef}
                    registerSegmentRef={(id, node) => enSegmentRefs.current.set(id, node)}
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
                    scrollRef={enScrollRef}
                    registerSegmentRef={(id, node) => enSegmentRefs.current.set(id, node)}
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
                    scrollRef={jaScrollRef}
                    registerSegmentRef={(id, node) => jaSegmentRefs.current.set(id, node)}
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
                      保存済みの翻訳があるか確認しています。
                    </p>
                  </>
                ) : translationStatus === "translating" ? (
                  <>
                    <p className="text-lg font-semibold">対訳を準備中</p>
                    <p className="mt-2 text-sm leading-7 text-neutral-600">
                      投稿時または過去作品の初回利用時に一度だけ生成し、完成後は同じ翻訳を再利用します。
                    </p>
                  </>
                ) : translationStatus === "stale" ? (
                  <>
                    <p className="text-lg font-semibold">原文が更新されています</p>
                    <p className="mt-2 text-sm leading-7 text-neutral-600">
                      {statusMessage || "必要な場合は対訳を再生成してください。"}
                    </p>
                  </>
                ) : translationStatus === "failed" ? (
                  <>
                    <p className="text-lg font-semibold">対訳を表示できません</p>
                    <p className="mt-2 text-sm leading-7 text-neutral-600">
                      前回の生成が完了していません。再生成は管理用アカウントから行います。
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
                    <p className="text-lg font-semibold">この言語の対訳は未生成です</p>
                    <p className="mt-2 text-sm leading-7 text-neutral-600">
                      必要な場合だけ対訳を生成します。
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
                      ? "生成中…"
                      : `${translationStatus === "missing" ? "対訳を生成" : "対訳を再生成"} ${formatAiUsage(aiUsage?.actions.translation_generation)}`}
                  </button>
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
          positionIndex={currentPositionIndex}
          prevHref={prevEpisodeHref}
          nextHref={nextEpisodeHref}
          splitRatio={splitRatio}
          upperPane={upperPane}
          readerHeight={readerHeight}
          onSplitRatioChange={setSplitRatio}
          onSwapLanguages={handleSwapLanguages}
          onResetReaderHeight={() => setReaderHeight(null)}
        />
      </div>
    </main>
  );
}
