"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import {
  buildBackgroundTheme,
  buildSegments,
  buildTypographyStyle,
  renderIllustration,
  renderSceneCue,
  renderSegment,
} from "@/features/effects/EffectPreviewRenderer";
import BgmController from "@/features/playback/BgmController";
import EpisodeCommentSection from "@/features/comment/EpisodeCommentSection";
import {
  usePlayLogPersistence,
  type ReadResumeState,
} from "@/hooks/usePlayLogPersistence";
import type { BgmSettings } from "@/lib/bgm/bgmSettings";
import {
  emptyEffectSettings,
  type EffectSettings,
} from "@/lib/effects/effectSettings";

type EpisodePlaybackProps = {
  seriesId: string;
  episodeNumber: number;
  seriesTitle?: string;
  episodeTitle?: string;
  body?: string | null;
  selectedReaderKey?: string;
  selectedReaderName?: string;
  recordingAvailable?: boolean;
  episodeId?: string | null;
  recordingId?: string | null;
  audioStoragePath?: string | null;
  prevEpisodeHref?: string | null;
  prevEpisodeNumber?: number | null;
  nextEpisodeHref?: string | null;
  nextEpisodeNumber?: number | null;
  workIndexHref?: string | null;
  initialStartAt?: number | null;
  initialAutoPlay?: boolean;
  loginHref?: string;
  showComments?: boolean;
  bgmTitle?: string;
  bgmSrc?: string | null;
  bgmSettings?: BgmSettings;
  effectSettings?: EffectSettings;
};

type SentenceSegment = {
  index: number;
  text: string;
};

type ParagraphBlock = {
  paragraphIndex: number;
  segments: SentenceSegment[];
};

type SceneCueRuntime = EffectSettings["sceneCues"][number] & {
  sentenceIndex: number;
};

type BookmarkData = {
  seriesId: string;
  episodeNumber: number;
  episodeTitle?: string;
  currentTime: number;
  duration: number;
  readerKey?: string;
  readerName?: string;
  savedAt: string;
};

type LineHeightPreset = "compact" | "normal" | "wide";

type DisplayPreference = {
  fontScale: number;
  lineHeight: LineHeightPreset;
  hideEffects: boolean;
};

const DEFAULT_DISPLAY_PREFERENCE: DisplayPreference = {
  fontScale: 1.06,
  lineHeight: "normal",
  hideEffects: false,
};

function clampFontScale(value: number): number {
  if (!Number.isFinite(value)) return 1.06;
  return Math.min(1.4, Math.max(0.9, value));
}

function clampNarrationVolume(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(1, Math.max(0, value));
}

function clampPlaybackRate(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(2.5, Math.max(0.5, Math.round(value * 10) / 10));
}

function formatPlaybackRate(value: number): string {
  return `×${clampPlaybackRate(value).toFixed(1)}`;
}

function readStoredDisplayPreference(seriesId: string): DisplayPreference {
  if (typeof window === "undefined") {
    return DEFAULT_DISPLAY_PREFERENCE;
  }

  try {
    const raw = window.localStorage.getItem(`duonovel:display:${seriesId}`);
    if (!raw) {
      return DEFAULT_DISPLAY_PREFERENCE;
    }

    const parsed = JSON.parse(raw) as Partial<DisplayPreference>;

    return {
      fontScale:
        typeof parsed.fontScale === "number"
          ? clampFontScale(parsed.fontScale)
          : DEFAULT_DISPLAY_PREFERENCE.fontScale,
      lineHeight:
        parsed.lineHeight === "compact" ||
        parsed.lineHeight === "normal" ||
        parsed.lineHeight === "wide"
          ? parsed.lineHeight
          : DEFAULT_DISPLAY_PREFERENCE.lineHeight,
      hideEffects:
        typeof parsed.hideEffects === "boolean"
          ? parsed.hideEffects
          : DEFAULT_DISPLAY_PREFERENCE.hideEffects,
    };
  } catch {
    return DEFAULT_DISPLAY_PREFERENCE;
  }
}

function readStoredAutoAdvancePreference(seriesId: string): boolean {
  if (typeof window === "undefined") {
    return true;
  }

  try {
    const raw = window.localStorage.getItem(`duonovel:auto-advance:${seriesId}`);
    if (raw === "false") {
      return false;
    }
    return true;
  } catch {
    return true;
  }
}

function readStoredPlaybackRate(seriesId: string): number {
  if (typeof window === "undefined") {
    return 1;
  }

  try {
    const raw = window.localStorage.getItem(`duonovel:playback-rate:${seriesId}`);
    if (!raw) {
      return 1;
    }

    return clampPlaybackRate(Number(raw));
  } catch {
    return 1;
  }
}

function readStoredNarrationVolume(seriesId: string): number {
  if (typeof window === "undefined") {
    return 1;
  }

  try {
    const raw = window.localStorage.getItem(
      `duonovel:narration-volume:${seriesId}`
    );
    if (!raw) {
      return 1;
    }

    return clampNarrationVolume(Number(raw));
  } catch {
    return 1;
  }
}

function getLocalResumePrimaryKey(targetSeriesId: string): string {
  return `duonovel:read-progress:${targetSeriesId}`;
}

function getLocalResumeLegacyKeys(targetSeriesId: string): string[] {
  return [
    getLocalResumePrimaryKey(targetSeriesId),
    `duonovel:resume:${targetSeriesId}`,
    `duonovel:bookmark:${targetSeriesId}`,
    `read-progress:${targetSeriesId}`,
    `read_resume:${targetSeriesId}`,
  ];
}

function formatTime(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "0:00";

  const totalSeconds = Math.floor(value);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function splitParagraphIntoSentences(paragraph: string): string[] {
  const normalized = paragraph.trim();
  if (!normalized) return [];

  const matched = normalized.match(/[^。！？!?]+[。！？!?]?/g);
  if (!matched || matched.length === 0) {
    return [normalized];
  }

  return matched.map((item) => item.trim()).filter((item) => item.length > 0);
}

function renderSentenceWithInlineMarks(
  text: string,
  inlineMarks: EffectSettings["inlineMarks"]
) {
  return buildSegments(text, inlineMarks).map((segment, index) =>
    renderSegment(segment, index)
  );
}

function buildSceneCueRuntimeList(
  paragraphBlocks: ParagraphBlock[],
  sceneCues: EffectSettings["sceneCues"]
): SceneCueRuntime[] {
  const allSegments = paragraphBlocks.flatMap((block) => block.segments);

  return sceneCues
    .map((sceneCue) => {
      const triggerText = sceneCue.triggerText.trim();
      if (!triggerText) return null;

      const matchedSegment = allSegments.find((segment) =>
        segment.text.includes(triggerText)
      );

      if (!matchedSegment) return null;

      return {
        ...sceneCue,
        sentenceIndex: matchedSegment.index,
      };
    })
    .filter((sceneCue): sceneCue is SceneCueRuntime => sceneCue !== null)
    .sort((left, right) => left.sentenceIndex - right.sentenceIndex);
}

function FooterActionButton({
  label,
  disabled = false,
  active = false,
  accent = false,
  onClick,
}: {
  label: string;
  disabled?: boolean;
  active?: boolean;
  accent?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={[
        "flex h-12 w-full items-center justify-center rounded-2xl border px-2 text-center text-[10px] font-medium leading-tight transition sm:text-sm",
        accent
          ? "border-white bg-white text-black hover:opacity-90 disabled:border-white/10 disabled:bg-white/5 disabled:text-neutral-500"
          : active
            ? "border-sky-400/20 bg-sky-400/10 text-sky-200"
            : disabled
              ? "border-white/10 bg-white/5 text-neutral-500"
              : "border-white/10 bg-white/5 text-neutral-200 hover:bg-white/10",
      ].join(" ")}
    >
      <span className="whitespace-pre-line">{label}</span>
    </button>
  );
}

function FooterPlaybackRateControl({
  value,
  onDecrease,
  onIncrease,
}: {
  value: number;
  onDecrease: () => void;
  onIncrease: () => void;
}) {
  const atMin = value <= 0.5;
  const atMax = value >= 2.5;

  return (
    <div className="flex h-12 w-full overflow-hidden rounded-2xl border border-white/10 bg-white/5">
      <button
        type="button"
        onClick={onDecrease}
        disabled={atMin}
        className="flex w-1/4 items-center justify-center border-r border-white/10 text-sm text-neutral-200 transition hover:bg-white/10 disabled:text-neutral-500 disabled:hover:bg-transparent"
      >
        −
      </button>

      <div className="flex flex-1 items-center justify-center text-[10px] font-medium text-neutral-200 sm:text-sm">
        {formatPlaybackRate(value)}
      </div>

      <button
        type="button"
        onClick={onIncrease}
        disabled={atMax}
        className="flex w-1/4 items-center justify-center border-l border-white/10 text-sm text-neutral-200 transition hover:bg-white/10 disabled:text-neutral-500 disabled:hover:bg-transparent"
      >
        ＋
      </button>
    </div>
  );
}

function SettingChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-full px-4 py-2 text-sm font-medium transition",
        active
          ? "bg-white text-black"
          : "border border-white/10 bg-white/5 text-neutral-300 hover:bg-white/10",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

export default function EpisodePlayback({
  seriesId,
  episodeId,
  recordingId,
  episodeNumber,
  seriesTitle,
  episodeTitle,
  body,
  selectedReaderKey,
  selectedReaderName,
  recordingAvailable = false,
  audioStoragePath,
  prevEpisodeHref,
  prevEpisodeNumber,
  nextEpisodeHref,
  nextEpisodeNumber,
  workIndexHref,
  initialStartAt,
  initialAutoPlay = false,
  loginHref,
  showComments = true,
  bgmTitle,
  bgmSrc,
  bgmSettings,
  effectSettings,
}: EpisodePlaybackProps) {
  const router = useRouter();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pendingResumeRef = useRef<ReadResumeState | null>(null);
  const advanceTimeoutRef = useRef<number | null>(null);
  const sentenceRefs = useRef<Record<number, HTMLSpanElement | null>>({});
  const ignoreScrollRef = useRef(false);
  const ignoreScrollTimeoutRef = useRef<number | null>(null);
  const hasAppliedInitialSeekRef = useRef(false);
  const autoPlayRequestedRef = useRef(false);
  const settingsReturnScrollYRef = useRef<number | null>(null);
  const suppressAutoFollowAfterSettingsRef = useRef(false);
  const bookmarkToastTimeoutRef = useRef<number | null>(null);
  const previousEstimatedSentenceIndexRef = useRef(-1);

  const readLocalResumeState = useCallback(
    (targetSeriesId: string): ReadResumeState | null => {
      if (typeof window === "undefined") return null;

      for (const key of getLocalResumeLegacyKeys(targetSeriesId)) {
        const raw = window.localStorage.getItem(key);
        if (!raw) continue;

        try {
          const parsed = JSON.parse(raw) as Partial<ReadResumeState> | null;
          if (!parsed) continue;

          const nextEpisodeNumber = Number(parsed.episodeNumber);
          if (!Number.isFinite(nextEpisodeNumber)) continue;

          return {
            episodeNumber: nextEpisodeNumber,
            recordingId:
              typeof parsed.recordingId === "string" ? parsed.recordingId : null,
            positionSeconds: Number(parsed.positionSeconds ?? 0),
            markerIndex: Number(parsed.markerIndex ?? 0),
            progressPercent: Number(parsed.progressPercent ?? 0),
            isFollowing:
              typeof parsed.isFollowing === "boolean" ? parsed.isFollowing : true,
          };
        } catch (error) {
          console.error("[EpisodePlayback] local resume parse failed:", error);
        }
      }

      return null;
    },
    []
  );

  const writeLocalResumeState = useCallback(
    (targetSeriesId: string, nextState: ReadResumeState) => {
      if (typeof window === "undefined") return;

      window.localStorage.setItem(
        getLocalResumePrimaryKey(targetSeriesId),
        JSON.stringify(nextState)
      );
    },
    []
  );

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [audioError, setAudioError] = useState("");
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [autoFollow, setAutoFollow] = useState(true);
  const [bookmarkMessage, setBookmarkMessage] = useState("");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isNarrationStopped, setIsNarrationStopped] = useState(false);

  const [displayPreference, setDisplayPreference] = useState<DisplayPreference>(
    () => readStoredDisplayPreference(seriesId)
  );
  const [autoAdvanceToNext, setAutoAdvanceToNext] = useState<boolean>(() =>
    readStoredAutoAdvancePreference(seriesId)
  );
  const [playbackRate, setPlaybackRate] = useState<number>(() =>
    readStoredPlaybackRate(seriesId)
  );
  const [narrationVolume, setNarrationVolume] = useState<number>(() =>
    readStoredNarrationVolume(seriesId)
  );

  const [firedSceneCueIds, setFiredSceneCueIds] = useState<
    Record<string, true>
  >({});
  const [activeSceneCueId, setActiveSceneCueId] = useState<string | null>(null);
  const [activeBackgroundPreset, setActiveBackgroundPreset] =
    useState<EffectSettings["backgroundPreset"]>(null);
  const [activeSceneBgmSrc, setActiveSceneBgmSrc] = useState<string | null>(
    null
  );
  const [activeSceneBgmTitle, setActiveSceneBgmTitle] = useState("");  

  const appliedEffectSettings = useMemo(
    () => effectSettings ?? emptyEffectSettings(),
    [effectSettings]
  );

  const effectiveBackgroundPreset =
    activeBackgroundPreset ?? appliedEffectSettings.backgroundPreset;

  const effectTheme = useMemo(
    () => buildBackgroundTheme(effectiveBackgroundPreset),
    [effectiveBackgroundPreset]
  );

  const effectTypographyStyle = useMemo(
    () => buildTypographyStyle(appliedEffectSettings),
    [appliedEffectSettings]
  );

  const previewIllustrations = useMemo(
    () =>
      appliedEffectSettings.illustrations.filter(
        (illustration) => illustration.placement !== "scene_break"
      ),
    [appliedEffectSettings]
  );

  const fontScale = displayPreference.fontScale;
  const lineHeightPreset = displayPreference.lineHeight;
  const hideEffects = displayPreference.hideEffects;

  const safeSeriesTitle =
    typeof seriesTitle === "string" && seriesTitle.trim().length > 0
      ? seriesTitle
      : "無題";

  const safeEpisodeTitle =
    typeof episodeTitle === "string" && episodeTitle.trim().length > 0
      ? episodeTitle
      : "話タイトル未設定";

  const safeBody =
    typeof body === "string" && body.trim().length > 0
      ? body
      : "本文がまだ登録されていません。";

  const paragraphs = useMemo(() => {
    return safeBody
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }, [safeBody]);

  const paragraphBlocks = useMemo<ParagraphBlock[]>(() => {
    const sentenceGroups = paragraphs.map((paragraph) =>
      splitParagraphIntoSentences(paragraph)
    );

    return sentenceGroups.map((sentences, paragraphIndex) => {
      const baseIndex = sentenceGroups
        .slice(0, paragraphIndex)
        .reduce((sum, group) => sum + group.length, 0);

      return {
        paragraphIndex,
        segments: sentences.map((text, sentenceIndex) => ({
          index: baseIndex + sentenceIndex,
          text,
        })),
      };
    });
  }, [paragraphs]);

  const totalSentenceCount = useMemo(() => {
    return paragraphBlocks.reduce((sum, block) => sum + block.segments.length, 0);
  }, [paragraphBlocks]);

  const runtimeSceneCues = useMemo(
    () => buildSceneCueRuntimeList(paragraphBlocks, appliedEffectSettings.sceneCues),
    [paragraphBlocks, appliedEffectSettings.sceneCues]
  );

  const activeSceneCueLabel = useMemo(
    () =>
      runtimeSceneCues.find((sceneCue) => sceneCue.id === activeSceneCueId)?.label ??
      "",
    [runtimeSceneCues, activeSceneCueId]
  );  

  const playableAudioSrc = useMemo(() => {
    const value = (audioStoragePath ?? "").trim();

    if (!value) return "";
    if (value.startsWith("http://")) return value;
    if (value.startsWith("https://")) return value;
    if (value.startsWith("/")) return value;

    return "";
  }, [audioStoragePath]);

  const canPlayAudio =
    !isNarrationStopped && recordingAvailable && playableAudioSrc.length > 0;
  const hasPrevEpisode =
    typeof prevEpisodeNumber === "number" && !!prevEpisodeHref;
  const hasNextEpisode =
    typeof nextEpisodeNumber === "number" && !!nextEpisodeHref;

  const resolvedBgmSrc = activeSceneBgmSrc ?? bgmSrc ?? null;
  const resolvedBgmTitle =
    activeSceneBgmSrc !== null
      ? activeSceneBgmTitle || bgmTitle || "場面BGM"
      : bgmTitle || "";    

  const estimatedSentenceIndex = useMemo(() => {
    if (totalSentenceCount <= 0) return -1;
    if (!Number.isFinite(duration) || duration <= 0) return -1;

    const rawRatio = currentTime / duration;
    const ratio = Math.min(Math.max(rawRatio, 0), 0.999999);

    return Math.min(
      totalSentenceCount - 1,
      Math.floor(ratio * totalSentenceCount)
    );
  }, [totalSentenceCount, currentTime, duration]);

  const visibleMarkerSentenceIndex = estimatedSentenceIndex;

  const applyRestoredPlayLog = useCallback(
    (resumeState: ReadResumeState) => {
      pendingResumeRef.current = resumeState;
      setAutoFollow(resumeState.isFollowing);

      if (audioRef.current && audioRef.current.readyState >= 1) {
        const nextTime = Math.max(0, resumeState.positionSeconds);
        audioRef.current.currentTime = nextTime;
        setCurrentTime(nextTime);
        pendingResumeRef.current = null;
      }
    },
    []
  );

  const { flushPlayLog } = usePlayLogPersistence({
    seriesId,
    episodeId: episodeId ?? null,
    episodeNumber,
    recordingId: recordingId ?? null,
    currentTime,
    duration,
    markerIndex: estimatedSentenceIndex >= 0 ? estimatedSentenceIndex : 0,
    isFollowing: autoFollow,
    isPlaying,
    intervalMs: 4000,
    onRestore: applyRestoredPlayLog,
    readLocalResumeState,
    writeLocalResumeState,
  });

  const resetPlaybackViewState = useCallback(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setAudioError("");
    setIsAdvancing(false);
    setAutoFollow(true);
    setBookmarkMessage("");
    setIsSettingsOpen(false);
    setIsNarrationStopped(false);
  }, []);

  const lineHeightValue = useMemo(() => {
    if (lineHeightPreset === "compact") return 1.95;
    if (lineHeightPreset === "wide") return 2.45;
    return 2.2;
  }, [lineHeightPreset]);

  const readingPaneClass = useMemo(() => {
    if (hideEffects) {
      return "rounded-[28px] bg-transparent p-5 sm:p-6";
    }
    return `${effectTheme.frameClassName} ${effectTheme.surfaceClassName} p-5 sm:p-6`;
  }, [hideEffects, effectTheme.frameClassName, effectTheme.surfaceClassName]);

  const readingPaneTextClassName = useMemo(() => {
    if (hideEffects) {
      return "text-neutral-100";
    }
    return effectTheme.textClassName;
  }, [hideEffects, effectTheme.textClassName]);

  const markerClass =
    "bg-[repeating-linear-gradient(135deg,rgba(200,200,200,0.26)_0px,rgba(200,200,200,0.26)_8px,rgba(120,120,120,0.18)_8px,rgba(120,120,120,0.18)_16px)] ring-1 ring-white/10";

  const unlockProgrammaticScroll = useCallback(() => {
    if (ignoreScrollTimeoutRef.current) {
      window.clearTimeout(ignoreScrollTimeoutRef.current);
    }

    ignoreScrollTimeoutRef.current = window.setTimeout(() => {
      ignoreScrollRef.current = false;
    }, 500);
  }, []);

  const scrollToSentence = useCallback(
    (sentenceIndex: number, behavior: ScrollBehavior = "smooth") => {
      const target = sentenceRefs.current[sentenceIndex];
      if (!target) return;

      ignoreScrollRef.current = true;
      target.scrollIntoView({
        behavior,
        block: "center",
        inline: "nearest",
      });
      unlockProgrammaticScroll();
    },
    [unlockProgrammaticScroll]
  );

  useEffect(() => {
    try {
      const payload: DisplayPreference = {
        fontScale,
        lineHeight: lineHeightPreset,
        hideEffects,
      };

      window.localStorage.setItem(
        `duonovel:display:${seriesId}`,
        JSON.stringify(payload)
      );
    } catch {
      // 保存失敗は黙って継続
    }
  }, [seriesId, fontScale, lineHeightPreset, hideEffects]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        `duonovel:auto-advance:${seriesId}`,
        autoAdvanceToNext ? "true" : "false"
      );
    } catch {
      // 保存失敗は黙って継続
    }
  }, [seriesId, autoAdvanceToNext]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        `duonovel:playback-rate:${seriesId}`,
        String(playbackRate)
      );
    } catch {
      // 保存失敗は黙って継続
    }
  }, [seriesId, playbackRate]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        `duonovel:narration-volume:${seriesId}`,
        String(narrationVolume)
      );
    } catch {
      // 保存失敗は黙って継続
    }
  }, [seriesId, narrationVolume]);

  useEffect(() => {
    setFiredSceneCueIds({});
    setActiveSceneCueId(null);
    setActiveBackgroundPreset(null);
    setActiveSceneBgmSrc(null);
    setActiveSceneBgmTitle("");
    previousEstimatedSentenceIndexRef.current = -1;
  }, [episodeId, playableAudioSrc, bgmSrc, bgmTitle, appliedEffectSettings.sceneCues]);  

  useEffect(() => {
    if (estimatedSentenceIndex < 0) {
      previousEstimatedSentenceIndexRef.current = estimatedSentenceIndex;
      return;
    }

    if (runtimeSceneCues.length === 0) {
      previousEstimatedSentenceIndexRef.current = estimatedSentenceIndex;
      return;
    }

    const previousEstimatedSentenceIndex =
      previousEstimatedSentenceIndexRef.current;

    if (
      previousEstimatedSentenceIndex !== -1 &&
      estimatedSentenceIndex < previousEstimatedSentenceIndex
    ) {
      setFiredSceneCueIds({});
      setActiveSceneCueId(null);
      setActiveBackgroundPreset(null);
      setActiveSceneBgmSrc(null);
      setActiveSceneBgmTitle("");
      previousEstimatedSentenceIndexRef.current = -1;
      return;
    }

    const pendingSceneCues = runtimeSceneCues.filter(
      (sceneCue) =>
        sceneCue.sentenceIndex <= estimatedSentenceIndex &&
        !firedSceneCueIds[sceneCue.id]
    );

    if (pendingSceneCues.length === 0) {
      previousEstimatedSentenceIndexRef.current = estimatedSentenceIndex;
      return;
    }

    const latestSceneCue = pendingSceneCues[pendingSceneCues.length - 1];

    setFiredSceneCueIds((prev) => {
      const next = { ...prev };

      for (const sceneCue of pendingSceneCues) {
        next[sceneCue.id] = true;
      }

      return next;
    });

    setActiveSceneCueId(latestSceneCue.id);

    for (const sceneCue of pendingSceneCues) {
      if (sceneCue.backgroundPreset !== null) {
        setActiveBackgroundPreset(sceneCue.backgroundPreset);
      }

      const nextSceneBgmSrc = sceneCue.nextBgmAudioPath?.trim() ?? "";
      if (nextSceneBgmSrc) {
        setActiveSceneBgmSrc(nextSceneBgmSrc);
        setActiveSceneBgmTitle(
          sceneCue.nextBgmTitle?.trim() || sceneCue.label || "場面BGM"
        );
      }
    }

    previousEstimatedSentenceIndexRef.current = estimatedSentenceIndex;
  }, [estimatedSentenceIndex, firedSceneCueIds, runtimeSceneCues]);

  useEffect(() => {
    if (isSettingsOpen) {
      return;
    }

    if (settingsReturnScrollYRef.current === null) {
      suppressAutoFollowAfterSettingsRef.current = false;
      return;
    }

    const nextScrollY = settingsReturnScrollYRef.current;
    settingsReturnScrollYRef.current = null;
    suppressAutoFollowAfterSettingsRef.current = true;

    window.requestAnimationFrame(() => {
      ignoreScrollRef.current = true;
      window.scrollTo({
        top: nextScrollY,
        behavior: "auto",
      });
      unlockProgrammaticScroll();

      window.setTimeout(() => {
        suppressAutoFollowAfterSettingsRef.current = false;
      }, 350);
    });
  }, [isSettingsOpen, unlockProgrammaticScroll]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.playbackRate = playbackRate;
  }, [playbackRate, playableAudioSrc]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.volume = narrationVolume;
  }, [narrationVolume, playableAudioSrc]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => {
      audio.playbackRate = playbackRate;
      audio.volume = narrationVolume;
      setDuration(audio.duration || 0);

      if (
        pendingResumeRef.current &&
        Number.isFinite(pendingResumeRef.current.positionSeconds)
      ) {
        const nextTime = Math.min(
          Math.max(pendingResumeRef.current.positionSeconds, 0),
          audio.duration || pendingResumeRef.current.positionSeconds
        );

        audio.currentTime = nextTime;
        setCurrentTime(nextTime);
        pendingResumeRef.current = null;
        hasAppliedInitialSeekRef.current = true;
      } else if (
        !hasAppliedInitialSeekRef.current &&
        typeof initialStartAt === "number" &&
        Number.isFinite(initialStartAt) &&
        initialStartAt > 0
      ) {
        audio.currentTime = Math.min(
          initialStartAt,
          audio.duration || initialStartAt
        );
        setCurrentTime(audio.currentTime || 0);
        hasAppliedInitialSeekRef.current = true;
      }

      if (initialAutoPlay && !autoPlayRequestedRef.current && !isNarrationStopped) {
        autoPlayRequestedRef.current = true;
        setAutoFollow(true);
        setAudioError("");

        void audio.play().catch(() => {
          setAudioError("再生を開始できなかった");
          setIsPlaying(false);
        });
      }
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime || 0);
    };

    const handleEnded = () => {
      setIsPlaying(false);

      if (autoAdvanceToNext && nextEpisodeHref && !isNarrationStopped) {
        void flushPlayLog("episode-move");
        setIsAdvancing(true);

        advanceTimeoutRef.current = window.setTimeout(() => {
          router.push(buildAutoPlayHref(nextEpisodeHref));
        }, 900);
        return;
      }

      void flushPlayLog("pause");
    };

    const handlePause = () => {
      setIsPlaying(false);
      void flushPlayLog("pause");
    };

    const handlePlay = () => {
      setIsPlaying(true);
    };

    const handleSeeked = () => {
      setCurrentTime(audio.currentTime || 0);
      void flushPlayLog("seek");
    };

    const handleError = () => {
      setAudioError("音声ファイルの読み込みに失敗した");
      setIsPlaying(false);
      setIsAdvancing(false);
    };

    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("seeked", handleSeeked);
    audio.addEventListener("error", handleError);

    return () => {
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("seeked", handleSeeked);
      audio.removeEventListener("error", handleError);

      if (advanceTimeoutRef.current) {
        window.clearTimeout(advanceTimeoutRef.current);
      }
    };
  }, [
    autoAdvanceToNext,
    flushPlayLog,
    initialAutoPlay,
    initialStartAt,
    isNarrationStopped,
    narrationVolume,
    nextEpisodeHref,
    playbackRate,
    router,
  ]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (advanceTimeoutRef.current) {
      window.clearTimeout(advanceTimeoutRef.current);
    }

    if (ignoreScrollTimeoutRef.current) {
      window.clearTimeout(ignoreScrollTimeoutRef.current);
    }

    if (bookmarkToastTimeoutRef.current) {
      window.clearTimeout(bookmarkToastTimeoutRef.current);
    }

    ignoreScrollRef.current = false;
    hasAppliedInitialSeekRef.current = false;
    autoPlayRequestedRef.current = false;
    audio.pause();

    const resetTimer = window.setTimeout(() => {
      resetPlaybackViewState();
    }, 0);

    audio.load();

    return () => {
      window.clearTimeout(resetTimer);
    };
  }, [playableAudioSrc, resetPlaybackViewState]);

  useEffect(() => {
    if (!isPlaying) return;
    if (!autoFollow) return;
    if (estimatedSentenceIndex < 0) return;
    if (isSettingsOpen) return;
    if (isNarrationStopped) return;
    if (suppressAutoFollowAfterSettingsRef.current) return;

    scrollToSentence(estimatedSentenceIndex, "auto");
  }, [
    estimatedSentenceIndex,
    isPlaying,
    autoFollow,
    isSettingsOpen,
    isNarrationStopped,
    scrollToSentence,
  ]);

  useEffect(() => {
    function handleWindowScroll() {
      if (!isPlaying) return;
      if (!autoFollow) return;
      if (isSettingsOpen) return;
      if (ignoreScrollRef.current) return;

      setAutoFollow(false);
    }

    window.addEventListener("scroll", handleWindowScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleWindowScroll);
    };
  }, [isPlaying, autoFollow, isSettingsOpen]);

  async function handleTogglePlay(): Promise<void> {
    const audio = audioRef.current;
    if (!audio || !canPlayAudio) return;

    try {
      setAudioError("");

      if (audio.paused) {
        await audio.play();
      } else {
        audio.pause();
      }
    } catch {
      setAudioError("再生を開始できなかった");
      setIsPlaying(false);
    }
  }

  function handleSliderChange(event: ChangeEvent<HTMLInputElement>): void {
    const audio = audioRef.current;
    if (!audio || !canPlayAudio) return;

    const nextTime = Number(event.target.value);
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  }

  function buildAutoPlayHref(targetUrl: string): string {
    const [pathname, rawQuery = ""] = targetUrl.split("?");
    const query = new URLSearchParams(rawQuery);

    query.set("autoplay", "1");

    const nextQuery = query.toString();
    return `${pathname}${nextQuery ? `?${nextQuery}` : ""}`;
  }

  const moveToReadUrl = useCallback(
    async (targetUrl: string) => {
      await flushPlayLog("episode-move");
      router.push(targetUrl);
    },
    [flushPlayLog, router]
  );

  async function handleMovePrev(): Promise<void> {
    if (!prevEpisodeHref) return;
    await moveToReadUrl(prevEpisodeHref);
  }

  async function handleMoveNext(): Promise<void> {
    if (!nextEpisodeHref) return;
    await moveToReadUrl(nextEpisodeHref);
  }

  function handleEnableAutoFollow(): void {
    if (autoFollow) return;
    if (estimatedSentenceIndex < 0) return;
    if (isNarrationStopped) return;

    setAutoFollow(true);
    scrollToSentence(estimatedSentenceIndex, "smooth");
  }

  function handleToggleAutoAdvance(): void {
    setAutoAdvanceToNext((prev) => !prev);
  }

  function handleDecreasePlaybackRate(): void {
    setPlaybackRate((prev) => clampPlaybackRate(prev - 0.1));
  }

  function handleIncreasePlaybackRate(): void {
    setPlaybackRate((prev) => clampPlaybackRate(prev + 0.1));
  }

  function handleToggleHideEffects(): void {
    setDisplayPreference((prev) => ({
      ...prev,
      hideEffects: !prev.hideEffects,
    }));
  }

  function handleToggleSettings(): void {
    if (isSettingsOpen) {
      setIsSettingsOpen(false);
      return;
    }

    settingsReturnScrollYRef.current =
      typeof window !== "undefined" ? window.scrollY : 0;
    setIsSettingsOpen(true);

    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        ignoreScrollRef.current = true;
        window.scrollTo({
          top: 0,
          behavior: "auto",
        });
        unlockProgrammaticScroll();
      });
    }
  }

  function handleToggleNarrationStopped(): void {
    const audio = audioRef.current;

    if (isNarrationStopped) {
      setIsNarrationStopped(false);
      return;
    }

    if (audio) {
      audio.pause();
    }

    setIsNarrationStopped(true);
    setIsPlaying(false);
    void flushPlayLog("pause");
  }

  function handleSaveBookmark(): void {
    try {
      const audio = audioRef.current;

      const payload: BookmarkData = {
        seriesId,
        episodeNumber,
        episodeTitle: safeEpisodeTitle,
        currentTime: audio?.currentTime ?? currentTime ?? 0,
        duration: audio?.duration ?? duration ?? 0,
        readerKey: selectedReaderKey,
        readerName: selectedReaderName,
        savedAt: new Date().toISOString(),
      };

      window.localStorage.setItem(
        `duonovel:bookmark:${seriesId}`,
        JSON.stringify(payload)
      );

      setBookmarkMessage("しおりを保存した");

      if (bookmarkToastTimeoutRef.current) {
        window.clearTimeout(bookmarkToastTimeoutRef.current);
      }

      bookmarkToastTimeoutRef.current = window.setTimeout(() => {
        setBookmarkMessage("");
      }, 1800);
    } catch {
      setBookmarkMessage("しおり保存に失敗した");
    }
  }

  function handleFontScaleChange(event: ChangeEvent<HTMLInputElement>) {
    const nextFontScale = clampFontScale(Number(event.target.value));

    setDisplayPreference((prev) => ({
      ...prev,
      fontScale: nextFontScale,
    }));
  }

  function handleNarrationVolumeChange(event: ChangeEvent<HTMLInputElement>) {
    const nextVolume = clampNarrationVolume(Number(event.target.value));
    setNarrationVolume(nextVolume);
  }

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-neutral-100">
      <audio ref={audioRef} preload="metadata">
        {playableAudioSrc ? <source src={playableAudioSrc} /> : null}
      </audio>

      <div className="mx-auto w-full max-w-3xl px-4 pb-32 pt-6 sm:px-6">
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-neutral-400">
          {workIndexHref ? (
            <Link
              href={workIndexHref}
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 transition hover:bg-white/10"
            >
              目次へ戻る
            </Link>
          ) : null}
        </div>

        <section className="overflow-hidden rounded-[32px] border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] shadow-2xl">
          <div className="border-b border-white/10 px-5 py-6 sm:px-8">
            <p className="text-xs tracking-[0.22em] text-neutral-500">
              DUONOVEL READER
            </p>

            <p className="mt-3 text-sm text-neutral-400">{safeSeriesTitle}</p>
            <h1 className="mt-2 text-3xl font-bold leading-tight text-white sm:text-4xl">
              {safeEpisodeTitle}
            </h1>

            <div className="mt-5 flex flex-wrap gap-2">
              {selectedReaderName ? (
                <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-200">
                  朗読者: {selectedReaderName}
                </span>
              ) : (
                <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-500">
                  朗読者未選択
                </span>
              )}

              {resolvedBgmSrc ? (
                <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-300">
                  fade in {bgmSettings?.fadeInSeconds ?? 0}s / fade out{" "}
                  {bgmSettings?.fadeOutSeconds ?? 0}s
                </span>
              ) : null}

              <span
                className={[
                  "rounded-full px-4 py-2 text-sm",
                  recordingAvailable
                    ? "border border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
                    : "border border-amber-400/20 bg-amber-400/10 text-amber-200",
                ].join(" ")}
              >
                {recordingAvailable ? "この話の朗読あり" : "この話では朗読未登録"}
              </span>

              <span
                className={[
                  "rounded-full px-4 py-2 text-sm",
                  playableAudioSrc
                    ? "border border-sky-400/20 bg-sky-400/10 text-sky-200"
                    : "border border-white/10 bg-white/5 text-neutral-500",
                ].join(" ")}
              >
                {playableAudioSrc ? "再生URL接続済み" : "再生URL未接続"}
              </span>

              <span
                className={[
                  "rounded-full px-4 py-2 text-sm",
                  resolvedBgmSrc
                    ? "border border-fuchsia-400/20 bg-fuchsia-400/10 text-fuchsia-200"
                    : "border border-white/10 bg-white/5 text-neutral-500",
                ].join(" ")}
              >
                {resolvedBgmSrc ? "BGM設定あり" : "BGM未設定"}
              </span>

              {activeSceneCueLabel ? (
                <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-sm text-emerald-200">
                  発火中: {activeSceneCueLabel}
                </span>
              ) : null}
            </div>

            <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm leading-7 text-neutral-400">
              今の本文追尾は、音声全体の進行率から現在文を推定する仮実装。
              あとで文単位 timestamp に差し替える前提。
            </div>

            <BgmController
              seriesId={seriesId}
              bgmSrc={resolvedBgmSrc}
              bgmTitle={resolvedBgmTitle}
              bgmSettings={bgmSettings}
              isNarrationPlaying={isPlaying && !isNarrationStopped}
              playbackRate={playbackRate}
              isOpen={isSettingsOpen}
            />

            {isSettingsOpen ? (
              <div className="mt-4 grid gap-4">
                <section className="rounded-[28px] border border-white/10 bg-black/20 p-4">
                  <p className="text-xs tracking-[0.18em] text-neutral-500">NARRATION</p>
                  <h3 className="mt-2 text-lg font-semibold text-white">朗読</h3>

                  <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <div className="flex items-center justify-between gap-3 text-sm text-neutral-300">
                      <span>朗読音量</span>
                      <span>{Math.round(narrationVolume * 100)}%</span>
                    </div>

                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={narrationVolume}
                      onChange={handleNarrationVolumeChange}
                      className="mt-3 w-full accent-white"
                    />
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <div>
                      <p className="text-sm text-neutral-300">次話自動再生</p>
                      <p className="mt-1 text-xs leading-6 text-neutral-500">
                        朗読が最後まで進んで終わった時だけ、次の話へ移動して自動再生する。
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleToggleAutoAdvance}
                      className={[
                        "rounded-full border px-4 py-2 text-sm font-medium transition",
                        autoAdvanceToNext
                          ? "border-violet-400/20 bg-violet-400/10 text-violet-200 hover:bg-violet-400/20"
                          : "border-white/10 bg-white/5 text-neutral-300 hover:bg-white/10",
                      ].join(" ")}
                    >
                      {autoAdvanceToNext ? "ON" : "OFF"}
                    </button>
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <div>
                      <p className="text-sm text-neutral-300">朗読停止</p>
                      <p className="mt-1 text-xs leading-6 text-neutral-500">
                        停止中はシークバー、倍速、再生、自動追尾を footer から隠す。
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleToggleNarrationStopped}
                      className={[
                        "rounded-full border px-4 py-2 text-sm font-medium transition",
                        isNarrationStopped
                          ? "border-red-400/20 bg-red-400/10 text-red-200 hover:bg-red-400/20"
                          : "border-white/10 bg-white/5 text-neutral-300 hover:bg-white/10",
                      ].join(" ")}
                    >
                      {isNarrationStopped ? "停止解除" : "停止"}
                    </button>
                  </div>
                </section>

                <section className="rounded-[28px] border border-white/10 bg-black/20 p-4">
                  <p className="text-xs tracking-[0.18em] text-neutral-500">DISPLAY</p>
                  <h3 className="mt-2 text-lg font-semibold text-white">表示演出</h3>

                  <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <div>
                      <p className="text-sm text-neutral-300">全演出を非表示</p>
                      <p className="mt-1 text-xs leading-6 text-neutral-500">
                        背景、文字装飾、挿絵、scene cue を一括で隠す。
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleToggleHideEffects}
                      className={[
                        "rounded-full border px-4 py-2 text-sm font-medium transition",
                        hideEffects
                          ? "border-amber-400/20 bg-amber-400/10 text-amber-200 hover:bg-amber-400/20"
                          : "border-white/10 bg-white/5 text-neutral-300 hover:bg-white/10",
                      ].join(" ")}
                    >
                      {hideEffects ? "ON" : "OFF"}
                    </button>
                  </div>

                  <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <div className="flex items-center justify-between gap-3 text-sm text-neutral-300">
                      <span>文字サイズ</span>
                      <span>{Math.round(fontScale * 100)}%</span>
                    </div>

                    <input
                      type="range"
                      min={0.9}
                      max={1.4}
                      step={0.05}
                      value={fontScale}
                      onChange={handleFontScaleChange}
                      className="mt-3 w-full accent-white"
                    />
                  </div>

                  <div className="mt-4">
                    <p className="text-sm text-neutral-300">行間</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <SettingChip
                        active={lineHeightPreset === "compact"}
                        label="狭め"
                        onClick={() =>
                          setDisplayPreference((prev) => ({
                            ...prev,
                            lineHeight: "compact",
                          }))
                        }
                      />
                      <SettingChip
                        active={lineHeightPreset === "normal"}
                        label="標準"
                        onClick={() =>
                          setDisplayPreference((prev) => ({
                            ...prev,
                            lineHeight: "normal",
                          }))
                        }
                      />
                      <SettingChip
                        active={lineHeightPreset === "wide"}
                        label="広め"
                        onClick={() =>
                          setDisplayPreference((prev) => ({
                            ...prev,
                            lineHeight: "wide",
                          }))
                        }
                      />
                    </div>
                  </div>
                </section>

                <p className="text-sm leading-7 text-neutral-400">
                  設定表示中は本文を隠している。閉じると元のスクロール位置へ戻る。
                </p>
              </div>
            ) : null}

            {audioStoragePath ? (
              <p className="mt-4 break-all text-xs leading-6 text-neutral-500">
                audio: {audioStoragePath}
              </p>
            ) : null}

            {audioError ? (
              <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
                {audioError}
              </div>
            ) : null}

            {bookmarkMessage ? (
              <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
                {bookmarkMessage}
              </div>
            ) : null}

            {isAdvancing ? (
              <div className="mt-4 rounded-2xl border border-violet-400/20 bg-violet-400/10 px-4 py-3 text-sm text-violet-200">
                再生終了。次の話へ移動中...
              </div>
            ) : null}
          </div>

          <div className="px-5 py-8 sm:px-8 sm:py-10">
            {isSettingsOpen ? (
              <div className="rounded-[28px] border border-white/10 bg-black/20 p-6 text-sm leading-7 text-neutral-400">
                設定表示中。本文は一時的に隠れている。設定を閉じると元の位置へ戻る。
              </div>
            ) : (
              <>
                <div className={readingPaneClass}>
                  {!hideEffects && previewIllustrations.length > 0 ? (
                    <div className="mb-6 grid gap-4">
                      {previewIllustrations.map(renderIllustration)}
                    </div>
                  ) : null}

                  <article
                    className={`space-y-7 ${readingPaneTextClassName}`}
                    style={{
                      fontSize: `${fontScale}rem`,
                      lineHeight: lineHeightValue,
                      ...(hideEffects ? {} : effectTypographyStyle),
                    }}
                  >
                    {paragraphBlocks.length > 0 ? (
                      paragraphBlocks.map((block) => (
                        <p key={block.paragraphIndex}>
                          {block.segments.map((segment) => {
                            const isActive =
                              segment.index === visibleMarkerSentenceIndex;

                            return (
                              <span
                                key={segment.index}
                                ref={(node) => {
                                  sentenceRefs.current[segment.index] = node;
                                }}
                                className={[
                                  "inline rounded-md px-1 py-1 transition-all duration-200",
                                  isActive ? markerClass : "",
                                ].join(" ")}
                              >
                                {hideEffects
                                  ? segment.text
                                  : renderSentenceWithInlineMarks(
                                      segment.text,
                                      appliedEffectSettings.inlineMarks
                                    )}
                              </span>
                            );
                          })}
                        </p>
                      ))
                    ) : (
                      <p>本文がありません。</p>
                    )}
                  </article>

                  {!hideEffects && appliedEffectSettings.sceneCues.length > 0 ? (
                    <div className="mt-6 border-t border-white/10 pt-4">
                      <p className="text-xs tracking-[0.18em] text-neutral-500">
                        SCENE CUES
                      </p>
                      {activeSceneCueLabel ? (
                        <p className="mt-2 text-sm text-emerald-200">
                          現在発火中: {activeSceneCueLabel}
                        </p>
                      ) : null}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {appliedEffectSettings.sceneCues.map(renderSceneCue)}
                      </div>
                    </div>
                  ) : null}
                </div>

                {showComments && episodeId ? (
                  <EpisodeCommentSection
                    episodeId={episodeId}
                    loginHref={loginHref}
                  />
                ) : null}
              </>
            )}
          </div>
        </section>
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-white/10 bg-[#0a0a0a]/90 backdrop-blur">
        <div className="mx-auto max-w-3xl px-4 py-3 sm:px-6">
          {!isNarrationStopped ? (
            <div className="rounded-3xl border border-white/10 bg-black/20 p-4">
              <div className="flex items-center justify-between gap-3 text-sm text-neutral-300">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>

              <input
                type="range"
                min={0}
                max={duration || 0}
                step={0.1}
                value={Math.min(currentTime, duration || 0)}
                onChange={handleSliderChange}
                disabled={!canPlayAudio}
                className="mt-3 w-full accent-white disabled:opacity-40"
              />
            </div>
          ) : null}

          {!isNarrationStopped ? (
            <div className="mt-3 grid w-full grid-cols-7 gap-2">
              <FooterActionButton
                label="栞"
                disabled={false}
                onClick={handleSaveBookmark}
              />

              <FooterPlaybackRateControl
                value={playbackRate}
                onDecrease={handleDecreasePlaybackRate}
                onIncrease={handleIncreasePlaybackRate}
              />

              <FooterActionButton
                label="前話"
                disabled={!hasPrevEpisode || isAdvancing}
                onClick={() => {
                  void handleMovePrev();
                }}
              />

              <FooterActionButton
                label={isPlaying ? "停止" : "再生"}
                disabled={!canPlayAudio}
                accent
                onClick={() => {
                  void handleTogglePlay();
                }}
              />

              <FooterActionButton
                label="次話"
                disabled={!hasNextEpisode || isAdvancing}
                onClick={() => {
                  void handleMoveNext();
                }}
              />

              <FooterActionButton
                label={autoFollow ? "自動追尾\nON" : "自動追尾"}
                disabled={autoFollow || estimatedSentenceIndex < 0}
                active={autoFollow}
                onClick={handleEnableAutoFollow}
              />

              <FooterActionButton
                label="設定"
                disabled={false}
                active={isSettingsOpen}
                onClick={handleToggleSettings}
              />
            </div>
          ) : (
            <div className="mt-3 grid w-full grid-cols-4 gap-2">
              <FooterActionButton
                label="栞"
                disabled={false}
                onClick={handleSaveBookmark}
              />

              <FooterActionButton
                label="前話"
                disabled={!hasPrevEpisode || isAdvancing}
                onClick={() => {
                  void handleMovePrev();
                }}
              />

              <FooterActionButton
                label="次話"
                disabled={!hasNextEpisode || isAdvancing}
                onClick={() => {
                  void handleMoveNext();
                }}
              />

              <FooterActionButton
                label="設定"
                disabled={false}
                active={isSettingsOpen}
                onClick={handleToggleSettings}
              />
            </div>
          )}
        </div>
      </div>
    </main>
  );
}