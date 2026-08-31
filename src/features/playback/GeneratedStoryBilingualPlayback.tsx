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
import { readReadingBookmark } from "@/lib/playback/readingBookmark";

type GeneratedStoryPayload = {
  id: string;
  createdAt: string;
  request: {
    scene?: string;
    timeMinutes?: number;
    genre?: string;
    mood?: string;
  };
  story: {
    title: string;
    synopsis?: string;
    body: string;
    estimatedReadingMinutes?: number;
    tags?: string[];
  };
};

type SavedGeneratedStoryPayload = GeneratedStoryPayload & {
  savedSeriesId?: string;
  savedEpisodeId?: string;
  readHref?: string;
};

type TranslationResponse = {
  ok?: boolean;
  status?: "ready" | "translating" | "missing";
  sourceHash?: string;
  segments?: BilingualSegment[];
  message?: string;
  error?: string;
};

type BilingualPreference = {
  splitRatio: number;
  upperPane: PaneSide;
  readerHeight: number | null;
  targetLanguage: PublicTranslationTargetLanguage;
};

const SAVED_STORIES_KEY = "libread.savedGeneratedStories.v1";
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

function readSavedStory(storyId: string): SavedGeneratedStoryPayload | null {
  const raw = window.localStorage.getItem(SAVED_STORIES_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as SavedGeneratedStoryPayload[];
    return Array.isArray(parsed)
      ? parsed.find((item) => item?.id === storyId) ?? null
      : null;
  } catch {
    return null;
  }
}

function readGeneratedStory(storyId: string): SavedGeneratedStoryPayload | null {
  const saved = readSavedStory(storyId);
  const sessionRaw = window.sessionStorage.getItem(
    `libread.generatedStory.${storyId}`
  );

  if (sessionRaw) {
    try {
      const parsed = JSON.parse(sessionRaw) as GeneratedStoryPayload;
      if (parsed?.id && parsed?.story?.title && parsed?.story?.body) {
        return {
          ...parsed,
          savedSeriesId: saved?.savedSeriesId,
          savedEpisodeId: saved?.savedEpisodeId,
          readHref: saved?.readHref,
        };
      }
    } catch {
      // Fall through to local saved data.
    }
  }

  return saved;
}

function readPreference(
  storyId: string,
  initialTargetLanguage: PublicTranslationTargetLanguage
): BilingualPreference {
  const fallback = { ...DEFAULT_PREFERENCE, targetLanguage: initialTargetLanguage };
  try {
    const raw =
      window.localStorage.getItem("duonovel:bilingual-display") ??
      window.localStorage.getItem(
        `duonovel:bilingual-display:generated:${storyId}`
      );
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

export default function GeneratedStoryBilingualPlayback({
  storyId,
  sourceLanguage,
  initialTargetLanguage,
  autoGenerateMissingTranslation,
  targetLanguageLocked,
}: {
  storyId: string;
  sourceLanguage: SupportedLanguageTag;
  initialTargetLanguage: PublicTranslationTargetLanguage;
  autoGenerateMissingTranslation: boolean;
  targetLanguageLocked: boolean;
}) {
  const { snapshot: aiUsage, refresh: refreshAiUsage } = useAiUsage();
  const { displaySettings, setDisplaySettings } =
    useReaderDisplaySettings(`generated:${storyId}`);
  const [story, setStory] = useState<SavedGeneratedStoryPayload | null>(null);
  const preference = useMemo(
    () =>
      typeof window === "undefined"
        ? { ...DEFAULT_PREFERENCE, targetLanguage: initialTargetLanguage }
        : readPreference(storyId, initialTargetLanguage),
    [initialTargetLanguage, storyId]
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
  const [status, setStatus] = useState<"loading" | "missing" | "translating" | "ready" | "error">(
    "loading"
  );
  const [segments, setSegments] = useState<BilingualSegment[]>([]);
  const [message, setMessage] = useState("");
  const [sourceHash, setSourceHash] = useState<string | null>(null);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const [hoveredSegmentId, setHoveredSegmentId] = useState<string | null>(null);
  const [currentPositionIndex, setCurrentPositionIndex] = useState(0);

  const jaScrollRef = useRef<HTMLDivElement | null>(null);
  const enScrollRef = useRef<HTMLDivElement | null>(null);
  const readerGridRef = useRef<HTMLDivElement | null>(null);
  const jaSegmentRefs = useRef(new Map<string, HTMLSpanElement | null>());
  const enSegmentRefs = useRef(new Map<string, HTMLSpanElement | null>());
  const readingSegmentIdRef = useRef<string | null>(null);
  const requestInFlightRef = useRef(false);
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
    contentType: "generated_story",
    contentId: storyId,
    sourceHash,
    sourceLanguage,
    targetLanguage,
    refreshAiUsage,
  });

  useEffect(() => {
    const generated = readGeneratedStory(storyId);
    setStory(generated);
    setHoveredSegmentId(null);
    if (!generated) {
      setStatus("error");
      setMessage("生成した物語の一時データを読み込めませんでした。");
    }
  }, [storyId]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        "duonovel:bilingual-display",
        JSON.stringify({ splitRatio, upperPane, readerHeight, targetLanguage })
      );
    } catch {
      // Local preference persistence is non-critical.
    }
  }, [readerHeight, storyId, splitRatio, targetLanguage, upperPane]);

  useEffect(() => {
    if (status !== "ready" || segments.length === 0) return;
    const restoreKey = `${storyId}:${sourceHash ?? "ready"}`;
    if (restoredBookmarkKeyRef.current === restoreKey) return;
    restoredBookmarkKeyRef.current = restoreKey;
    const bookmark = readReadingBookmark(`generated:${storyId}`);
    if (!bookmark || bookmark.episodeNumber !== 1) return;
    const index = Math.min(bookmark.positionIndex, segments.length - 1);
    const id = segments[index]?.id;
    if (!id) return;
    readingSegmentIdRef.current = id;
    setCurrentPositionIndex(index);
    setSelectedSegmentId(id);
    window.requestAnimationFrame(() => alignSegmentToTop(id));
  }, [segments, sourceHash, status, storyId]);

  const requestTranslation = useCallback(async () => {
    if (!story || requestInFlightRef.current) return;

    requestInFlightRef.current = true;
    setMessage("");

    try {
      const response = await fetch("/api/generated-story-translations/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storyId: story.id,
          title: story.story.title,
          body: story.story.body,
          sourceLanguage,
          targetLanguage,
        }),
      });
      const responseText = await response.text();
      let payload: TranslationResponse;

      try {
        payload = JSON.parse(responseText) as TranslationResponse;
      } catch {
        if (targetLanguageRef.current !== targetLanguage) return;
        setStatus("error");
        setMessage(
          `対訳サーバーから正しい応答を受け取れませんでした（${response.status}）。もう一度お試しください。`
        );
        return;
      }
      await refreshAiUsage();

      if (targetLanguageRef.current !== targetLanguage) return;

      if (!response.ok || !payload.ok) {
        setStatus("error");
        setMessage(payload.message || "対訳を生成できませんでした。");
        return;
      }

      setSourceHash(payload.sourceHash ?? null);

      if (payload.status === "ready" && Array.isArray(payload.segments)) {
        setSegments(payload.segments);
        const firstId = payload.segments[0]?.id ?? null;
        setSelectedSegmentId((current) => current ?? firstId);
        readingSegmentIdRef.current = readingSegmentIdRef.current ?? firstId;
        setStatus("ready");
        return;
      }

      setStatus("translating");
    } catch {
      if (targetLanguageRef.current !== targetLanguage) return;
      setStatus("error");
      setMessage(
        "対訳の通信が中断されました。ページを開いたまま、もう一度お試しください。"
      );
    } finally {
      requestInFlightRef.current = false;
    }
  }, [refreshAiUsage, sourceLanguage, story, targetLanguage]);

  const checkTranslation = useCallback(async () => {
    if (!story) return;
    try {
      const response = await fetch("/api/generated-story-translations/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storyId: story.id,
          title: story.story.title,
          body: story.story.body,
          sourceLanguage,
          targetLanguage,
          checkOnly: true,
        }),
      });
      const payload = (await response.json()) as TranslationResponse;
      if (targetLanguageRef.current !== targetLanguage) return;
      setSourceHash(payload.sourceHash ?? null);
      if (!response.ok || !payload.ok) {
        setStatus("error");
        setMessage(payload.message || "対訳の状態を確認できませんでした。");
      } else if (payload.status === "ready" && Array.isArray(payload.segments)) {
        setSegments(payload.segments);
        const firstId = payload.segments[0]?.id ?? null;
        setSelectedSegmentId((current) => current ?? firstId);
        readingSegmentIdRef.current = readingSegmentIdRef.current ?? firstId;
        setStatus("ready");
      } else {
        setStatus(payload.status === "translating" ? "translating" : "missing");
      }
    } catch {
      setStatus("error");
      setMessage("対訳の状態を確認できませんでした。");
    }
  }, [sourceLanguage, story, targetLanguage]);

  useEffect(() => {
    if (!story) return;
    setMessage("");
    setSegments([]);
    setSelectedSegmentId(null);
    setHoveredSegmentId(null);
    setSourceHash(null);
    clearWordInsight();
    readingSegmentIdRef.current = null;
    setStatus("loading");
    void checkTranslation();
  }, [checkTranslation, clearWordInsight, story, targetLanguage]);

  useEffect(() => {
    const attemptKey = `${storyId}:${sourceLanguage}:${targetLanguage}`;
    if (
      !autoGenerateMissingTranslation ||
      status !== "missing" ||
      !story ||
      autoGenerationAttemptRef.current === attemptKey
    ) {
      return;
    }
    autoGenerationAttemptRef.current = attemptKey;
    setStatus("translating");
    void requestTranslation();
  }, [
    autoGenerateMissingTranslation,
    requestTranslation,
    sourceLanguage,
    status,
    story,
    storyId,
    targetLanguage,
  ]);

  useEffect(() => {
    if (status !== "translating") return;
    const timer = window.setInterval(() => {
      void checkTranslation();
    }, 2500);
    return () => window.clearInterval(timer);
  }, [checkTranslation, status]);

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

  function handleSelectSegment(id: string) {
    readingSegmentIdRef.current = id;
    const index = segments.findIndex((segment) => segment.id === id);
    if (index >= 0) setCurrentPositionIndex(index);
    setSelectedSegmentId(id);
    centerSegment(id);
  }

  function handleReadingPositionChange(id: string) {
    readingSegmentIdRef.current = id;
    const index = segments.findIndex((segment) => segment.id === id);
    if (index >= 0) setCurrentPositionIndex(index);
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
    const currentId =
      readingSegmentIdRef.current ?? selectedSegmentId ?? segments[0]?.id ?? null;
    const segmentIndex = currentId
      ? Math.max(0, segments.findIndex((segment) => segment.id === currentId))
      : 0;

    try {
      window.sessionStorage.setItem(
        `libread.generatedStoryResume.${storyId}`,
        String(segmentIndex)
      );
    } catch {
      // Position restore is best effort.
    }

    window.location.assign(`/read/generated/${encodeURIComponent(storyId)}`);
  }

  const sourceLanguageLabel = getSupportedLanguage(sourceLanguage).nativeLabel;
  const targetLanguageLabel = getSupportedLanguage(targetLanguage).nativeLabel;

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
                <p className="mt-2 text-sm text-neutral-600">AI生成短編</p>
                <h1 className="mt-1 text-xl font-semibold text-black sm:text-2xl">
                  {story?.story.title || "生成した物語"}
                </h1>
                <p className="mt-2 text-xs text-neutral-500">作者 AI生成</p>
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

          {status === "ready" && segments.length > 0 ? (
            <>
              <BilingualStudyControls
                segments={segments}
                selectedSegmentId={selectedSegmentId}
                onSelectSegment={handleSelectSegment}
                targetLanguage={targetLanguage}
                seriesId={`generated:${storyId}`}
              />
              <div className="border-b border-black/10 bg-white px-4 py-2 text-right text-[11px] text-neutral-500 sm:px-6">
                文を選択後、語をタップして意味・品詞を確認　単語解説 {formatAiUsage(aiUsage?.actions.word_explanation)}
                {isAiUsageLimitReached(aiUsage?.actions.word_explanation) &&
                !aiUsage?.isSubscriber ? (
                  <Link href="/subscription" className="ml-2 font-semibold text-sky-700 underline underline-offset-2">
                    月額680円で無制限
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
                    onSelectWord={handleSelectWord}
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
                    onSelectWord={handleSelectWord}
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
          ) : (
            <div className="flex min-h-[30rem] items-center justify-center px-5 py-10">
              <div className="w-full max-w-xl rounded-[28px] border border-black/10 bg-neutral-50 p-6 text-center">
                {status === "error" || status === "missing" ? (
                  <>
                    <p className="text-lg font-semibold">
                      {status === "missing" ? "この言語の対訳は未生成です" : "対訳を準備できませんでした"}
                    </p>
                    <p className="mt-2 text-sm leading-7 text-neutral-600">
                      {message || (status === "missing" ? "必要な場合だけ生成します。" : "時間をおいてからもう一度お試しください。")}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setStatus("translating");
                        void requestTranslation();
                      }}
                      disabled={
                        isAiUsageLimitReached(
                          aiUsage?.actions.translation_generation
                        )
                      }
                      className="mt-5 rounded-full bg-black px-5 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-800"
                    >
                      {status === "missing" ? "対訳を生成" : "再試行"} {formatAiUsage(aiUsage?.actions.translation_generation)}
                    </button>
                    {isAiUsageLimitReached(aiUsage?.actions.translation_generation) &&
                    !aiUsage?.isSubscriber ? (
                      <Link href="/subscription" className="mt-4 block text-sm font-semibold text-sky-700 underline underline-offset-4">
                        月額680円で生成上限を増やす
                      </Link>
                    ) : null}
                  </>
                ) : (
                  <>
                    <p className="text-lg font-semibold">
                      {status === "loading" ? "保存済み対訳を確認中" : "対訳を生成中"}
                    </p>
                    <p className="mt-2 text-sm leading-7 text-neutral-600">
                      {status === "loading"
                        ? "選択した言語の対訳cacheを確認しています。"
                        : "この生成結果の一時対訳を作成しています。"}
                    </p>
                  </>
                )}
              </div>
            </div>
          )}
        </section>

        <BilingualStoppedFooter
          seriesId={`generated:${storyId}`}
          episodeNumber={1}
          positionIndex={currentPositionIndex}
          sentenceCount={segments.length}
          upperPane={upperPane}
          narrationUnits={segments.map((segment) =>
            upperPane === "source"
              ? segment.translatedText
              : segment.sourceText
          )}
          narrationLanguage={getSupportedLanguage(upperPane === "source" ? targetLanguage : sourceLanguage).speechLanguage}
          sourceLanguage={sourceLanguage}
          targetLanguage={targetLanguage}
          displaySettings={displaySettings}
          onDisplaySettingsChange={setDisplaySettings}
          onPositionIndexChange={(index, shouldFollow) => {
            const segment = segments[index];
            if (!segment) return;
            readingSegmentIdRef.current = segment.id;
            setCurrentPositionIndex(index);
            setSelectedSegmentId(segment.id);
            if (shouldFollow) centerSegment(segment.id);
          }}
        />

        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={handleDisableBilingual}
            className="rounded-full border border-black/10 bg-white px-5 py-2.5 text-sm text-neutral-700 transition hover:bg-neutral-50"
          >
            原文表示に戻る
          </button>
        </div>
      </div>
    </main>
  );
}
