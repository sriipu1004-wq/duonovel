"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BilingualDivider from "@/features/playback/BilingualDivider";
import BilingualPane, {
  type BilingualSegment,
} from "@/features/playback/BilingualPane";
import BilingualStudyControls from "@/features/playback/BilingualStudyControls";

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
  onDisableBilingual: (segmentIndex: number) => void;
};

type BilingualPreference = {
  splitRatio: number;
  upperLanguage: "ja" | "en";
};

const DEFAULT_PREFERENCE: BilingualPreference = {
  splitRatio: 50,
  upperLanguage: "ja",
};

function clampRatio(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return Math.min(80, Math.max(20, value));
}

function readPreference(seriesId: string): BilingualPreference {
  if (typeof window === "undefined") return DEFAULT_PREFERENCE;

  try {
    const raw = window.localStorage.getItem("duonovel:bilingual-display:" + seriesId);
    if (!raw) return DEFAULT_PREFERENCE;
    const parsed = JSON.parse(raw) as Partial<BilingualPreference>;
    return {
      splitRatio:
        typeof parsed.splitRatio === "number"
          ? clampRatio(parsed.splitRatio)
          : DEFAULT_PREFERENCE.splitRatio,
      upperLanguage:
        parsed.upperLanguage === "en" ? "en" : DEFAULT_PREFERENCE.upperLanguage,
    };
  } catch {
    return DEFAULT_PREFERENCE;
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
  onDisableBilingual,
}: BilingualEpisodePlaybackProps) {
  const preference = useMemo(() => readPreference(seriesId), [seriesId]);
  const [splitRatio, setSplitRatio] = useState(preference.splitRatio);
  const [upperLanguage, setUpperLanguage] = useState<"ja" | "en">(
    preference.upperLanguage
  );
  const [translationStatus, setTranslationStatus] =
    useState<TranslationStatus>("loading");
  const [segments, setSegments] = useState<BilingualSegment[]>([]);
  const [canGenerate, setCanGenerate] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const [hoveredSegmentId, setHoveredSegmentId] = useState<string | null>(null);

  const jaScrollRef = useRef<HTMLDivElement | null>(null);
  const enScrollRef = useRef<HTMLDivElement | null>(null);
  const jaSegmentRefs = useRef(new Map<string, HTMLSpanElement | null>());
  const enSegmentRefs = useRef(new Map<string, HTMLSpanElement | null>());
  const autoGenerationAttemptRef = useRef<string | null>(null);
  const generationInFlightRef = useRef(false);
  const readingSegmentIdRef = useRef<string | null>(null);

  useEffect(() => {
    setSplitRatio(preference.splitRatio);
    setUpperLanguage(preference.upperLanguage);
  }, [preference]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        "duonovel:bilingual-display:" + seriesId,
        JSON.stringify({ splitRatio, upperLanguage })
      );
    } catch {
      // local preference persistence is non-critical
    }
  }, [seriesId, splitRatio, upperLanguage]);

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
          targetLanguage: "en",
        }),
      });
      const payload = (await response.json()) as TranslationStatusResponse;

      if (!response.ok || !payload.ok) {
        setStatusMessage(payload.message || "英語対訳を生成できませんでした。");

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
      setStatusMessage("英語対訳を生成できませんでした。");
      setTranslationStatus("error");
      return false;
    } finally {
      generationInFlightRef.current = false;
      setIsGenerating(false);
    }
  }, [episodeId]);

  const loadTranslation = useCallback(async () => {
    try {
      const response = await fetch(
        "/api/episode-translations/" + encodeURIComponent(episodeId),
        { cache: "no-store" }
      );
      const payload = (await response.json()) as TranslationStatusResponse;

      if (!response.ok || !payload.ok) {
        setTranslationStatus("error");
        setStatusMessage(
          payload.message || "英語対訳の状態を取得できませんでした。"
        );
        return;
      }

      setCanGenerate(payload.canGenerate === true);
      const nextStatus = payload.status ?? "missing";

      if (nextStatus === "ready" && Array.isArray(payload.segments)) {
        autoGenerationAttemptRef.current = null;
        setTranslationStatus("ready");
        setSegments(payload.segments);
        const firstId = payload.segments?.[0]?.id ?? null;
        setSelectedSegmentId((current) => current ?? firstId);
        readingSegmentIdRef.current = readingSegmentIdRef.current ?? firstId;
        setStatusMessage("");
        return;
      }

      setSegments([]);

      if (
        (nextStatus === "missing" || nextStatus === "stale") &&
        payload.canAutoGenerate === true
      ) {
        const attemptKey = episodeId + ":" + (payload.sourceHash || nextStatus);

        if (generationInFlightRef.current) {
          setTranslationStatus("translating");
          return;
        }

        if (autoGenerationAttemptRef.current !== attemptKey) {
          autoGenerationAttemptRef.current = attemptKey;
          setTranslationStatus("translating");
          setStatusMessage(
            nextStatus === "stale"
              ? "原文が更新されたため、英語対訳を更新しています。"
              : "過去作品の対訳を初回だけ準備しています。"
          );
          void requestTranslationGeneration();
          return;
        }
      }

      setTranslationStatus(nextStatus);
      setStatusMessage(
        payload.message ||
          (nextStatus === "stale"
            ? "原文が更新されたため、英語対訳を再生成します。"
            : "")
      );
    } catch {
      setTranslationStatus("error");
      setStatusMessage("英語対訳の状態を取得できませんでした。");
    }
  }, [episodeId, requestTranslationGeneration]);

  useEffect(() => {
    autoGenerationAttemptRef.current = null;
    readingSegmentIdRef.current = null;
    setTranslationStatus("loading");
    setSegments([]);
    setSelectedSegmentId(null);
    setHoveredSegmentId(null);
    void loadTranslation();
  }, [episodeId, loadTranslation]);

  useEffect(() => {
    if (translationStatus !== "translating") return;
    const timer = window.setTimeout(() => {
      void loadTranslation();
    }, 2500);
    return () => window.clearTimeout(timer);
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
      behavior: "smooth",
    });
  }

  function centerSegment(id: string) {
    window.requestAnimationFrame(() => {
      centerInPane(jaScrollRef.current, jaSegmentRefs.current.get(id) ?? null);
      centerInPane(enScrollRef.current, enSegmentRefs.current.get(id) ?? null);
    });
  }

  function handleReadingPositionChange(id: string) {
    readingSegmentIdRef.current = id;
  }

  function handleSelectSegment(id: string) {
    readingSegmentIdRef.current = id;
    setSelectedSegmentId(id);
    centerSegment(id);
  }

  function handleSwapLanguages() {
    setUpperLanguage((current) => (current === "ja" ? "en" : "ja"));
    if (selectedSegmentId) centerSegment(selectedSegmentId);
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

  return (
    <main className="min-h-screen bg-white pb-24 text-black">
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
                    className="mt-2 inline-flex text-sm text-neutral-600 hover:text-black"
                  >
                    {safeSeriesTitle}
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

              <div className="flex items-center gap-2">
                <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-medium text-black">
                  英語対訳 ON
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
              />

              <div
                className="grid h-[calc(100dvh-16rem)] min-h-[27rem] max-h-[57rem] overflow-hidden bg-white"
                style={{
                  gridTemplateRows:
                    String(splitRatio) + "fr 44px " + String(100 - splitRatio) + "fr",
                }}
              >
                {upperLanguage === "ja" ? (
                  <BilingualPane
                    language="ja"
                    segments={segments}
                    selectedSegmentId={selectedSegmentId}
                    hoveredSegmentId={hoveredSegmentId}
                    scrollRef={jaScrollRef}
                    registerSegmentRef={(id, node) => jaSegmentRefs.current.set(id, node)}
                    onSelectSegment={handleSelectSegment}
                    onHoverSegment={setHoveredSegmentId}
                    onReadingPositionChange={handleReadingPositionChange}
                  />
                ) : (
                  <BilingualPane
                    language="en"
                    segments={segments}
                    selectedSegmentId={selectedSegmentId}
                    hoveredSegmentId={hoveredSegmentId}
                    scrollRef={enScrollRef}
                    registerSegmentRef={(id, node) => enSegmentRefs.current.set(id, node)}
                    onSelectSegment={handleSelectSegment}
                    onHoverSegment={setHoveredSegmentId}
                    onReadingPositionChange={handleReadingPositionChange}
                  />
                )}

                <BilingualDivider
                  splitRatio={splitRatio}
                  onSplitRatioChange={(ratio) => setSplitRatio(clampRatio(ratio))}
                  onSwapLanguages={handleSwapLanguages}
                />

                {upperLanguage === "ja" ? (
                  <BilingualPane
                    language="en"
                    segments={segments}
                    selectedSegmentId={selectedSegmentId}
                    hoveredSegmentId={hoveredSegmentId}
                    scrollRef={enScrollRef}
                    registerSegmentRef={(id, node) => enSegmentRefs.current.set(id, node)}
                    onSelectSegment={handleSelectSegment}
                    onHoverSegment={setHoveredSegmentId}
                    onReadingPositionChange={handleReadingPositionChange}
                  />
                ) : (
                  <BilingualPane
                    language="ja"
                    segments={segments}
                    selectedSegmentId={selectedSegmentId}
                    hoveredSegmentId={hoveredSegmentId}
                    scrollRef={jaScrollRef}
                    registerSegmentRef={(id, node) => jaSegmentRefs.current.set(id, node)}
                    onSelectSegment={handleSelectSegment}
                    onHoverSegment={setHoveredSegmentId}
                    onReadingPositionChange={handleReadingPositionChange}
                  />
                )}
              </div>
            </>
          ) : (
            <div className="flex min-h-[30rem] items-center justify-center px-5 py-10">
              <div className="w-full max-w-xl rounded-[28px] border border-black/10 bg-neutral-50 p-6 text-center">
                {translationStatus === "loading" ? (
                  <>
                    <p className="text-lg font-semibold">英語対訳を確認中</p>
                    <p className="mt-2 text-sm leading-7 text-neutral-600">
                      保存済みの翻訳があるか確認しています。
                    </p>
                  </>
                ) : translationStatus === "translating" ? (
                  <>
                    <p className="text-lg font-semibold">英語対訳を準備中</p>
                    <p className="mt-2 text-sm leading-7 text-neutral-600">
                      投稿時または過去作品の初回利用時に一度だけ生成し、完成後は同じ翻訳を再利用します。
                    </p>
                  </>
                ) : translationStatus === "stale" ? (
                  <>
                    <p className="text-lg font-semibold">原文が更新されています</p>
                    <p className="mt-2 text-sm leading-7 text-neutral-600">
                      {statusMessage || "英語対訳を更新しています。"}
                    </p>
                  </>
                ) : translationStatus === "failed" ? (
                  <>
                    <p className="text-lg font-semibold">英語対訳を表示できません</p>
                    <p className="mt-2 text-sm leading-7 text-neutral-600">
                      前回の生成が完了していません。再生成は管理用アカウントから行います。
                    </p>
                  </>
                ) : translationStatus === "error" ? (
                  <>
                    <p className="text-lg font-semibold">英語対訳を読み込めません</p>
                    <p className="mt-2 text-sm leading-7 text-neutral-600">
                      {statusMessage || "翻訳データ基盤を確認してください。"}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-lg font-semibold">英語対訳を準備できません</p>
                    <p className="mt-2 text-sm leading-7 text-neutral-600">
                      この作品では現在、自動生成を開始できません。
                    </p>
                  </>
                )}

                {canGenerate && translationStatus === "failed" ? (
                  <button
                    type="button"
                    onClick={() => void handleGenerateTranslation()}
                    disabled={isGenerating}
                    className="mt-5 rounded-full bg-black px-5 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isGenerating ? "再生成中…" : "英語対訳を再生成"}
                  </button>
                ) : null}

                {statusMessage && translationStatus !== "stale" && translationStatus !== "error" ? (
                  <p className="mt-4 text-sm text-red-700">{statusMessage}</p>
                ) : null}
              </div>
            </div>
          )}
        </section>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-black/10 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="min-w-0 text-xs text-neutral-500">
            <span className="font-medium text-neutral-700">英語対訳</span>
            <span className="ml-2">文同期・単語確認・1文再生</span>
          </div>
          <button
            type="button"
            onClick={handleDisableBilingual}
            className="shrink-0 rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-neutral-700 transition hover:bg-neutral-50"
          >
            日本語表示に戻る
          </button>
        </div>
      </div>
    </main>
  );
}
