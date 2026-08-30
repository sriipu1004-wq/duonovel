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
  normalizeAozoraTextForDisplay,
  normalizeAozoraTextForLayout,
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
  splitSentenceIntoDisplayClauses,
} from "@/lib/recording/humanTimingShared";
import { concatNemoWavs } from "@/lib/recording/nemoWav";
import {
  readNarrationStopped,
  writeNarrationStopped,
} from "@/lib/playback/webSpeechPreferences";

type EpisodePlaybackProps = {
  seriesId: string;
  episodeNumber: number;
  seriesTitle?: string;
  episodeTitle?: string;
  workAuthorName?: string;
  workEditorName?: string;
  body?: string | null;
  selectedReaderKey?: string;
  selectedReaderName?: string;
  readerAuthorHref?: string;
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
  autoNarrationStatusLabel?: string;
  autoNarrationStatusClassName?: string;
  stopNarrationByDefault?: boolean;
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

type DisplaySentenceUnit = {
  displayIndex: number;
  sentenceIndex: number;
  text: string;
  weight: number;
  isNumberOnly: boolean;
};

type DisplaySentenceTiming = {
  displayIndex: number;
  sentenceIndex: number;
  timeSeconds: number;
  durationSeconds: number;
};

function resolveActiveDisplayIndexFromGeneratedTimings(args: {
  currentTime: number;
  generatedSentenceTimings: DisplaySentenceTiming[];
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
      return currentTiming.displayIndex;
    }

    if (nextTiming && currentTime < nextTiming.timeSeconds) {
      break;
    }
  }

  const lastTiming = generatedSentenceTimings[generatedSentenceTimings.length - 1];
  return currentTime >= lastTiming.timeSeconds ? lastTiming.displayIndex : -1;
}

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

function readStoredNarrationVolume(seriesId: string): number {
  if (typeof window === "undefined") {
    return 1;
  }

  try {
    const raw =
      window.localStorage.getItem("duonovel:narration-volume") ??
      window.localStorage.getItem(`duonovel:narration-volume:${seriesId}`);
    if (!raw) {
      return 1;
    }

    return clampNarrationVolume(Number(raw));
  } catch {
    return 1;
  }
}

function readStoredNarrationStopped(
  seriesId: string,
  fallback: boolean
): boolean {
  if (typeof window === "undefined") return fallback;
  return readNarrationStopped(seriesId);
}

function writeStoredNarrationStopped(
  seriesId: string,
  value: boolean
): void {
  writeNarrationStopped(seriesId, value);
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

function splitIntoDisplayClauses(text: string): string[] {
  const normalized = text.trim();

  if (!normalized) {
    return [];
  }

  const matched = normalized.match(
    /[^、。！？!?…]+(?:[、。！？!?…]+[」』）】]*)?/gu
  );

  if (!matched || matched.length === 0) {
    return [normalized];
  }

  return matched.map((item) => item.trim()).filter(Boolean);
}

function isComparableNumberOnly(text: string): boolean {
  const normalized = normalizeComparableSentenceText(text).replace(
    /[.,，．:：\-─―—]/gu,
    ""
  );

  if (!normalized) {
    return false;
  }

  return /^[0-9０-９一二三四五六七八九十百千上下前後序章終幕ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩivxIVX]+$/u.test(
    normalized
  );
}

function getDisplayClauseWeight(text: string): number {
  const displayText = normalizeAozoraTextForDisplay(text).trim();

  const rawText = normalizeComparableSentenceText(displayText);
  const baseText = normalizeComparableSentenceText(
    replaceRubyWithBaseText(displayText)
  );
  const readingText = normalizeComparableSentenceText(
    replaceRubyWithReadingText(displayText)
  );

  const spokenLikeLength = Math.max(
    rawText.length,
    baseText.length,
    readingText.length,
    1
  );

  let pauseWeight = 0;

  if (/[。！？!?]+[」』）】]*$/u.test(displayText)) {
    pauseWeight = 10;
  } else if (/[、,，]+[」』）】]*$/u.test(displayText)) {
    pauseWeight = 5;
  } else if (/[.…]+[」』）】]*$/u.test(displayText)) {
    pauseWeight = 7;
  }

  return spokenLikeLength + pauseWeight;
}

function resolveActiveSentenceIndexFromWeightedDisplayUnits(args: {
  currentTime: number;
  duration: number;
  displaySentenceUnits: DisplaySentenceUnit[];
  totalSentenceCount: number;
}): number {
  const { currentTime, duration, displaySentenceUnits, totalSentenceCount } = args;

  if (!Number.isFinite(currentTime) || currentTime < 0) {
    return 0;
  }

  if (!Number.isFinite(duration) || duration <= 0) {
    return 0;
  }

  if (displaySentenceUnits.length === 0) {
    if (totalSentenceCount <= 0) {
      return 0;
    }

    const progress = Math.min(0.999999, Math.max(0, currentTime / duration));
    return Math.min(
      totalSentenceCount - 1,
      Math.max(0, Math.floor(progress * totalSentenceCount))
    );
  }

  const weightedUnits = displaySentenceUnits.map((unit) => {
    const rawWeight =
      Number.isFinite(unit.weight) && unit.weight > 0
        ? unit.weight
        : getDisplayClauseWeight(unit.text);

    return {
      sentenceIndex: unit.sentenceIndex,
      weight: Math.max(1, rawWeight),
    };
  });

  const totalWeight = weightedUnits.reduce(
    (sum, unit) => sum + unit.weight,
    0
  );

  if (!Number.isFinite(totalWeight) || totalWeight <= 0) {
    return weightedUnits[0]?.sentenceIndex ?? 0;
  }

  const progress = Math.min(0.999999, Math.max(0, currentTime / duration));
  const targetWeight = progress * totalWeight;

  let cumulativeWeight = 0;

  for (const unit of weightedUnits) {
    cumulativeWeight += unit.weight;

    if (targetWeight < cumulativeWeight) {
      return unit.sentenceIndex;
    }
  }

  return weightedUnits[weightedUnits.length - 1]?.sentenceIndex ?? 0;
}

function resolveActiveDisplayIndexFromTimings(args: {
  currentTime: number;
  timings: DisplaySentenceTiming[];
}): number {
  const { currentTime, timings } = args;

  if (timings.length === 0) {
    return -1;
  }

  for (let index = 0; index < timings.length; index += 1) {
    const currentTiming = timings[index];
    const nextTiming = timings[index + 1] ?? null;

    const currentStart = currentTiming.timeSeconds;
    const currentEnd = nextTiming
      ? Math.max(currentStart, nextTiming.timeSeconds - 0.01)
      : currentStart + Math.max(currentTiming.durationSeconds, 0.08);

    if (currentTime >= currentStart && currentTime < currentEnd) {
      return currentTiming.displayIndex;
    }
  }

  const lastTiming = timings[timings.length - 1];
  return currentTime >= lastTiming.timeSeconds ? lastTiming.displayIndex : -1;
}

function isStrongNormalizedSentenceMatch(
  visibleText: string,
  targetText: string
): boolean {
  if (!visibleText || !targetText) {
    return false;
  }

  if (visibleText === targetText) {
    return true;
  }

  const shorterLength = Math.min(visibleText.length, targetText.length);
  const longerLength = Math.max(visibleText.length, targetText.length);

  if (shorterLength < 2) {
    return false;
  }

  if (!(visibleText.includes(targetText) || targetText.includes(visibleText))) {
    return false;
  }

  return shorterLength / longerLength >= 0.72;
}

function buildLooseComparableCandidates(text: string): string[] {
  const normalizedDisplay = normalizeAozoraTextForDisplay(text);

  const baseText = replaceRubyWithBaseText(normalizedDisplay);
  const readingText = replaceRubyWithReadingText(normalizedDisplay);

  const baseClauses = splitSentenceIntoDisplayClauses(baseText);
  const readingClauses = splitSentenceIntoDisplayClauses(readingText);

  return Array.from(
    new Set(
      [
        baseText,
        readingText,
        ...baseClauses,
        ...readingClauses,
      ]
        .map((part) => normalizeComparableSentenceText(part))
        .filter(
          (part) => part.length > 0 && !isComparableNumberOnly(part)
        )
    )
  );
}

const INLINE_RUBY_WITH_PIPE_PATTERN =
  /｜([^《》\r\n]+)《([^《》\r\n]+)》/gu;

const INLINE_RUBY_PATTERN =
  /([一-龯々〆ヵヶ〓]+)《([^《》\r\n]+)》/gu;

function replaceRubyWithBaseText(text: string): string {
  return text
    .replace(INLINE_RUBY_WITH_PIPE_PATTERN, "$1")
    .replace(INLINE_RUBY_PATTERN, "$1");
}

function replaceRubyWithReadingText(text: string): string {
  return text
    .replace(INLINE_RUBY_WITH_PIPE_PATTERN, "$2")
    .replace(INLINE_RUBY_PATTERN, "$2");
}

function computeLooseMatchScore(source: string, target: string): number {
  if (!source || !target) {
    return 0;
  }

  if (source === target) {
    return 1;
  }

  const shorterLength = Math.min(source.length, target.length);
  const longerLength = Math.max(source.length, target.length);

  if (shorterLength <= 1) {
    return 0;
  }

  if (source.includes(target) || target.includes(source)) {
    return shorterLength / longerLength;
  }

  const sourceCounts = new Map<string, number>();

  for (const char of source) {
    sourceCounts.set(char, (sourceCounts.get(char) ?? 0) + 1);
  }

  let commonCount = 0;

  for (const char of target) {
    const remaining = sourceCounts.get(char) ?? 0;
    if (remaining <= 0) {
      continue;
    }

    commonCount += 1;
    sourceCounts.set(char, remaining - 1);
  }

  return commonCount / longerLength;
}

function findNextTrackableVisibleIndex(
  items: Array<{
    sentenceIndex: number;
    text: string;
    candidates: string[];
    isNumberOnly: boolean;
  }>,
  startIndex: number
): number | null {
  for (let index = Math.max(0, startIndex); index < items.length; index += 1) {
    const item = items[index];

    if (item.isNumberOnly) {
      continue;
    }

    if (item.candidates.length === 0) {
      continue;
    }

    return index;
  }

  return null;
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

const GLOBAL_DISPLAY_PREFERENCE_KEY = "duonovel:display";
const GLOBAL_AUTO_ADVANCE_KEY = "duonovel:auto-advance";
const GLOBAL_MARKER_VISIBLE_KEY = "duonovel:marker-visible";

function readStoredGlobalDisplayPreference(seriesId: string): DisplayPreference {
  const fallback = readStoredDisplayPreference(seriesId);

  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(GLOBAL_DISPLAY_PREFERENCE_KEY);
    if (!raw) {
      return fallback;
    }

    const parsed = JSON.parse(raw) as Partial<DisplayPreference> | null;
    if (!parsed) {
      return fallback;
    }

    return {
      ...fallback,
      ...parsed,
    };
  } catch {
    return fallback;
  }
}

function readStoredGlobalAutoAdvancePreference(seriesId: string): boolean {
  const fallback = readStoredAutoAdvancePreference(seriesId);

  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(GLOBAL_AUTO_ADVANCE_KEY);
    if (raw === "true") {
      return true;
    }

    if (raw === "false") {
      return false;
    }

    return fallback;
  } catch {
    return fallback;
  }
}

function readStoredGlobalMarkerVisible(): boolean {
  if (typeof window === "undefined") {
    return true;
  }

  try {
    const raw = window.localStorage.getItem(GLOBAL_MARKER_VISIBLE_KEY);

    if (raw === "false") {
      return false;
    }

    return true;
  } catch {
    return true;
  }
}

export default function EpisodePlayback({
  seriesId,
  episodeId,
  recordingId,
  episodeNumber,
  seriesTitle,
  episodeTitle,
  workAuthorName,
  workEditorName,
  body,
  selectedReaderKey,
  selectedReaderName,
  readerAuthorHref,
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
  stopNarrationByDefault = false,
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
  const hasTrackedRecordingPlayRef = useRef(false);

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
  const [isCurrentEpisodeBookmarked, setIsCurrentEpisodeBookmarked] =
    useState(false);
  const [isBookmarkPanelExpanded, setIsBookmarkPanelExpanded] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isNarrationStopped, setIsNarrationStopped] = useState(() =>
    readStoredNarrationStopped(seriesId, stopNarrationByDefault)
  );
  const [assembledSegmentAudioUrl, setAssembledSegmentAudioUrl] = useState("");

  const [useSegmentedAudioFallback, setUseSegmentedAudioFallback] =
    useState(false);  

  const [displayPreference, setDisplayPreference] = useState<DisplayPreference>(
    () => readStoredGlobalDisplayPreference(seriesId)
  );
  const [autoAdvanceToNext, setAutoAdvanceToNext] = useState<boolean>(() =>
    readStoredGlobalAutoAdvancePreference(seriesId)
  );
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [narrationVolume, setNarrationVolume] = useState<number>(() =>
    readStoredNarrationVolume(seriesId)
  );
  const [showMarker, setShowMarker] = useState<boolean>(() =>
    readStoredGlobalMarkerVisible()
  );

  const showNarrationControls =
    !isNarrationStopped && recordingAvailable;

  useEffect(() => {
    if (!stopNarrationByDefault) {
      return;
    }

    setIsNarrationStopped(true);
    writeStoredNarrationStopped(seriesId, true);
    setIsPlaying(false);

    const audio = audioRef.current;
    if (audio) {
      audio.pause();
    }
  }, [seriesId, stopNarrationByDefault]);

  useEffect(() => {
    writeStoredNarrationStopped(seriesId, isNarrationStopped);
  }, [seriesId, isNarrationStopped]);

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

  const safeWorkAuthorName =
    typeof workAuthorName === "string" && workAuthorName.trim().length > 0
      ? workAuthorName.trim()
      : "";

  const safeWorkEditorName =
    typeof workEditorName === "string" && workEditorName.trim().length > 0
      ? workEditorName.trim()
      : "";

  const safeBody =
    typeof body === "string" && body.trim().length > 0
      ? body
      : "本文がまだ登録されていません。";

  const layoutBody = useMemo(
    () => normalizeAozoraTextForLayout(safeBody),
    [safeBody]
  );

  const paragraphBlocks = useMemo(
    () => buildNemoAlignedParagraphBlocks(layoutBody),
    [layoutBody]
  );

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
        block.segments.map((segment) => {
          const baseText = replaceRubyWithBaseText(
            normalizeAozoraTextForDisplay(segment.text)
          );
          const normalizedText = normalizeComparableSentenceText(baseText);

          return {
            sentenceIndex: segment.index,
            text: normalizedText,
            candidates: buildLooseComparableCandidates(segment.text),
            isNumberOnly: isComparableNumberOnly(normalizedText),
          };
        })
      ),
    [paragraphBlocks]
  );

  const displaySentenceUnits = useMemo<DisplaySentenceUnit[]>(() => {
    let nextDisplayIndex = 0;

    return paragraphBlocks.flatMap((block) =>
      block.segments.flatMap((segment) => {
        const clauses = splitIntoDisplayClauses(segment.text);
        const sourceClauses = clauses.length > 0 ? clauses : [segment.text];

        return sourceClauses.map((text) => {
          const normalized = normalizeComparableSentenceText(
            normalizeAozoraTextForDisplay(text)
          );

          return {
            displayIndex: nextDisplayIndex++,
            sentenceIndex: segment.index,
            text,
            weight: getDisplayClauseWeight(text),
            isNumberOnly: isComparableNumberOnly(normalized),
          };
        });
      })
    );
  }, [paragraphBlocks]);

  const displayUnitsBySentenceIndex = useMemo(() => {
    const next = new Map<number, DisplaySentenceUnit[]>();

    for (const unit of displaySentenceUnits) {
      const current = next.get(unit.sentenceIndex) ?? [];
      current.push(unit);
      next.set(unit.sentenceIndex, current);
    }

    return next;
  }, [displaySentenceUnits]);

  const sentenceToFirstDisplayIndexMap = useMemo(() => {
    const next = new Map<number, number>();

    for (const unit of displaySentenceUnits) {
      if (!next.has(unit.sentenceIndex)) {
        next.set(unit.sentenceIndex, unit.displayIndex);
      }
    }

    return next;
  }, [displaySentenceUnits]);

  const displayIndexToSentenceIndexMap = useMemo(() => {
    const next = new Map<number, number>();

    for (const unit of displaySentenceUnits) {
      next.set(unit.displayIndex, unit.sentenceIndex);
    }

    return next;
  }, [displaySentenceUnits]);  

  const sentenceInfoByIndex = useMemo(() => {
    const next = new Map<
      number,
      {
        text: string;
        normalizedText: string;
        isNumberOnly: boolean;
      }
    >();

    for (const block of paragraphBlocks) {
      for (const segment of block.segments) {
        const displayText = normalizeAozoraTextForDisplay(segment.text);
        const normalizedText = normalizeComparableSentenceText(displayText);

        next.set(segment.index, {
          text: segment.text,
          normalizedText,
          isNumberOnly: isComparableNumberOnly(normalizedText),
        });
      }
    }

    return next;
  }, [paragraphBlocks]);

  const sentenceIndexToVisibleOrder = useMemo(() => {
    const next = new Map<number, number>();

    flatVisibleSentences.forEach((item, index) => {
      next.set(item.sentenceIndex, index);
    });

    return next;
  }, [flatVisibleSentences]);

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

  const hasGeneratedNarrationTiming = useMemo(() => {
    return runtimeGeneratedSentenceTimings.length > 0;
  }, [runtimeGeneratedSentenceTimings]);

  const isHumanRecordingSelected = useMemo(() => {
    if (hasGeneratedNarrationTiming) {
      return false;
    }

    return recordingId !== null && recordingId !== undefined;
  }, [hasGeneratedNarrationTiming, recordingId]);

  const effectiveRuntimeGeneratedSentenceTimings = useMemo(() => {
    return isHumanRecordingSelected ? [] : runtimeGeneratedSentenceTimings;
  }, [isHumanRecordingSelected, runtimeGeneratedSentenceTimings]);  

  const interpolatedRuntimeSentenceTimestamps = useMemo(() => {
    if (runtimeSentenceTimestamps.length <= 1) {
      return runtimeSentenceTimestamps;
    }

    const next = [...runtimeSentenceTimestamps];

    for (let index = 0; index < runtimeSentenceTimestamps.length - 1; index += 1) {
      const currentTiming = runtimeSentenceTimestamps[index];
      const followingTiming = runtimeSentenceTimestamps[index + 1];

      const sentenceGap =
        followingTiming.sentenceIndex - currentTiming.sentenceIndex;

      if (sentenceGap <= 1) {
        continue;
      }

      if (sentenceGap > 10) {
        continue;
      }

      const timeGap = followingTiming.timeSeconds - currentTiming.timeSeconds;

      if (!Number.isFinite(timeGap) || timeGap <= 0.18) {
        continue;
      }

      const missingSentenceIndexes: number[] = [];

      for (
        let sentenceIndex = currentTiming.sentenceIndex + 1;
        sentenceIndex < followingTiming.sentenceIndex;
        sentenceIndex += 1
      ) {
        const info = sentenceInfoByIndex.get(sentenceIndex);

        if (!info) {
          continue;
        }

        if (info.isNumberOnly) {
          continue;
        }

        missingSentenceIndexes.push(sentenceIndex);
      }

      if (missingSentenceIndexes.length === 0) {
        continue;
      }

      const step = timeGap / (missingSentenceIndexes.length + 1);

      if (step < 0.05) {
        continue;
      }

      missingSentenceIndexes.forEach((sentenceIndex, offset) => {
        next.push({
          ...currentTiming,
          sentenceIndex,
          timeSeconds: currentTiming.timeSeconds + step * (offset + 1),
        });
      });
    }

    return next.sort((left, right) => {
      if (left.timeSeconds !== right.timeSeconds) {
        return left.timeSeconds - right.timeSeconds;
      }

      return left.sentenceIndex - right.sentenceIndex;
    });
  }, [runtimeSentenceTimestamps, sentenceInfoByIndex]);

  const humanDisplaySentenceTimeline = useMemo(() => {
    const ordered = [...interpolatedRuntimeSentenceTimestamps].sort((left, right) => {
      if (left.timeSeconds !== right.timeSeconds) {
        return left.timeSeconds - right.timeSeconds;
      }

      return left.sentenceIndex - right.sentenceIndex;
    });

    const next: typeof ordered = [];

    for (const timing of ordered) {
      if (!Number.isFinite(timing.timeSeconds) || timing.timeSeconds < 0) {
        continue;
      }

      if (!Number.isFinite(timing.sentenceIndex) || timing.sentenceIndex < 0) {
        continue;
      }

      const last = next[next.length - 1] ?? null;

      if (!last) {
        next.push(timing);
        continue;
      }

      if (timing.sentenceIndex <= last.sentenceIndex) {
        continue;
      }

      if (timing.timeSeconds <= last.timeSeconds) {
        continue;
      }

      next.push(timing);
    }

    return next;
  }, [interpolatedRuntimeSentenceTimestamps]);  

  const monotonicRuntimeSentenceAnchors = useMemo(() => {
    const ordered = [...runtimeSentenceTimestamps].sort((left, right) => {
      if (left.timeSeconds !== right.timeSeconds) {
        return left.timeSeconds - right.timeSeconds;
      }

      return left.sentenceIndex - right.sentenceIndex;
    });

    const next: typeof ordered = [];

    for (const timing of ordered) {
      if (!Number.isFinite(timing.timeSeconds) || timing.timeSeconds < 0) {
        continue;
      }

      if (!Number.isFinite(timing.sentenceIndex) || timing.sentenceIndex < 0) {
        continue;
      }

      const last = next[next.length - 1] ?? null;

      if (!last) {
        next.push(timing);
        continue;
      }

      if (timing.sentenceIndex <= last.sentenceIndex) {
        continue;
      }

      if (timing.timeSeconds <= last.timeSeconds) {
        continue;
      }

      const sentenceGap = timing.sentenceIndex - last.sentenceIndex;
      const timeGap = timing.timeSeconds - last.timeSeconds;

      if (timing.sentenceIndex <= 1 && timing.timeSeconds > 10) {
        continue;
      }

      if (timing.sentenceIndex <= 2 && timing.timeSeconds > 18) {
        continue;
      }

      if (timing.sentenceIndex <= 4 && timing.timeSeconds > 32) {
        continue;
      }

      if (sentenceGap <= 1 && timeGap > 12) {
        continue;
      }

      if (sentenceGap <= 2 && timeGap > 18) {
        continue;
      }

      if (sentenceGap <= 3 && timeGap > 24) {
        continue;
      }

      if (sentenceGap <= 5 && timeGap > 36) {
        continue;
      }

      if (sentenceGap >= 6 && timeGap < 1.2) {
        continue;
      }

      if (sentenceGap >= 10 && timeGap < 2.4) {
        continue;
      }

      next.push(timing);
    }

    return next;
  }, [runtimeSentenceTimestamps]);

  const interpolatedDisplaySentenceTimings = useMemo<DisplaySentenceTiming[]>(() => {
    if (displaySentenceUnits.length === 0) {
      return [];
    }

    const sentenceTimeline = isHumanRecordingSelected
      ? humanDisplaySentenceTimeline
      : monotonicRuntimeSentenceAnchors;

    if (sentenceTimeline.length === 0) {
      return [];
    }

    const next: DisplaySentenceTiming[] = [];

    const pushSentenceUnitsBetween = (
      sentenceIndex: number,
      startTimeSeconds: number,
      endTimeSeconds: number
    ) => {
      if (endTimeSeconds <= startTimeSeconds) {
        return;
      }

      const units = (displayUnitsBySentenceIndex.get(sentenceIndex) ?? []).filter(
        (unit) => !unit.isNumberOnly
      );

      if (units.length === 0) {
        return;
      }

      const totalDuration = endTimeSeconds - startTimeSeconds;
      const totalWeight = units.reduce((sum, unit) => sum + unit.weight, 0) || 1;

      let cursor = startTimeSeconds;

      units.forEach((unit, index) => {
        const isLast = index === units.length - 1;
        const sliceDuration = isLast
          ? Math.max(endTimeSeconds - cursor, 0.06)
          : Math.max((totalDuration * unit.weight) / totalWeight, 0.06);

        next.push({
          displayIndex: unit.displayIndex,
          sentenceIndex: unit.sentenceIndex,
          timeSeconds: cursor,
          durationSeconds: sliceDuration,
        });

        cursor += sliceDuration;
      });
    };

    const firstTiming = sentenceTimeline[0];

    if (firstTiming.timeSeconds > 0.02 && firstTiming.sentenceIndex > 0) {
      const leadingUnits = displaySentenceUnits.filter((unit) => {
        if (unit.isNumberOnly) {
          return false;
        }

        return unit.sentenceIndex < firstTiming.sentenceIndex;
      });

      if (leadingUnits.length > 0) {
        const totalWeight =
          leadingUnits.reduce((sum, unit) => sum + unit.weight, 0) || 1;

        let cursor = 0;

        leadingUnits.forEach((unit, index) => {
          const isLast = index === leadingUnits.length - 1;
          const sliceDuration = isLast
            ? Math.max(firstTiming.timeSeconds - cursor, 0.06)
            : Math.max(
                ((firstTiming.timeSeconds - 0) * unit.weight) / totalWeight,
                0.06
              );

          next.push({
            displayIndex: unit.displayIndex,
            sentenceIndex: unit.sentenceIndex,
            timeSeconds: cursor,
            durationSeconds: sliceDuration,
          });

          cursor += sliceDuration;
        });
      }
    }

    for (let index = 0; index < sentenceTimeline.length; index += 1) {
      const currentTiming = sentenceTimeline[index];
      const followingTiming = sentenceTimeline[index + 1] ?? null;

      const endTimeSeconds = followingTiming
        ? followingTiming.timeSeconds
        : Number.isFinite(duration) && duration > currentTiming.timeSeconds
          ? duration
          : currentTiming.timeSeconds + 0.12;

      pushSentenceUnitsBetween(
        currentTiming.sentenceIndex,
        currentTiming.timeSeconds,
        endTimeSeconds
      );
    }

    return next.sort((left, right) => {
      if (left.timeSeconds !== right.timeSeconds) {
        return left.timeSeconds - right.timeSeconds;
      }

      return left.displayIndex - right.displayIndex;
    });
  }, [
    isHumanRecordingSelected,
    humanDisplaySentenceTimeline,
    monotonicRuntimeSentenceAnchors,
    displaySentenceUnits,
    displayUnitsBySentenceIndex,
    duration,
  ]);

  const mappedGeneratedSentenceTimings = useMemo<GeneratedSentenceTiming[]>(() => {
    if (effectiveRuntimeGeneratedSentenceTimings.length === 0) {
      return [];
    }

    let searchStartIndex = 0;
    const mapped: GeneratedSentenceTiming[] = [];

    for (const item of effectiveRuntimeGeneratedSentenceTimings) {
      const directVisibleIndex =
        sentenceIndexToVisibleOrder.get(item.sentenceIndex) ?? null;

      if (directVisibleIndex !== null) {
        const directCandidate = flatVisibleSentences[directVisibleIndex];

        if (
          directCandidate &&
          !directCandidate.isNumberOnly &&
          directCandidate.candidates.length > 0
        ) {
          mapped.push({
            ...item,
            sentenceIndex: directCandidate.sentenceIndex,
            matchConfidence: 1,
          });

          searchStartIndex = Math.max(searchStartIndex, directVisibleIndex + 1);
          continue;
        }
      }

      const normalizedCandidates = Array.from(
        new Set([
          ...buildLooseComparableCandidates(item.targetText),
          ...buildLooseComparableCandidates(item.spokenText),
        ])
      ).filter((value) => value.length > 0 && !isComparableNumberOnly(value));

      let bestVisibleIndex: number | null = null;
      let bestScore = 0;

      if (normalizedCandidates.length > 0) {
        const candidateRanges: Array<{
          start: number;
          end: number;
          threshold: number;
        }> = [
          {
            start: Math.max(0, searchStartIndex - 4),
            end: Math.min(flatVisibleSentences.length, searchStartIndex + 48),
            threshold: 0.14,
          },
          {
            start: Math.max(0, searchStartIndex - 14),
            end: Math.min(flatVisibleSentences.length, searchStartIndex + 120),
            threshold: 0.1,
          },
          {
            start: 0,
            end: flatVisibleSentences.length,
            threshold: 0.07,
          },
        ];

        for (const range of candidateRanges) {
          let rangeBestVisibleIndex: number | null = null;
          let rangeBestScore = 0;

          for (let visibleIndex = range.start; visibleIndex < range.end; visibleIndex += 1) {
            const candidate = flatVisibleSentences[visibleIndex];

            if (candidate.isNumberOnly || candidate.candidates.length === 0) {
              continue;
            }

            for (const target of normalizedCandidates) {
              for (const source of candidate.candidates) {
                const score = computeLooseMatchScore(source, target);

                if (score > rangeBestScore) {
                  rangeBestScore = score;
                  rangeBestVisibleIndex = visibleIndex;
                }
              }
            }
          }

          if (
            rangeBestVisibleIndex !== null &&
            rangeBestScore >= range.threshold
          ) {
            bestVisibleIndex = rangeBestVisibleIndex;
            bestScore = rangeBestScore;
            break;
          }

          if (rangeBestVisibleIndex !== null && rangeBestScore > bestScore) {
            bestVisibleIndex = rangeBestVisibleIndex;
            bestScore = rangeBestScore;
          }
        }
      }

      if (bestVisibleIndex === null) {
        const fallbackVisibleIndex = findNextTrackableVisibleIndex(
          flatVisibleSentences,
          searchStartIndex
        );

        if (fallbackVisibleIndex !== null) {
          bestVisibleIndex = fallbackVisibleIndex;
          bestScore = Math.max(bestScore, 0.05);
        }
      }

      if (bestVisibleIndex === null) {
        continue;
      }

      const matchedSentence = flatVisibleSentences[bestVisibleIndex];
      searchStartIndex = Math.max(searchStartIndex, bestVisibleIndex + 1);

      mapped.push({
        ...item,
        sentenceIndex: matchedSentence.sentenceIndex,
        matchConfidence: bestScore,
      });
    }

    return mapped;
  }, [
    flatVisibleSentences,
    effectiveRuntimeGeneratedSentenceTimings,
    sentenceIndexToVisibleOrder,
  ]);

  const alignedGeneratedSentenceTimings = useMemo<GeneratedSentenceTiming[]>(() => {
    return mappedGeneratedSentenceTimings;
  }, [mappedGeneratedSentenceTimings]);

  const expandedGeneratedSentenceTimings = useMemo<GeneratedSentenceTiming[]>(() => {
    if (alignedGeneratedSentenceTimings.length === 0) {
      return [];
    }

    const visibleSentenceIndexSet = new Set(
      flatVisibleSentences.map((item) => item.sentenceIndex)
    );

    return alignedGeneratedSentenceTimings.filter((item) =>
      visibleSentenceIndexSet.has(item.sentenceIndex)
    );
  }, [alignedGeneratedSentenceTimings, flatVisibleSentences]);

  const activeSceneCueLabel = useMemo(
    () =>
      runtimeSceneCues.find((sceneCue) => sceneCue.id === activeSceneCueId)?.label ??
      "",
    [runtimeSceneCues, activeSceneCueId]
  );

  const displayGeneratedSentenceTimings = useMemo<DisplaySentenceTiming[]>(() => {
    if (expandedGeneratedSentenceTimings.length === 0) {
      return [];
    }

    const next: DisplaySentenceTiming[] = [];

    for (const item of expandedGeneratedSentenceTimings) {
      const displayUnits =
        displayUnitsBySentenceIndex.get(item.sentenceIndex) ?? [];

      if (displayUnits.length === 0) {
        continue;
      }

      const totalWeight =
        displayUnits.reduce((sum, unit) => sum + unit.weight, 0) || 1;

      let consumed = 0;

      displayUnits.forEach((unit, index) => {
        const isLast = index === displayUnits.length - 1;
        const baseDuration = Math.max(item.durationSeconds, 0.12);
        const sliceDuration = isLast
          ? Math.max(baseDuration - consumed, 0.08)
          : Math.max((baseDuration * unit.weight) / totalWeight, 0.08);

        next.push({
          displayIndex: unit.displayIndex,
          sentenceIndex: item.sentenceIndex,
          timeSeconds: item.timeSeconds + consumed,
          durationSeconds: sliceDuration,
        });

        consumed += sliceDuration;
      });
    }

    return next;
  }, [expandedGeneratedSentenceTimings, displayUnitsBySentenceIndex]);

  const fullEpisodeDisplaySentenceTimings = useMemo<DisplaySentenceTiming[]>(() => {
    const sourceUnits = displaySentenceUnits.filter((unit) => !unit.isNumberOnly);

    if (sourceUnits.length === 0) {
      return [];
    }

    const safeDuration =
      Number.isFinite(duration) && duration > 0
        ? duration
        : Math.max(sourceUnits.length * 0.8, totalSentenceCount * 1.2, 1);

    const totalWeight =
      sourceUnits.reduce((sum, unit) => sum + unit.weight, 0) || 1;

    const next: DisplaySentenceTiming[] = [];
    let cursor = 0;

    sourceUnits.forEach((unit, index) => {
      const isLast = index === sourceUnits.length - 1;
      const sliceDuration = isLast
        ? Math.max(safeDuration - cursor, 0.06)
        : Math.max((safeDuration * unit.weight) / totalWeight, 0.06);

      next.push({
        displayIndex: unit.displayIndex,
        sentenceIndex: unit.sentenceIndex,
        timeSeconds: cursor,
        durationSeconds: sliceDuration,
      });

      cursor += sliceDuration;
    });

    return next;
  }, [displaySentenceUnits, duration, totalSentenceCount]);

  const shouldUseFullEpisodeFallback = useMemo(() => {
    if (displayGeneratedSentenceTimings.length > 0) {
      return false;
    }

    const anchors = monotonicRuntimeSentenceAnchors;

    if (anchors.length < 2) {
      return true;
    }

    const first = anchors[0];
    const last = anchors[anchors.length - 1];

    if (first.timeSeconds > 4) {
      return true;
    }

    if (first.sentenceIndex > 1) {
      return true;
    }

    const anchorCoverageRatio =
      totalSentenceCount > 0 ? (last.sentenceIndex + 1) / totalSentenceCount : 0;

    if (anchorCoverageRatio < 0.12) {
      return true;
    }

    return false;
  }, [
    displayGeneratedSentenceTimings,
    monotonicRuntimeSentenceAnchors,
    totalSentenceCount,
  ]);  

  const shouldForceHumanFullEpisodeFallback = useMemo(() => {
    if (!isHumanRecordingSelected) {
      return false;
    }

    return monotonicRuntimeSentenceAnchors.length === 0;
  }, [
    isHumanRecordingSelected,
    monotonicRuntimeSentenceAnchors,
  ]);

const fallbackAudioStorageSrc = useMemo(() => {
  const value = (audioStoragePath ?? "").trim();

  if (!value) return "";
  if (value.startsWith("http://")) return value;
  if (value.startsWith("https://")) return value;
  if (value.startsWith("/")) return value;

  return "";
}, [audioStoragePath]);

const prefersSegmentedAudioForMultipart = useMemo(() => {
  return /\.part\d+\.wav(?:\?|$)/i.test(fallbackAudioStorageSrc);
}, [fallbackAudioStorageSrc]);

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
  setUseSegmentedAudioFallback(prefersSegmentedAudioForMultipart);
}, [
  episodeId,
  fallbackAudioStorageSrc,
  runtimeGeneratedAudioSegments.length,
  prefersSegmentedAudioForMultipart,
]);

useEffect(() => {
  const shouldAssembleSegmentedAudio =
    useSegmentedAudioFallback ||
    prefersSegmentedAudioForMultipart ||
    fallbackAudioStorageSrc.length === 0;

  if (!shouldAssembleSegmentedAudio) {
    setAssembledSegmentAudioUrl("");
    return;
  }

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
}, [
  runtimeGeneratedAudioSegments,
  fallbackAudioStorageSrc,
  useSegmentedAudioFallback,
  prefersSegmentedAudioForMultipart,
]);

  const playableAudioSrc = useMemo(() => {
    const shouldPreferSegmentedAudio =
      useSegmentedAudioFallback || prefersSegmentedAudioForMultipart;

    if (!shouldPreferSegmentedAudio && fallbackAudioStorageSrc.length > 0) {
      return fallbackAudioStorageSrc;
    }

    if (runtimeGeneratedAudioSegments.length > 1) {
      return assembledSegmentAudioUrl.trim();
    }

    if (runtimeGeneratedAudioSegments.length === 1) {
      return runtimeGeneratedAudioSegments[0].audioPublicUrl;
    }

    return fallbackAudioStorageSrc;
  }, [
    useSegmentedAudioFallback,
    prefersSegmentedAudioForMultipart,
    assembledSegmentAudioUrl,
    runtimeGeneratedAudioSegments,
    fallbackAudioStorageSrc,
  ]);

  useEffect(() => {
    setPlaybackRate(1);
  }, [episodeId, selectedReaderKey, selectedReaderName]);  

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

  const canOpenSettings = true;

  useEffect(() => {
    if (!canOpenSettings && isSettingsOpen) {
      setIsSettingsOpen(false);
    }
  }, [canOpenSettings, isSettingsOpen]);

  const estimatedSentenceIndex = useMemo(() => {
    if (
      !isHumanRecordingSelected &&
      expandedGeneratedSentenceTimings.length > 0
    ) {
      return resolveActiveSentenceIndexFromGeneratedTimings({
        currentTime,
        generatedSentenceTimings: expandedGeneratedSentenceTimings,
      });
    }

    if (isHumanRecordingSelected) {
      const timings =
        !shouldForceHumanFullEpisodeFallback &&
        interpolatedDisplaySentenceTimings.length > 0
          ? interpolatedDisplaySentenceTimings
          : fullEpisodeDisplaySentenceTimings;

      const activeDisplayIndex = resolveActiveDisplayIndexFromTimings({
        currentTime,
        timings,
      });

      if (activeDisplayIndex < 0) {
        return 0;
      }

      return displayIndexToSentenceIndexMap.get(activeDisplayIndex) ?? 0;
    }

    if (appliedEffectSettings.sentenceTimestamps.length > 0) {
      return resolveActiveSentenceIndex({
        currentTime,
        duration,
        totalSentenceCount,
        sentenceTimestamps: interpolatedRuntimeSentenceTimestamps,
        disableEstimatedFallback: true,
      });
    }

    return resolveActiveSentenceIndexFromWeightedDisplayUnits({
      currentTime,
      duration,
      displaySentenceUnits,
      totalSentenceCount,
    });
  }, [
    currentTime,
    duration,
    totalSentenceCount,
    interpolatedRuntimeSentenceTimestamps,
    expandedGeneratedSentenceTimings,
    appliedEffectSettings.sentenceTimestamps,
    shouldForceHumanFullEpisodeFallback,
    fullEpisodeDisplaySentenceTimings,
    interpolatedDisplaySentenceTimings,
    displayIndexToSentenceIndexMap,
    displaySentenceUnits,
    isHumanRecordingSelected,
  ]);

  const preferredDisplaySentenceTimings = useMemo(() => {
    if (
      !isHumanRecordingSelected &&
      displayGeneratedSentenceTimings.length > 0
    ) {
      return displayGeneratedSentenceTimings;
    }

    if (isHumanRecordingSelected) {
      if (
        !shouldForceHumanFullEpisodeFallback &&
        interpolatedDisplaySentenceTimings.length > 0
      ) {
        return interpolatedDisplaySentenceTimings;
      }

      return fullEpisodeDisplaySentenceTimings;
    }

    if (shouldUseFullEpisodeFallback) {
      return fullEpisodeDisplaySentenceTimings;
    }

    if (interpolatedDisplaySentenceTimings.length > 0) {
      return interpolatedDisplaySentenceTimings;
    }

    return fullEpisodeDisplaySentenceTimings;
  }, [
    displayGeneratedSentenceTimings,
    isHumanRecordingSelected,
    shouldForceHumanFullEpisodeFallback,
    shouldUseFullEpisodeFallback,
    fullEpisodeDisplaySentenceTimings,
    interpolatedDisplaySentenceTimings,
  ]);

  const visibleMarkerDisplayIndex = useMemo(() => {
    if (!showMarker) {
      return -1;
    }

    if (preferredDisplaySentenceTimings.length > 0) {
      const firstTiming = preferredDisplaySentenceTimings[0];

      if (currentTime < firstTiming.timeSeconds) {
        return 0;
      }

      return resolveActiveDisplayIndexFromTimings({
        currentTime,
        timings: preferredDisplaySentenceTimings,
      });
    }

    if (estimatedSentenceIndex < 0) {
      return 0;
    }

    return sentenceToFirstDisplayIndexMap.get(estimatedSentenceIndex) ?? 0;
  }, [
    showMarker,
    currentTime,
    preferredDisplaySentenceTimings,
    estimatedSentenceIndex,
    sentenceToFirstDisplayIndexMap,
  ]);

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

  const shouldPersistContinueReading = isBookmarkPanelExpanded;

  const { flushPlayLog: flushPlayLogInternal } = usePlayLogPersistence({
    seriesId,
    episodeId: episodeId ?? null,
    episodeNumber,
    recordingId: recordingId ?? null,
    currentTime,
    duration,
    markerIndex: estimatedSentenceIndex >= 0 ? estimatedSentenceIndex : 0,
    isFollowing: autoFollow,
    isPlaying: shouldPersistContinueReading && isPlaying,
    intervalMs: 4000,
    restoreEnabled: !initialAutoPlay,
    persistEpisodeScopedLocal: false,
    onRestore: applyRestoredPlayLog,
    readLocalResumeState,
    writeLocalResumeState,
  });

  const flushPlayLog = useCallback(
    async (reason: "pause" | "seek" | "episode-move") => {
      if (!shouldPersistContinueReading) {
        return;
      }

      await flushPlayLogInternal(reason);
    },
    [shouldPersistContinueReading, flushPlayLogInternal]
  );

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

      const sameEpisode = Number(parsed.episodeNumber) === episodeNumber;
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
    setIsBookmarkPanelExpanded(false);
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
    (displayIndex: number, behavior: ScrollBehavior = "smooth") => {
      const target = sentenceRefs.current[displayIndex];
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
      const desiredTop = Math.max(0, absoluteTop - viewportHeight * 0.38);

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

  const resolveDisplaySeekTime = useCallback(
    (displayIndex: number): number | null => {
      const displayTiming = preferredDisplaySentenceTimings.find(
        (item) => item.displayIndex === displayIndex
      );

      if (displayTiming) {
        return displayTiming.timeSeconds;
      }

      const mappedSentenceIndex =
        displayIndexToSentenceIndexMap.get(displayIndex);

      if (mappedSentenceIndex === undefined) {
        return null;
      }

      if (!isHumanRecordingSelected) {
        const generatedTiming = alignedGeneratedSentenceTimings.find(
          (item) => item.sentenceIndex === mappedSentenceIndex
        );

        if (generatedTiming) {
          return generatedTiming.timeSeconds;
        }
      }

      if (duration <= 0 || totalSentenceCount <= 1) {
        return null;
      }

      return (
        (mappedSentenceIndex / Math.max(1, totalSentenceCount - 1)) * duration
      );
    },
    [
      preferredDisplaySentenceTimings,
      displayIndexToSentenceIndexMap,
      isHumanRecordingSelected,
      alignedGeneratedSentenceTimings,
      duration,
      totalSentenceCount,
    ]
  );

  const handleJumpToDisplay = useCallback(
    (displayIndex: number) => {
      const audio = audioRef.current;
      const nextTime = resolveDisplaySeekTime(displayIndex);

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
      scrollToSentence(displayIndex, "smooth");
    },
    [canPlayAudio, duration, resolveDisplaySeekTime, scrollToSentence]
  );

  useEffect(() => {
    try {
      const payload: DisplayPreference = {
        fontScale,
        lineHeight: lineHeightPreset,
        hideEffects,
      };

      window.localStorage.setItem(
        GLOBAL_DISPLAY_PREFERENCE_KEY,
        JSON.stringify(payload)
      );
    } catch {
      // noop
    }
  }, [fontScale, lineHeightPreset, hideEffects]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        GLOBAL_AUTO_ADVANCE_KEY,
        autoAdvanceToNext ? "true" : "false"
      );
    } catch {
      // noop
    }
  }, [autoAdvanceToNext]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        GLOBAL_MARKER_VISIBLE_KEY,
        showMarker ? "true" : "false"
      );
    } catch {
      // noop
    }
  }, [showMarker]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        "duonovel:narration-volume",
        String(narrationVolume)
      );
    } catch {
      // noop
    }
  }, [narrationVolume]);

  useEffect(() => {
    setFiredSceneCueIds({});
    setActiveSceneCueId(null);
    setActiveSceneBgmSrc(null);
    setActiveSceneBgmTitle("");
    previousEstimatedSentenceIndexRef.current = -1;
  }, [episodeId, playableAudioSrc, bgmSrc, bgmTitle, appliedEffectSettings.sceneCues]);

  useEffect(() => {
    setIsNarrationStopped(stopNarrationByDefault);
  }, [episodeId, stopNarrationByDefault, selectedReaderKey, selectedReaderName]);

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
      const canFallbackToSegmentedAudio =
        !useSegmentedAudioFallback &&
        fallbackAudioStorageSrc.length > 0 &&
        runtimeGeneratedAudioSegments.length > 0;

      if (canFallbackToSegmentedAudio) {
        setUseSegmentedAudioFallback(true);
        setAudioError("");
        setIsPlaying(false);
        setIsAdvancing(false);
        return;
      }

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
    fallbackAudioStorageSrc,
    runtimeGeneratedAudioSegments.length,
    useSegmentedAudioFallback,    
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
    if (visibleMarkerDisplayIndex < 0) return;
    if (isSettingsOpen) return;
    if (isNarrationStopped) return;
    if (suppressAutoFollowAfterSettingsRef.current) return;

    scrollToSentence(visibleMarkerDisplayIndex, "smooth");
  }, [
    visibleMarkerDisplayIndex,
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
    if (visibleMarkerDisplayIndex < 0) return;
    if (isNarrationStopped) return;

    setAutoFollow(true);
    scrollToSentence(visibleMarkerDisplayIndex, "smooth");
  }

  function handleToggleAutoAdvance(): void {
    setAutoAdvanceToNext((prev) => !prev);
  }

  function handleToggleBookmarkPanel(): void {
    setIsBookmarkPanelExpanded((prev) => !prev);
  }

  function handleShowMarker(): void {
    setShowMarker(true);
  }

  function handleHideMarker(): void {
    setShowMarker(false);
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
    if (!canOpenSettings) {
      return;
    }

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
    const nextStopped = !isNarrationStopped;

    if (nextStopped && audio) {
      audio.pause();
    }

    setIsNarrationStopped(nextStopped);
    writeStoredNarrationStopped(seriesId, nextStopped);
    setIsPlaying(false);

    if (nextStopped) {
      void flushPlayLog("pause");
    }
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

        <section className="overflow-hidden rounded-[32px] border border-black/10 bg-white shadow-sm">
          <div className="border-b border-black/10 px-5 py-6 sm:px-8">
            <p className="text-xs tracking-[0.22em] text-neutral-500">
              LIB READ READER
            </p>

            {workIndexHref ? (
              <Link
                href={workIndexHref}
                className="mt-3 inline-flex text-sm text-neutral-600 transition hover:text-black"
              >
                {safeSeriesTitle}
              </Link>
            ) : (
              <p className="mt-3 text-sm text-neutral-600">{safeSeriesTitle}</p>
            )}
            <h1 className="mt-2 text-3xl font-bold leading-tight text-black sm:text-4xl">
              {safeEpisodeTitle}
            </h1>

            {safeWorkAuthorName ? (
              <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                <span className="inline-flex items-center gap-2">
                  <span className="text-neutral-500">作者</span>
                  <span className="font-semibold text-black">
                    {safeWorkAuthorName}
                  </span>
                </span>

                {safeWorkEditorName ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="text-neutral-500">編集</span>
                    <span className="font-semibold text-black">
                      {safeWorkEditorName}
                    </span>
                  </span>
                ) : null}
              </div>
            ) : null}

            <div className="mt-5 flex flex-wrap gap-2">
              {selectedReaderName ? (
                readerAuthorHref ? (
                  <Link
                    href={readerAuthorHref}
                    className="rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sm text-black transition hover:bg-sky-100"
                  >
                    朗読者: {selectedReaderName}
                  </Link>
                ) : (
                  <span className="rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sm text-black">
                    朗読者: {selectedReaderName}
                  </span>
                )
              ) : (
                <span className="rounded-full border border-black/10 bg-neutral-50 px-4 py-2 text-sm text-neutral-500">
                  朗読未選択 / 朗読停止中
                </span>
              )}

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

                  <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-black/10 bg-white p-4">
                    <div>
                      <p className="text-sm text-neutral-700">マーカー表示</p>
                      <p className="mt-1 text-xs leading-6 text-neutral-500">
                        朗読追尾の青マーカーを表示/非表示にする。
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <SettingChip
                        active={showMarker}
                        label="表示"
                        onClick={handleShowMarker}
                      />
                      <SettingChip
                        active={!showMarker}
                        label="非表示"
                        onClick={handleHideMarker}
                      />
                    </div>
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
                              const units =
                                displayUnitsBySentenceIndex.get(segment.index) ?? [];

                              const sourceUnits =
                                units.length > 0
                                  ? units
                                  : [
                                      {
                                        displayIndex: segment.index,
                                        sentenceIndex: segment.index,
                                        text: segment.text,
                                        weight: 1,
                                        isNumberOnly: false,
                                      },
                                    ];

                              return sourceUnits.map((unit) => {
                                const isActive =
                                  showMarker && unit.displayIndex === visibleMarkerDisplayIndex;

                                return (
                                  <span
                                    key={`${segment.index}-${unit.displayIndex}`}
                                    ref={(node) => {
                                      sentenceRefs.current[unit.displayIndex] = node;
                                    }}
                                    role={canPlayAudio ? "button" : undefined}
                                    tabIndex={canPlayAudio ? 0 : undefined}
                                    onClick={() => {
                                      handleJumpToDisplay(unit.displayIndex)
                                    }}
                                    onKeyDown={(event) => {
                                      if (!canPlayAudio) return;
                                      if (event.key !== "Enter" && event.key !== " ") return;
                                      event.preventDefault();
                                      handleJumpToDisplay(unit.displayIndex)
                                    }}
                                    className={[
                                      "inline rounded-md px-1 py-1 transition-all duration-200",
                                      canPlayAudio ? "cursor-pointer hover:bg-sky-50/70" : "",
                                      isActive ? markerClass : "",
                                    ].join(" ")}
                                  >
                                    {hideEffects
                                      ? renderTextWithAozoraRuby(unit.text)
                                      : renderSentenceWithInlineMarks(
                                          unit.text,
                                          appliedEffectSettings.inlineMarks
                                        )}
                                  </span>
                                );
                              });
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
                    episodeNumber={episodeNumber}
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
          {isBookmarkPanelExpanded ? (
            <div className="mb-3 rounded-3xl border border-black/10 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-black">栞</p>
                  <p className="mt-1 text-xs leading-6 text-neutral-500">
                    この展開中だけ「続きを読む」へ現在位置を記録する。
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleToggleBookmarkPanel}
                  className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-neutral-700 transition hover:bg-neutral-50"
                >
                  閉じる
                </button>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleSaveBookmark}
                  className={[
                    "rounded-full border px-4 py-2 text-sm font-medium transition",
                    isCurrentEpisodeBookmarked
                      ? "border-sky-200 bg-sky-50 text-black hover:bg-sky-100"
                      : "border-black/10 bg-white text-neutral-700 hover:bg-neutral-50",
                  ].join(" ")}
                >
                  {isCurrentEpisodeBookmarked ? "ブックマーク保存済み" : "現在位置をブックマーク保存"}
                </button>

                <span className="rounded-full border border-black/10 bg-neutral-50 px-4 py-2 text-xs text-neutral-600">
                  現在 {formatTime(currentTime)} / {formatTime(duration)}
                </span>
              </div>
            </div>
          ) : null}

          {showNarrationControls ? (
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

          {showNarrationControls ? (
            <div className="mt-3 grid w-full grid-cols-7 gap-2">
              <FooterActionButton
                label={isBookmarkPanelExpanded ? "栞\nOPEN" : "栞"}
                iconSrc={
                  isCurrentEpisodeBookmarked
                    ? PLAYER_ICON_PATHS.bookmarkFilled
                    : PLAYER_ICON_PATHS.bookmark
                }
                disabled={false}
                active={isBookmarkPanelExpanded}
                onClick={handleToggleBookmarkPanel}
              />

              {showNarrationControls ? (
                <FooterPlaybackRateControl
                  value={playbackRate}
                  onDecrease={handleDecreasePlaybackRate}
                  onIncrease={handleIncreasePlaybackRate}
                />
              ) : null}

              <FooterActionButton
                label="前話"
                iconSrc={PLAYER_ICON_PATHS.prev}
                disabled={!hasPrevEpisode || isAdvancing}
                onClick={() => {
                  void handleMovePrev();
                }}
              />

              {showNarrationControls ? (
                <FooterActionButton
                  label={isPlaying ? "停止" : "再生"}
                  iconSrc={isPlaying ? PLAYER_ICON_PATHS.stop : PLAYER_ICON_PATHS.play}
                  disabled={!canPlayAudio}
                  accent
                  onClick={() => {
                    void handleTogglePlay();
                  }}
                />
              ) : null}

              <FooterActionButton
                label="次話"
                iconSrc={PLAYER_ICON_PATHS.next}
                disabled={!hasNextEpisode || isAdvancing}
                onClick={() => {
                  void handleMoveNext();
                }}
              />

              {showNarrationControls ? (
                <FooterActionButton
                  label={autoFollow ? "自動追尾\nON" : "自動追尾\nOFF"}
                  active={autoFollow}
                  onClick={() => {
                    setAutoFollow((prev) => !prev);
                  }}
                />
              ) : null}

              <FooterActionButton
                label="設定"
                iconSrc={PLAYER_ICON_PATHS.settings}
                disabled={!canOpenSettings}
                active={isSettingsOpen}
                onClick={handleToggleSettings}
              />
            </div>
          ) : (
            <div className="mt-3 grid w-full grid-cols-4 gap-2">
              <FooterActionButton
                label={isBookmarkPanelExpanded ? "栞\nOPEN" : "栞"}
                iconSrc={
                  isCurrentEpisodeBookmarked
                    ? PLAYER_ICON_PATHS.bookmarkFilled
                    : PLAYER_ICON_PATHS.bookmark
                }
                disabled={false}
                active={isBookmarkPanelExpanded}
                onClick={handleToggleBookmarkPanel}
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
                disabled={!canOpenSettings}
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
