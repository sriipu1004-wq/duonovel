"use client";

import Image from "next/image";
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
  buildSegments,
  buildTypographyStyle,
  renderIllustration,
  renderSegment,
  renderTextWithAozoraRuby,
} from "@/features/effects/EffectPreviewRenderer";
import BgmController from "@/features/playback/BgmController";
import EpisodeCommentSection from "@/features/comment/EpisodeCommentSection";
import {
  trackRecordingPlayStartOnce,
  trackSeriesViewOnce,
} from "@/lib/popularityEvents";
import {
  usePlayLogPersistence,
  type ReadResumeState,
} from "@/hooks/usePlayLogPersistence";
import type { BgmSettings } from "@/lib/bgm/bgmSettings";
import {
  emptyEffectSettings,
  type EffectSettings,
} from "@/lib/effects/effectSettings";
import {
  buildContentBlocks,
  buildSceneBreakRuntimeList,
  buildSceneCueRuntimeList,
  buildSentenceTimestampRuntimeList,
  resolveActiveSentenceIndex,
} from "@/lib/effects/effectTextLayout";
import {
  buildNemoAlignedParagraphBlocks,
  normalizeComparableSentenceText,
} from "@/lib/recording/humanTimingShared";
import { concatNemoWavs } from "@/lib/recording/nemoWav";

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
  generatedSentenceTimings?: GeneratedSentenceTiming[];
  generatedAudioSegments?: GeneratedAudioSegment[];
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

const PLAYER_ICON_PATHS = {
  settings: "/player-icons/settings.png",
  stop: "/player-icons/stop.png",
  play: "/player-icons/play.png",
  next: "/player-icons/next.png",
  prev: "/player-icons/prev.png",
  bookmarkFilled: "/player-icons/bookmark-filled.png",
  bookmark: "/player-icons/bookmark.png",
} as const;

type GeneratedSentenceTiming = {
  sentenceIndex: number;
  timeSeconds: number;
  durationSeconds: number;
  targetText: string;
  spokenText: string;
  timingSource?: "aligned_word" | "aligned_segment" | "estimated";
  matchConfidence?: number;
};

type GeneratedAudioSegment = {
  segmentIndex: number;
  startTimeSeconds: number;
  durationSeconds: number;
  audioPublicUrl: string;
};

function resolveActiveSentenceIndexFromGeneratedTimings(args: {
  currentTime: number;
  generatedSentenceTimings: GeneratedSentenceTiming[];
}): number {
  const { currentTime, generatedSentenceTimings } = args;

  if (generatedSentenceTimings.length === 0) {
    return -1;
  }

  for (let index = 0; index < generatedSentenceTimings.length; index += 1) {
    const currentTiming = generatedSentenceTimings[index];
    const nextTiming = generatedSentenceTimings[index + 1] ?? null;

    const currentStart = currentTiming.timeSeconds;
    const currentEnd = nextTiming
      ? Math.max(currentStart, nextTiming.timeSeconds - 0.01)
      : currentStart + Math.max(currentTiming.durationSeconds, 0.2);

    if (currentTime >= currentStart && currentTime < currentEnd) {
      return currentTiming.sentenceIndex;
    }

    if (nextTiming && currentTime < nextTiming.timeSeconds) {
      break;
    }
  }

  const lastTiming = generatedSentenceTimings[generatedSentenceTimings.length - 1];
  return currentTime >= lastTiming.timeSeconds ? lastTiming.sentenceIndex : -1;
}

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

function renderSentenceWithInlineMarks(
  text: string,
  inlineMarks: EffectSettings["inlineMarks"]
) {
  return buildSegments(text, inlineMarks).map((segment, index) =>
    renderSegment(segment, index)
  );
}

function FooterActionButton({
  label,
  disabled = false,
  active = false,
  accent = false,
  iconSrc,
  onClick,
}: {
  label: string;
  disabled?: boolean;
  active?: boolean;
  accent?: boolean;
  iconSrc?: string;
  onClick?: () => void;
}) {
  const isIconButton = Boolean(iconSrc);

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={[
        "flex h-12 w-full items-center justify-center rounded-2xl px-2 text-center text-[10px] font-medium leading-tight transition sm:text-sm",
        isIconButton
          ? [
              "border-0 bg-transparent shadow-none",
              disabled
                ? "opacity-35"
                : active
                  ? "bg-sky-50/70"
                  : accent
                    ? "bg-transparent"
                    : "bg-transparent hover:bg-neutral-50/70",
            ].join(" ")
          : accent
            ? "border border-black/10 bg-neutral-200 text-black hover:bg-neutral-300 disabled:bg-neutral-100 disabled:text-neutral-400"
            : active
              ? "border border-sky-200 bg-sky-50 text-black"
              : disabled
                ? "border border-black/10 bg-neutral-100 text-neutral-400"
                : "border border-black/10 bg-white text-black hover:bg-neutral-50",
      ].join(" ")}
    >
      {iconSrc ? (
        <Image
          src={iconSrc}
          alt=""
          width={28}
          height={28}
          className={[
            "h-7 w-7 object-contain",
            disabled ? "opacity-35" : "opacity-80",
          ].join(" ")}
        />
      ) : (
        <span className="whitespace-pre-line">{label}</span>
      )}
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
    <div className="flex h-12 w-full overflow-hidden rounded-2xl border border-black/10 bg-white">
      <button
        type="button"
        onClick={onDecrease}
        disabled={atMin}
        className="flex w-1/4 items-center justify-center border-r border-black/10 text-sm text-black transition hover:bg-neutral-50 disabled:text-neutral-400 disabled:hover:bg-transparent"
      >
        −
      </button>

      <div className="flex flex-1 items-center justify-center text-[10px] font-medium text-black sm:text-sm">
        {formatPlaybackRate(value)}
      </div>

      <button
        type="button"
        onClick={onIncrease}
        disabled={atMax}
        className="flex w-1/4 items-center justify-center border-l border-black/10 text-sm text-black transition hover:bg-neutral-50 disabled:text-neutral-400 disabled:hover:bg-transparent"
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
        "rounded-full border px-4 py-2 text-sm font-medium transition",
        active
          ? "border-sky-200 bg-sky-50 text-black"
          : "border-black/10 bg-white text-neutral-700 hover:bg-neutral-50",
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
  generatedSentenceTimings,  
  generatedAudioSegments,
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
  const autoFollowRafRef = useRef<number | null>(null);
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
  const [isCurrentEpisodeBookmarked, setIsCurrentEpisodeBookmarked] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isNarrationStopped, setIsNarrationStopped] = useState(false);
  const [assembledSegmentAudioUrl, setAssembledSegmentAudioUrl] = useState("");

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
  const [activeSceneBgmSrc, setActiveSceneBgmSrc] = useState<string | null>(
    null
  );
  const [activeSceneBgmTitle, setActiveSceneBgmTitle] = useState("");

  const appliedEffectSettings = useMemo(
    () => effectSettings ?? emptyEffectSettings(),
    [effectSettings]
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

  const paragraphBlocks = useMemo(() => buildNemoAlignedParagraphBlocks(safeBody), [safeBody]);

  const totalSentenceCount = useMemo(() => {
    return paragraphBlocks.reduce((sum, block) => sum + block.segments.length, 0);
  }, [paragraphBlocks]);

  const runtimeSceneCues = useMemo(
    () => buildSceneCueRuntimeList(paragraphBlocks, appliedEffectSettings.sceneCues),
    [paragraphBlocks, appliedEffectSettings.sceneCues]
  );

  const runtimeSceneBreaks = useMemo(
    () =>
      buildSceneBreakRuntimeList(
        paragraphBlocks,
        appliedEffectSettings.illustrations
      ),
    [paragraphBlocks, appliedEffectSettings.illustrations]
  );

  const contentBlocks = useMemo(
    () => buildContentBlocks(paragraphBlocks, runtimeSceneBreaks),
    [paragraphBlocks, runtimeSceneBreaks]
  );

  const runtimeSentenceTimestamps = useMemo(
    () =>
      buildSentenceTimestampRuntimeList(
        paragraphBlocks,
        appliedEffectSettings.sentenceTimestamps
      ),
    [paragraphBlocks, appliedEffectSettings.sentenceTimestamps]
  );

  const flatVisibleSentences = useMemo(
    () =>
      paragraphBlocks.flatMap((block) =>
        block.segments.map((segment) => ({
          sentenceIndex: segment.index,
          text: normalizeComparableSentenceText(segment.text),
        }))
      ),
    [paragraphBlocks]
  );

  const runtimeGeneratedSentenceTimings = useMemo(() => {
    return (generatedSentenceTimings ?? [])
      .filter(
        (item) =>
          Number.isFinite(item.sentenceIndex) &&
          item.sentenceIndex >= 0 &&
          Number.isFinite(item.timeSeconds) &&
          item.timeSeconds >= 0
      )
      .map((item) => ({
        sentenceIndex: item.sentenceIndex,
        timeSeconds: item.timeSeconds,
        durationSeconds:
          Number.isFinite(item.durationSeconds) && item.durationSeconds >= 0
            ? item.durationSeconds
            : 0,
        targetText:
          typeof item.targetText === "string" ? item.targetText : "",
        spokenText:
          typeof item.spokenText === "string" ? item.spokenText : "",
        timingSource:
          item.timingSource === "aligned_word" ||
          item.timingSource === "aligned_segment" ||
          item.timingSource === "estimated"
            ? item.timingSource
            : undefined,
        matchConfidence:
          typeof item.matchConfidence === "number" &&
          Number.isFinite(item.matchConfidence) &&
          item.matchConfidence >= 0
            ? item.matchConfidence
            : undefined,
      }))
      .sort((left, right) => {
        if (left.timeSeconds !== right.timeSeconds) {
          return left.timeSeconds - right.timeSeconds;
        }

        return left.sentenceIndex - right.sentenceIndex;
      });
  }, [generatedSentenceTimings]);

  const hasExplicitHumanAlignedTiming = useMemo(
    () =>
      runtimeGeneratedSentenceTimings.some(
        (item) =>
          item.timingSource === "aligned_word" ||
          item.timingSource === "aligned_segment"
      ),
    [runtimeGeneratedSentenceTimings]
  );  

  const mappedGeneratedSentenceTimings = useMemo(() => {
    if (runtimeGeneratedSentenceTimings.length === 0) {
      return [];
    }

    let searchStartIndex = 0;

    return runtimeGeneratedSentenceTimings.map((item) => {
      const normalizedCandidates = [
        normalizeComparableSentenceText(item.targetText),
        normalizeComparableSentenceText(item.spokenText),
      ].filter((value) => value.length > 0);

      if (normalizedCandidates.length === 0) {
        return item;
      }

      for (
        let visibleIndex = searchStartIndex;
        visibleIndex < flatVisibleSentences.length;
        visibleIndex += 1
      ) {
        const candidate = flatVisibleSentences[visibleIndex];

        if (!candidate.text) {
          continue;
        }

        const matched = normalizedCandidates.some(
          (target) =>
            candidate.text === target ||
            candidate.text.includes(target) ||
            target.includes(candidate.text)
        );

        if (!matched) {
          continue;
        }

        searchStartIndex = visibleIndex + 1;

        return {
          ...item,
          sentenceIndex: candidate.sentenceIndex,
        };
      }

      if (
        item.sentenceIndex >= 0 &&
        item.sentenceIndex < flatVisibleSentences.length
      ) {
        searchStartIndex = Math.max(searchStartIndex, item.sentenceIndex + 1);

        return {
          ...item,
          sentenceIndex: flatVisibleSentences[item.sentenceIndex].sentenceIndex,
        };
      }

      return item;
    });
  }, [flatVisibleSentences, runtimeGeneratedSentenceTimings]);

  const alignedGeneratedSentenceTimings = useMemo(() => {
    if (mappedGeneratedSentenceTimings.length === 0) {
      return [];
    }

    if (hasExplicitHumanAlignedTiming) {
      return mappedGeneratedSentenceTimings;
    }

    const lastTiming =
      mappedGeneratedSentenceTimings[mappedGeneratedSentenceTimings.length - 1];
    const estimatedDuration =
      lastTiming.timeSeconds + Math.max(lastTiming.durationSeconds, 0);

    if (!Number.isFinite(duration) || duration <= 0 || estimatedDuration <= 0) {
      return mappedGeneratedSentenceTimings;
    }

    const timingScale = duration / estimatedDuration;

    return mappedGeneratedSentenceTimings.map((item) => ({
      ...item,
      timeSeconds: item.timeSeconds * timingScale,
      durationSeconds: item.durationSeconds * timingScale,
    }));
  }, [duration, hasExplicitHumanAlignedTiming, mappedGeneratedSentenceTimings]);

  const expandedGeneratedSentenceTimings = useMemo(() => {
    if (flatVisibleSentences.length === 0) {
      return [];
    }

    if (alignedGeneratedSentenceTimings.length === 0) {
      return [];
    }

    if (hasExplicitHumanAlignedTiming) {
      return alignedGeneratedSentenceTimings.filter(
        (item) => item.timingSource !== "estimated"
      );
    }

    const knownTimings = [...alignedGeneratedSentenceTimings].sort(
      (left, right) => left.sentenceIndex - right.sentenceIndex
    );

    const exactTimingMap = new Map(
      knownTimings.map((item) => [item.sentenceIndex, item] as const)
    );

    const firstKnownTiming = knownTimings[0];
    const lastKnownTiming = knownTimings[knownTimings.length - 1];

    const averageStepSeconds =
      knownTimings.length > 1
        ? (lastKnownTiming.timeSeconds - firstKnownTiming.timeSeconds) /
          Math.max(
            1,
            lastKnownTiming.sentenceIndex - firstKnownTiming.sentenceIndex
          )
        : Math.max(firstKnownTiming.durationSeconds, 0.25);

    return flatVisibleSentences
      .map((visibleSentence) => {
        const exactTiming = exactTimingMap.get(visibleSentence.sentenceIndex);

        if (exactTiming) {
          return exactTiming;
        }

        let previousKnownTiming: (typeof knownTimings)[number] | null = null;
        let nextKnownTiming: (typeof knownTimings)[number] | null = null;

        for (const candidate of knownTimings) {
          if (candidate.sentenceIndex < visibleSentence.sentenceIndex) {
            previousKnownTiming = candidate;
            continue;
          }

          if (candidate.sentenceIndex > visibleSentence.sentenceIndex) {
            nextKnownTiming = candidate;
            break;
          }
        }

        let timeSeconds = 0;

        if (
          previousKnownTiming &&
          nextKnownTiming &&
          nextKnownTiming.sentenceIndex !== previousKnownTiming.sentenceIndex
        ) {
          const ratio =
            (visibleSentence.sentenceIndex - previousKnownTiming.sentenceIndex) /
            (nextKnownTiming.sentenceIndex - previousKnownTiming.sentenceIndex);

          timeSeconds =
            previousKnownTiming.timeSeconds +
            (nextKnownTiming.timeSeconds - previousKnownTiming.timeSeconds) *
              ratio;
        } else if (previousKnownTiming) {
          timeSeconds =
            previousKnownTiming.timeSeconds +
            averageStepSeconds *
              (visibleSentence.sentenceIndex - previousKnownTiming.sentenceIndex);
        } else if (nextKnownTiming) {
          timeSeconds = Math.max(
            0,
            nextKnownTiming.timeSeconds -
              averageStepSeconds *
                (nextKnownTiming.sentenceIndex - visibleSentence.sentenceIndex)
          );
        }

        return {
          sentenceIndex: visibleSentence.sentenceIndex,
          timeSeconds,
          durationSeconds: averageStepSeconds,
          targetText: visibleSentence.text,
          spokenText: visibleSentence.text,
          timingSource: "estimated" as const,
        };
      })
      .sort((left, right) => {
        if (left.timeSeconds !== right.timeSeconds) {
          return left.timeSeconds - right.timeSeconds;
        }

        return left.sentenceIndex - right.sentenceIndex;
      });
  }, [
    alignedGeneratedSentenceTimings,
    flatVisibleSentences,
    hasExplicitHumanAlignedTiming,
  ]);

  const activeSceneCueLabel = useMemo(
    () =>
      runtimeSceneCues.find((sceneCue) => sceneCue.id === activeSceneCueId)?.label ??
      "",
    [runtimeSceneCues, activeSceneCueId]
  );

const fallbackAudioStorageSrc = useMemo(() => {
  const value = (audioStoragePath ?? "").trim();

  if (!value) return "";
  if (value.startsWith("http://")) return value;
  if (value.startsWith("https://")) return value;
  if (value.startsWith("/")) return value;

  return "";
}, [audioStoragePath]);

const runtimeGeneratedAudioSegments = useMemo(() => {
  return (generatedAudioSegments ?? [])
    .filter(
      (segment) =>
        Number.isFinite(segment.segmentIndex) &&
        segment.segmentIndex >= 0 &&
        Number.isFinite(segment.startTimeSeconds) &&
        segment.startTimeSeconds >= 0 &&
        Number.isFinite(segment.durationSeconds) &&
        segment.durationSeconds >= 0 &&
        typeof segment.audioPublicUrl === "string" &&
        segment.audioPublicUrl.trim().length > 0
    )
    .map((segment) => ({
      segmentIndex: segment.segmentIndex,
      startTimeSeconds: segment.startTimeSeconds,
      durationSeconds: segment.durationSeconds,
      audioPublicUrl: segment.audioPublicUrl.trim(),
    }))
    .sort((left, right) => left.segmentIndex - right.segmentIndex);
}, [generatedAudioSegments]);

useEffect(() => {
  if (runtimeGeneratedAudioSegments.length <= 1) {
    setAssembledSegmentAudioUrl("");
    return;
  }

  let cancelled = false;
  let objectUrl = "";

  async function assembleSegmentedAudio(): Promise<void> {
    try {
      const wavSegments: Array<{
        wavBytes: Uint8Array;
        pauseAfterMs: number;
      }> = [];

      for (const segment of runtimeGeneratedAudioSegments) {
        const response = await fetch(segment.audioPublicUrl, {
          cache: "force-cache",
        });

        if (!response.ok) {
          throw new Error(`audio_segment_fetch_failed:${response.status}`);
        }

        const arrayBuffer = await response.arrayBuffer();

        wavSegments.push({
          wavBytes: new Uint8Array(arrayBuffer),
          pauseAfterMs: 0,
        });
      }

      const mergedWavBytes = concatNemoWavs(wavSegments);
      const blobBytes = Uint8Array.from(mergedWavBytes);
      const blob = new Blob([blobBytes.buffer], { type: "audio/wav" });
      objectUrl = URL.createObjectURL(blob);

      if (cancelled) {
        URL.revokeObjectURL(objectUrl);
        return;
      }

      setAssembledSegmentAudioUrl(objectUrl);
      setAudioError("");
    } catch (error) {
      if (cancelled) {
        return;
      }

      console.error("[EpisodePlayback] segmented audio assemble failed:", error);
      setAssembledSegmentAudioUrl("");
      setAudioError("音声ファイルの読み込みに失敗した");
      setIsPlaying(false);
      setIsAdvancing(false);
    }
  }

  void assembleSegmentedAudio();

  return () => {
    cancelled = true;

    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
    }
  };
}, [runtimeGeneratedAudioSegments]);

  const playableAudioSrc = useMemo(() => {
    if (runtimeGeneratedAudioSegments.length > 1) {
      return assembledSegmentAudioUrl.trim();
    }

    if (runtimeGeneratedAudioSegments.length === 1) {
      return runtimeGeneratedAudioSegments[0].audioPublicUrl;
    }

    return fallbackAudioStorageSrc;
  }, [
    assembledSegmentAudioUrl,
    runtimeGeneratedAudioSegments,
    fallbackAudioStorageSrc,
  ]);

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
    if (expandedGeneratedSentenceTimings.length > 0) {
      return resolveActiveSentenceIndexFromGeneratedTimings({
        currentTime,
        generatedSentenceTimings: expandedGeneratedSentenceTimings,
      });
    }

    return resolveActiveSentenceIndex({
      currentTime,
      duration,
      totalSentenceCount,
      sentenceTimestamps: runtimeSentenceTimestamps,
    });
  }, [
    currentTime,
    duration,
    totalSentenceCount,
    runtimeSentenceTimestamps,
    expandedGeneratedSentenceTimings,
  ]);

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
    restoreEnabled: !initialAutoPlay,
    persistEpisodeScopedLocal: false,
    onRestore: applyRestoredPlayLog,
    readLocalResumeState,
    writeLocalResumeState,
  });

    useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const raw = window.localStorage.getItem(`duonovel:bookmark:${seriesId}`);
      if (!raw) {
        setIsCurrentEpisodeBookmarked(false);
        return;
      }

      const parsed = JSON.parse(raw) as Partial<BookmarkData> | null;
      if (!parsed) {
        setIsCurrentEpisodeBookmarked(false);
        return;
      }

      const sameEpisode =
        Number(parsed.episodeNumber) === episodeNumber;
      const sameReader =
        (parsed.readerKey ?? "") === (selectedReaderKey ?? "") &&
        (parsed.readerName ?? "") === (selectedReaderName ?? "");

      setIsCurrentEpisodeBookmarked(sameEpisode && sameReader);
    } catch {
      setIsCurrentEpisodeBookmarked(false);
    }
  }, [seriesId, episodeNumber, selectedReaderKey, selectedReaderName]);

    useEffect(() => {
    if (!episodeId) return;

    void trackSeriesViewOnce({
      seriesId,
      episodeId,
      episodeNumber,
    });
  }, [seriesId, episodeId, episodeNumber]);

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
    return "rounded-[28px] border border-black/10 bg-white p-5 shadow-sm sm:p-6";
  }, []);

  const readingPaneTextClassName = "text-black";

  const markerClass =
    "bg-[repeating-linear-gradient(135deg,rgba(226,244,255,0.92)_0px,rgba(226,244,255,0.92)_10px,rgba(245,247,250,0.96)_10px,rgba(245,247,250,0.96)_20px)] ring-1 ring-sky-200";

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

      const rect = target.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const upperBound = viewportHeight * 0.28;
      const lowerBound = viewportHeight * 0.72;
      const targetCenter = rect.top + rect.height / 2;

      if (
        behavior === "smooth" &&
        targetCenter >= upperBound &&
        targetCenter <= lowerBound
      ) {
        return;
      }

      const absoluteTop = window.scrollY + rect.top;
      const desiredTop = Math.max(
        0,
        absoluteTop - viewportHeight * 0.38
      );

      ignoreScrollRef.current = true;

      if (autoFollowRafRef.current) {
        window.cancelAnimationFrame(autoFollowRafRef.current);
      }

      autoFollowRafRef.current = window.requestAnimationFrame(() => {
        window.scrollTo({
          top: desiredTop,
          behavior,
        });
        unlockProgrammaticScroll();
      });
    },
    [unlockProgrammaticScroll]
  );

  const resolveSentenceSeekTime = useCallback(
    (sentenceIndex: number): number | null => {
      const generatedTiming = alignedGeneratedSentenceTimings.find(
        (item) => item.sentenceIndex === sentenceIndex
      );

      if (generatedTiming) {
        return generatedTiming.timeSeconds;
      }

      if (duration <= 0 || totalSentenceCount <= 1) {
        return null;
      }

      return (sentenceIndex / Math.max(1, totalSentenceCount - 1)) * duration;
    },
    [alignedGeneratedSentenceTimings, duration, totalSentenceCount]
  );

  const handleJumpToSentence = useCallback(
    (sentenceIndex: number) => {
      const audio = audioRef.current;
      const nextTime = resolveSentenceSeekTime(sentenceIndex);

      if (!audio || !canPlayAudio || nextTime === null) {
        return;
      }

      const safeTime =
        duration > 0
          ? Math.min(Math.max(nextTime, 0), duration)
          : Math.max(nextTime, 0);

      audio.currentTime = safeTime;
      setCurrentTime(safeTime);
      setAutoFollow(true);
      scrollToSentence(sentenceIndex, "smooth");
    },
    [canPlayAudio, duration, resolveSentenceSeekTime, scrollToSentence]
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
      // noop
    }
  }, [seriesId, fontScale, lineHeightPreset, hideEffects]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        `duonovel:auto-advance:${seriesId}`,
        autoAdvanceToNext ? "true" : "false"
      );
    } catch {
      // noop
    }
  }, [seriesId, autoAdvanceToNext]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        `duonovel:playback-rate:${seriesId}`,
        String(playbackRate)
      );
    } catch {
      // noop
    }
  }, [seriesId, playbackRate]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        `duonovel:narration-volume:${seriesId}`,
        String(narrationVolume)
      );
    } catch {
      // noop
    }
  }, [seriesId, narrationVolume]);

  useEffect(() => {
    setFiredSceneCueIds({});
    setActiveSceneCueId(null);
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

      void trackRecordingPlayStartOnce({
        seriesId,
        episodeId: episodeId ?? null,
        episodeNumber,
        recordingId: recordingId ?? null,
      });
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
      if (autoFollowRafRef.current) {
        window.cancelAnimationFrame(autoFollowRafRef.current);
      }      
    };
  }, [playableAudioSrc, resetPlaybackViewState]);

  useEffect(() => {
    if (!isPlaying) return;
    if (!autoFollow) return;
    if (estimatedSentenceIndex < 0) return;
    if (isSettingsOpen) return;
    if (isNarrationStopped) return;
    if (suppressAutoFollowAfterSettingsRef.current) return;

      scrollToSentence(estimatedSentenceIndex, "smooth");
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

      setIsCurrentEpisodeBookmarked(true);
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
    <main className="min-h-screen bg-white text-black">
      <audio ref={audioRef} preload="metadata">
        {playableAudioSrc ? <source src={playableAudioSrc} /> : null}
      </audio>

      <div className="mx-auto w-full max-w-3xl px-4 pb-36 pt-6 sm:px-6">
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-neutral-500">
          {workIndexHref ? (
            <Link
              href={workIndexHref}
              className="rounded-full border border-black/10 bg-white px-4 py-2 transition hover:border-sky-200 hover:bg-sky-50 hover:text-black"
            >
              目次へ戻る
            </Link>
          ) : null}
        </div>

        <section className="overflow-hidden rounded-[32px] border border-black/10 bg-white shadow-sm">
          <div className="border-b border-black/10 px-5 py-6 sm:px-8">
            <p className="text-xs tracking-[0.22em] text-neutral-500">
              LIB READ READER
            </p>

            <p className="mt-3 text-sm text-neutral-600">{safeSeriesTitle}</p>
            <h1 className="mt-2 text-3xl font-bold leading-tight text-black sm:text-4xl">
              {safeEpisodeTitle}
            </h1>

            <div className="mt-5 flex flex-wrap gap-2">
              {selectedReaderName ? (
                <span className="rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sm text-black">
                  朗読者: {selectedReaderName}
                </span>
              ) : (
                <span className="rounded-full border border-black/10 bg-neutral-50 px-4 py-2 text-sm text-neutral-500">
                  朗読者未選択
                </span>
              )}

              <span
                className={[
                  "rounded-full px-4 py-2 text-sm",
                  recordingAvailable
                    ? "border border-sky-200 bg-sky-50 text-black"
                    : "border border-black/10 bg-neutral-50 text-neutral-500",
                ].join(" ")}
              >
                {recordingAvailable ? "この話の朗読あり" : "この話では朗読未登録"}
              </span>

              {resolvedBgmSrc ? (
                <span className="rounded-full border border-black/10 bg-neutral-50 px-4 py-2 text-sm text-neutral-700">
                  BGMあり
                </span>
              ) : null}

              {activeSceneCueLabel ? (
                <span className="rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sm text-black">
                  場面切替: {activeSceneCueLabel}
                </span>
              ) : null}
            </div>

            <div className="mt-4 rounded-2xl border border-black/10 bg-neutral-50 px-4 py-3 text-sm leading-7 text-neutral-600">
              本文を主役にして、目次へ戻る、前話 / 次話へ進む、朗読設定を開く、をそのまま行えるようにする。
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
                <section className="rounded-[28px] border border-black/10 bg-neutral-50 p-4">
                  <p className="text-xs tracking-[0.18em] text-neutral-500">NARRATION</p>
                  <h3 className="mt-2 text-lg font-semibold text-black">朗読</h3>

                  <div className="mt-4 rounded-2xl border border-black/10 bg-white p-4">
                    <div className="flex items-center justify-between gap-3 text-sm text-neutral-700">
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
                      className="mt-3 w-full accent-sky-300"
                    />
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-black/10 bg-white p-4">
                    <div>
                      <p className="text-sm text-neutral-700">次話自動再生</p>
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
                          ? "border-sky-200 bg-sky-50 text-black hover:bg-sky-100"
                          : "border-black/10 bg-white text-neutral-700 hover:bg-neutral-50",
                      ].join(" ")}
                    >
                      {autoAdvanceToNext ? "ON" : "OFF"}
                    </button>
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-black/10 bg-white p-4">
                    <div>
                      <p className="text-sm text-neutral-700">朗読停止</p>
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
                          ? "border-sky-200 bg-sky-50 text-black hover:bg-sky-100"
                          : "border-black/10 bg-white text-neutral-700 hover:bg-neutral-50",
                      ].join(" ")}
                    >
                      {isNarrationStopped ? "停止解除" : "停止"}
                    </button>
                  </div>
                </section>

                <section className="rounded-[28px] border border-black/10 bg-neutral-50 p-4">
                  <p className="text-xs tracking-[0.18em] text-neutral-500">DISPLAY</p>
                  <h3 className="mt-2 text-lg font-semibold text-black">表示演出</h3>

                  <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-black/10 bg-white p-4">
                    <div>
                      <p className="text-sm text-neutral-700">全演出を非表示</p>
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
                          ? "border-sky-200 bg-sky-50 text-black hover:bg-sky-100"
                          : "border-black/10 bg-white text-neutral-700 hover:bg-neutral-50",
                      ].join(" ")}
                    >
                      {hideEffects ? "ON" : "OFF"}
                    </button>
                  </div>

                  <div className="mt-4 rounded-2xl border border-black/10 bg-white p-4">
                    <div className="flex items-center justify-between gap-3 text-sm text-neutral-700">
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
                      className="mt-3 w-full accent-sky-300"
                    />
                  </div>

                  <div className="mt-4">
                    <p className="text-sm text-neutral-700">行間</p>
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

                <p className="text-sm leading-7 text-neutral-600">
                  設定表示中は本文を隠している。閉じると元のスクロール位置へ戻る。
                </p>
              </div>
            ) : null}

            {audioError ? (
              <div className="mt-4 rounded-2xl border border-black/10 bg-neutral-100 px-4 py-3 text-sm text-neutral-700">
                {audioError}
              </div>
            ) : null}

            {bookmarkMessage ? (
              <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-black">
                {bookmarkMessage}
              </div>
            ) : null}

            {isAdvancing ? (
              <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-black">
                再生終了。次の話へ移動中...
              </div>
            ) : null}
          </div>

          <div className="px-5 py-8 sm:px-8 sm:py-10">
            {isSettingsOpen ? (
              <div className="rounded-[28px] border border-black/10 bg-neutral-50 p-6 text-sm leading-7 text-neutral-600">
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
                    className={`space-y-7 ${readingPaneTextClassName} [&_*]:text-black`}
                    style={{
                      fontSize: `${fontScale}rem`,
                      lineHeight: lineHeightValue,
                      ...(hideEffects ? {} : effectTypographyStyle),
                      color: "#111111",
                    }}
                  >
                    {contentBlocks.length > 0 ? (
                      contentBlocks.map((block) => {
                        if (block.kind === "scene_break") {
                          if (hideEffects) {
                            return null;
                          }

                          return (
                            <div key={block.key} className="my-6 grid gap-4">
                              {block.illustrations.map(renderIllustration)}
                            </div>
                          );
                        }

                        return (
                          <p key={block.key}>
                            {block.sentences.map((segment) => {
                              const isActive =
                                segment.index === visibleMarkerSentenceIndex;

                              return (
                                <span
                                  key={segment.index}
                                  ref={(node) => {
                                    sentenceRefs.current[segment.index] = node;
                                  }}
                                  role={canPlayAudio ? "button" : undefined}
                                  tabIndex={canPlayAudio ? 0 : undefined}
                                  onClick={() => {
                                    handleJumpToSentence(segment.index);
                                  }}
                                  onKeyDown={(event) => {
                                    if (!canPlayAudio) return;
                                    if (event.key !== "Enter" && event.key !== " ") return;
                                    event.preventDefault();
                                    handleJumpToSentence(segment.index);
                                  }}
                                  className={[
                                    "inline rounded-md px-1 py-1 transition-all duration-200",
                                    canPlayAudio ? "cursor-pointer hover:bg-sky-50/70" : "",
                                    isActive ? markerClass : "",
                                  ].join(" ")}
                                >
                                  {hideEffects
                                    ? renderTextWithAozoraRuby(segment.text)
                                    : renderSentenceWithInlineMarks(
                                        segment.text,
                                        appliedEffectSettings.inlineMarks
                                      )}
                                </span>
                              );
                            })}
                          </p>
                        );
                      })
                    ) : (
                      <p>本文がありません。</p>
                    )}
                  </article>
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

      <div className="fixed inset-x-0 bottom-0 border-t border-black/10 bg-white/92 backdrop-blur">
        <div className="mx-auto max-w-3xl px-4 py-3 sm:px-6">
          {!isNarrationStopped ? (
            <div className="rounded-3xl border border-black/10 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3 text-sm text-neutral-700">
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
                className="mt-3 w-full accent-sky-300 disabled:opacity-40"
              />
            </div>
          ) : null}

          {!isNarrationStopped ? (
            <div className="mt-3 grid w-full grid-cols-7 gap-2">
              <FooterActionButton
                label={isCurrentEpisodeBookmarked ? "ブックマーク保存済み" : "ブックマーク"}
                iconSrc={
                  isCurrentEpisodeBookmarked
                    ? PLAYER_ICON_PATHS.bookmarkFilled
                    : PLAYER_ICON_PATHS.bookmark
                }
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
                iconSrc={PLAYER_ICON_PATHS.prev}
                disabled={!hasPrevEpisode || isAdvancing}
                onClick={() => {
                  void handleMovePrev();
                }}
              />

              <FooterActionButton
                label={isPlaying ? "停止" : "再生"}
                iconSrc={isPlaying ? PLAYER_ICON_PATHS.stop : PLAYER_ICON_PATHS.play}
                disabled={!canPlayAudio}
                accent
                onClick={() => {
                  void handleTogglePlay();
                }}
              />

              <FooterActionButton
                label="次話"
                iconSrc={PLAYER_ICON_PATHS.next}
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
                iconSrc={PLAYER_ICON_PATHS.settings}
                disabled={false}
                active={isSettingsOpen}
                onClick={handleToggleSettings}
              />
            </div>
          ) : (
            <div className="mt-3 grid w-full grid-cols-4 gap-2">
              <FooterActionButton
                label={isCurrentEpisodeBookmarked ? "ブックマーク保存済み" : "ブックマーク"}
                iconSrc={
                  isCurrentEpisodeBookmarked
                    ? PLAYER_ICON_PATHS.bookmarkFilled
                    : PLAYER_ICON_PATHS.bookmark
                }
                disabled={false}
                onClick={handleSaveBookmark}
              />

              <FooterActionButton
                label="前話"
                iconSrc={PLAYER_ICON_PATHS.prev}
                disabled={!hasPrevEpisode || isAdvancing}
                onClick={() => {
                  void handleMovePrev();
                }}
              />

              <FooterActionButton
                label="次話"
                iconSrc={PLAYER_ICON_PATHS.next}
                disabled={!hasNextEpisode || isAdvancing}
                onClick={() => {
                  void handleMoveNext();
                }}
              />

              <FooterActionButton
                label="設定"
                iconSrc={PLAYER_ICON_PATHS.settings}
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