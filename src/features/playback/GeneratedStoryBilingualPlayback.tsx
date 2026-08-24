"use client";

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
import TranslationLanguageSelect from "@/features/playback/TranslationLanguageSelect";
import {
  getSupportedLanguage,
  isPublicTranslationTargetLanguage,
  parseSupportedLanguageTag,
  type PublicTranslationTargetLanguage,
} from "@/lib/translation/languageRegistry";

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
  status?: "ready" | "translating";
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

function readPreference(storyId: string): BilingualPreference {
  try {
    const raw = window.localStorage.getItem(
      `duonovel:bilingual-display:generated:${storyId}`
    );
    if (!raw) return DEFAULT_PREFERENCE;
    const parsed = JSON.parse(raw) as Partial<BilingualPreference> & {
      upperLanguage?: string;
    };
    const storedTargetLanguage = parseSupportedLanguageTag(
      parsed.targetLanguage
    );
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
      targetLanguage:
        storedTargetLanguage &&
        isPublicTranslationTargetLanguage(storedTargetLanguage)
          ? storedTargetLanguage
          : DEFAULT_PREFERENCE.targetLanguage,
    };
  } catch {
    return DEFAULT_PREFERENCE;
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
}: {
  storyId: string;
}) {
  const [story, setStory] = useState<SavedGeneratedStoryPayload | null>(null);
  const preference = useMemo(
    () => (typeof window === "undefined" ? DEFAULT_PREFERENCE : readPreference(storyId)),
    [storyId]
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
  const [status, setStatus] = useState<"loading" | "translating" | "ready" | "error">(
    "loading"
  );
  const [segments, setSegments] = useState<BilingualSegment[]>([]);
  const [message, setMessage] = useState("");
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const [hoveredSegmentId, setHoveredSegmentId] = useState<string | null>(null);

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
        `duonovel:bilingual-display:generated:${storyId}`,
        JSON.stringify({ splitRatio, upperPane, readerHeight, targetLanguage })
      );
    } catch {
      // Local preference persistence is non-critical.
    }
  }, [readerHeight, storyId, splitRatio, targetLanguage, upperPane]);

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
          sourceLanguage: "ja",
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

      if (targetLanguageRef.current !== targetLanguage) return;

      if (!response.ok || !payload.ok) {
        setStatus("error");
        setMessage(payload.message || "対訳を生成できませんでした。");
        return;
      }

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
  }, [story, targetLanguage]);

  useEffect(() => {
    if (!story) return;
    setMessage("");
    setSegments([]);
    setSelectedSegmentId(null);
    setHoveredSegmentId(null);
    readingSegmentIdRef.current = null;
    setStatus("translating");
    void requestTranslation();
  }, [story, requestTranslation, targetLanguage]);

  useEffect(() => {
    if (status !== "translating") return;
    const timer = window.setInterval(() => {
      void requestTranslation();
    }, 2500);
    return () => window.clearInterval(timer);
  }, [status, requestTranslation]);

  function centerSegment(id: string) {
    window.requestAnimationFrame(() => {
      centerInPane(jaScrollRef.current, jaSegmentRefs.current.get(id) ?? null);
      centerInPane(enScrollRef.current, enSegmentRefs.current.get(id) ?? null);
    });
  }

  function handleSelectSegment(id: string) {
    readingSegmentIdRef.current = id;
    setSelectedSegmentId(id);
    centerSegment(id);
  }

  function handleReadingPositionChange(id: string) {
    readingSegmentIdRef.current = id;
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
    if (language === targetLanguage) return;
    targetLanguageRef.current = language;
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setTargetLanguage(language);
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

  const sourceLanguageLabel = getSupportedLanguage("ja").nativeLabel;
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
                  onChange={handleTargetLanguageChange}
                />
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
              />

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
                    side="target"
                    languageLabel={targetLanguageLabel}
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

                {upperPane === "source" ? (
                  <BilingualPane
                    side="target"
                    languageLabel={targetLanguageLabel}
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
                    side="source"
                    languageLabel={sourceLanguageLabel}
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

              <BilingualHeightHandle
                readerRef={readerGridRef}
                readerHeight={readerHeight}
                onReaderHeightChange={setReaderHeight}
              />
            </>
          ) : (
            <div className="flex min-h-[30rem] items-center justify-center px-5 py-10">
              <div className="w-full max-w-xl rounded-[28px] border border-black/10 bg-neutral-50 p-6 text-center">
                {status === "error" ? (
                  <>
                    <p className="text-lg font-semibold">対訳を準備できませんでした</p>
                    <p className="mt-2 text-sm leading-7 text-neutral-600">
                      {message || "時間をおいてからもう一度お試しください。"}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setStatus("translating");
                        void requestTranslation();
                      }}
                      className="mt-5 rounded-full bg-black px-5 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-800"
                    >
                      再試行
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-lg font-semibold">対訳を準備中</p>
                    <p className="mt-2 text-sm leading-7 text-neutral-600">
                      保存せず、この生成結果の一時対訳を作成しています。
                    </p>
                  </>
                )}
              </div>
            </div>
          )}
        </section>

        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={handleDisableBilingual}
            className="rounded-full border border-black/10 bg-white px-5 py-2.5 text-sm text-neutral-700 transition hover:bg-neutral-50"
          >
            日本語表示に戻る
          </button>
        </div>
      </div>
    </main>
  );
}
