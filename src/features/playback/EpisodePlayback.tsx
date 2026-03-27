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
import BgmController from "@/features/playback/BgmController";
import {
  usePlayLogPersistence,
  type ReadResumeState,
} from "@/hooks/usePlayLogPersistence";
import type { BgmSettings } from "@/lib/bgm/bgmSettings";

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
  bgmTitle?: string;
  bgmSrc?: string | null;
  bgmSettings?: BgmSettings;
};

type SentenceSegment = {
  index: number;
  text: string;
};

type ParagraphBlock = {
  paragraphIndex: number;
  segments: SentenceSegment[];
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

type DisplayTheme = "normal" | "invert" | "sepia";
type LineHeightPreset = "compact" | "normal" | "wide";

type DisplayPreference = {
  theme: DisplayTheme;
  fontScale: number;
  lineHeight: LineHeightPreset;
};

const DEFAULT_DISPLAY_PREFERENCE: DisplayPreference = {
  theme: "normal",
  fontScale: 1.06,
  lineHeight: "normal",
};

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
      theme:
        parsed.theme === "normal" ||
        parsed.theme === "invert" ||
        parsed.theme === "sepia"
          ? parsed.theme
          : DEFAULT_DISPLAY_PREFERENCE.theme,
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
    };
  } catch {
    return DEFAULT_DISPLAY_PREFERENCE;
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

function clampFontScale(value: number): number {
  if (!Number.isFinite(value)) return 1.06;
  return Math.min(1.4, Math.max(0.9, value));
}

function ControlButton({
  label,
  disabled = true,
  onClick,
}: {
  label: string;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex h-11 min-w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-3 text-sm text-neutral-300 transition hover:bg-white/10 disabled:opacity-50 disabled:hover:bg-white/5"
    >
      {label}
    </button>
  );
}

function FooterEpisodeButton({
  label,
  episodeNumber,
  disabled = false,
  onClick,
}: {
  label: string;
  episodeNumber?: number | null;
  disabled?: boolean;
  onClick?: () => void;
}) {
  const hasEpisodeNumber =
    typeof episodeNumber === "number" && Number.isFinite(episodeNumber);

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={[
        "flex min-w-[96px] flex-col rounded-2xl border px-3 py-2 text-left transition",
        disabled
          ? "border-white/10 bg-white/5 text-neutral-500"
          : "border-white/10 bg-white/5 text-neutral-200 hover:bg-white/10",
      ].join(" ")}
    >
      <span className="text-[11px] text-neutral-500">{label}</span>
      <span className="text-sm font-medium">
        {hasEpisodeNumber ? `第${episodeNumber}話` : "なし"}
      </span>
    </button>
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
  bgmTitle,
  bgmSrc,
  bgmSettings,
}: EpisodePlaybackProps) {
  const router = useRouter();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pendingResumeRef = useRef<ReadResumeState | null>(null);
  const advanceTimeoutRef = useRef<number | null>(null);
  const sentenceRefs = useRef<Record<number, HTMLSpanElement | null>>({});
  const ignoreScrollRef = useRef(false);
  const ignoreScrollTimeoutRef = useRef<number | null>(null);
  const hasAppliedInitialSeekRef = useRef(false);
  const bookmarkToastTimeoutRef = useRef<number | null>(null);

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

  const [displayPreference, setDisplayPreference] = useState<DisplayPreference>(
    () => readStoredDisplayPreference(seriesId)
  );

  const displayTheme = displayPreference.theme;
  const fontScale = displayPreference.fontScale;
  const lineHeightPreset = displayPreference.lineHeight;

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

  const playableAudioSrc = useMemo(() => {
    const value = (audioStoragePath ?? "").trim();

    if (!value) return "";
    if (value.startsWith("http://")) return value;
    if (value.startsWith("https://")) return value;
    if (value.startsWith("/")) return value;

    return "";
  }, [audioStoragePath]);

  const canPlayAudio = recordingAvailable && playableAudioSrc.length > 0;
  const hasPrevEpisode =
    typeof prevEpisodeNumber === "number" && !!prevEpisodeHref;
  const hasNextEpisode =
    typeof nextEpisodeNumber === "number" && !!nextEpisodeHref;

  const estimatedSentenceIndex = useMemo(() => {
    if (!canPlayAudio) return -1;
    if (totalSentenceCount <= 0) return -1;
    if (!Number.isFinite(duration) || duration <= 0) return -1;

    const rawRatio = currentTime / duration;
    const ratio = Math.min(Math.max(rawRatio, 0), 0.999999);

    return Math.min(
      totalSentenceCount - 1,
      Math.floor(ratio * totalSentenceCount)
    );
  }, [canPlayAudio, totalSentenceCount, currentTime, duration]);

  const visibleMarkerSentenceIndex =
    isPlaying && autoFollow ? estimatedSentenceIndex : -1;

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
    [setCurrentTime]
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
  }, []);

  const lineHeightValue = useMemo(() => {
    if (lineHeightPreset === "compact") return 1.95;
    if (lineHeightPreset === "wide") return 2.45;
    return 2.2;
  }, [lineHeightPreset]);

  const readingPaneClass = useMemo(() => {
    if (displayTheme === "invert") {
      return "rounded-[28px] bg-neutral-100 text-neutral-950 p-5 sm:p-6";
    }
    if (displayTheme === "sepia") {
      return "rounded-[28px] bg-[#2e241b] text-[#f3e7cf] p-5 sm:p-6";
    }
    return "rounded-[28px] bg-transparent text-neutral-100";
  }, [displayTheme]);

  const markerClass = useMemo(() => {
    if (displayTheme === "invert") {
      return "bg-[repeating-linear-gradient(135deg,rgba(110,110,110,0.22)_0px,rgba(110,110,110,0.22)_8px,rgba(55,55,55,0.12)_8px,rgba(55,55,55,0.12)_16px)] ring-1 ring-black/10";
    }
    if (displayTheme === "sepia") {
      return "bg-[repeating-linear-gradient(135deg,rgba(232,213,177,0.24)_0px,rgba(232,213,177,0.24)_8px,rgba(120,88,48,0.18)_8px,rgba(120,88,48,0.18)_16px)] ring-1 ring-white/10";
    }
    return "bg-[repeating-linear-gradient(135deg,rgba(200,200,200,0.26)_0px,rgba(200,200,200,0.26)_8px,rgba(120,120,120,0.18)_8px,rgba(120,120,120,0.18)_16px)] ring-1 ring-white/10";
  }, [displayTheme]);

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
        theme: displayTheme,
        fontScale,
        lineHeight: lineHeightPreset,
      };

      window.localStorage.setItem(
        `duonovel:display:${seriesId}`,
        JSON.stringify(payload)
      );
    } catch {
      // 保存失敗は黙って継続
    }
  }, [seriesId, displayTheme, fontScale, lineHeightPreset]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => {
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
        return;
      }

      if (
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
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime || 0);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setAutoFollow(false);

      if (nextEpisodeHref) {
        void flushPlayLog("episode-move");
        setIsAdvancing(true);

        advanceTimeoutRef.current = window.setTimeout(() => {
          router.push(nextEpisodeHref);
        }, 900);
      }
    };

    const handlePause = () => {
      setIsPlaying(false);
      setAutoFollow(false);
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
      setAutoFollow(false);
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
  }, [flushPlayLog, initialStartAt, nextEpisodeHref, router]);

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

    scrollToSentence(estimatedSentenceIndex, "smooth");
  }, [estimatedSentenceIndex, isPlaying, autoFollow, scrollToSentence]);

  useEffect(() => {
    function handleWindowScroll() {
      if (!isPlaying) return;
      if (!autoFollow) return;
      if (ignoreScrollRef.current) return;

      setAutoFollow(false);
    }

    window.addEventListener("scroll", handleWindowScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleWindowScroll);
    };
  }, [isPlaying, autoFollow]);

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

  function handleSeekBy(seconds: number): void {
    const audio = audioRef.current;
    if (!audio || !canPlayAudio) return;

    const nextTime = Math.min(
      Math.max((audio.currentTime || 0) + seconds, 0),
      audio.duration || 0
    );

    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  }

  function handleSliderChange(event: ChangeEvent<HTMLInputElement>): void {
    const audio = audioRef.current;
    if (!audio || !canPlayAudio) return;

    const nextTime = Number(event.target.value);
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
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

  function handleReturnToCurrentPosition(): void {
    if (estimatedSentenceIndex < 0) return;

    setAutoFollow(true);
    scrollToSentence(estimatedSentenceIndex, "smooth");
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

             {bgmSrc ? (
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
                  canPlayAudio
                    ? "border border-sky-400/20 bg-sky-400/10 text-sky-200"
                    : "border border-white/10 bg-white/5 text-neutral-500",
                ].join(" ")}
              >
                {canPlayAudio ? "再生テスト可能" : "再生URL未接続"}
              </span>

              <span
                className={[
                  "rounded-full px-4 py-2 text-sm",
                  autoFollow && isPlaying
                    ? "border border-violet-400/20 bg-violet-400/10 text-violet-200"
                    : "border border-white/10 bg-white/5 text-neutral-500",
                ].join(" ")}
              >
                {autoFollow && isPlaying ? "本文追尾ON" : "本文追尾OFF"}
              </span>

              <span
                className={[
                  "rounded-full px-4 py-2 text-sm",
                  hasNextEpisode
                    ? "border border-violet-400/20 bg-violet-400/10 text-violet-200"
                    : "border border-white/10 bg-white/5 text-neutral-500",
                ].join(" ")}
              >
                {hasNextEpisode
                  ? `再生終了で第${nextEpisodeNumber}話へ移動`
                  : "次話なし"}
              </span>

              <span
                className={[
                  "rounded-full px-4 py-2 text-sm",
                  bgmSrc
                    ? "border border-fuchsia-400/20 bg-fuchsia-400/10 text-fuchsia-200"
                    : "border border-white/10 bg-white/5 text-neutral-500",
                ].join(" ")}
              >
                {bgmSrc ? "BGM設定あり" : "BGM未設定"}
              </span>
            </div>

            <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm leading-7 text-neutral-400">
              今の本文追尾は、音声全体の進行率から現在文を推定する仮実装。
              あとで文単位 timestamp に差し替える前提。
            </div>

            <BgmController
              seriesId={seriesId}
              bgmSrc={bgmSrc}
              bgmTitle={bgmTitle}
              bgmSettings={bgmSettings}
              isNarrationPlaying={isPlaying}
              isOpen={isSettingsOpen}
            />

            {isSettingsOpen ? (
              <div className="mt-4 rounded-[28px] border border-white/10 bg-black/20 p-4">
                <p className="text-xs tracking-[0.18em] text-neutral-500">DISPLAY</p>
                <h3 className="mt-2 text-lg font-semibold text-white">表示演出</h3>

                <div className="mt-4">
                  <p className="text-sm text-neutral-300">テーマ</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <SettingChip
                      active={displayTheme === "normal"}
                      label="通常"
                      onClick={() =>
  setDisplayPreference((prev) => ({
    ...prev,
    theme: "normal",
  }))
}
                    />
                    <SettingChip
                      active={displayTheme === "invert"}
                      label="色反転風"
                      onClick={() =>
  setDisplayPreference((prev) => ({
    ...prev,
    theme: "invert",
  }))
}
                    />
                    <SettingChip
                      active={displayTheme === "sepia"}
                      label="セピア"
                      onClick={() =>
  setDisplayPreference((prev) => ({
    ...prev,
    theme: "sepia",
  }))
}
                    />
                  </div>
                </div>

                <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
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

                <div className="mt-5">
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

                <p className="mt-4 text-sm leading-7 text-neutral-400">
                  この表示設定は作品ごとに保存される。
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

            {!autoFollow && estimatedSentenceIndex >= 0 ? (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={handleReturnToCurrentPosition}
                  className="rounded-full border border-sky-400/20 bg-sky-400/10 px-4 py-2 text-sm text-sky-200 transition hover:bg-sky-400/20"
                >
                  現在位置に戻る
                </button>
              </div>
            ) : null}

            <div className="mt-6 rounded-3xl border border-white/10 bg-black/20 p-4">
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
          </div>

          <div className="px-5 py-8 sm:px-8 sm:py-10">
            <div className={readingPaneClass}>
              <article
                className="space-y-7"
                style={{
                  fontSize: `${fontScale}rem`,
                  lineHeight: lineHeightValue,
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
                              isActive ? `${markerClass}` : "",
                            ].join(" ")}
                          >
                            {segment.text}
                          </span>
                        );
                      })}
                    </p>
                  ))
                ) : (
                  <p>本文がありません。</p>
                )}
              </article>
            </div>
          </div>
        </section>
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-white/10 bg-[#0a0a0a]/90 backdrop-blur">
        <div className="mx-auto max-w-3xl px-4 py-3 sm:px-6">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                {workIndexHref ? (
                  <Link
                    href={workIndexHref}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-neutral-300 transition hover:bg-white/10"
                  >
                    目次
                  </Link>
                ) : (
                  <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-neutral-400">
                    栞
                  </div>
                )}

                <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-neutral-400">
                  自動次話移動ON
                </div>
              </div>

              <div className="flex items-center gap-2 sm:shrink-0">
                <FooterEpisodeButton
                  label="前話"
                  episodeNumber={prevEpisodeNumber}
                  disabled={!hasPrevEpisode || isAdvancing}
                  onClick={() => {
                    void handleMovePrev();
                  }}
                />
                <FooterEpisodeButton
                  label="次話"
                  episodeNumber={nextEpisodeNumber}
                  disabled={!hasNextEpisode || isAdvancing}
                  onClick={() => {
                    void handleMoveNext();
                  }}
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <ControlButton
                label="🔖"
                disabled={false}
                onClick={handleSaveBookmark}
              />
              <ControlButton
                label="↺15"
                disabled={!canPlayAudio}
                onClick={() => handleSeekBy(-15)}
              />
              <ControlButton
                label={isPlaying ? "⏸" : "▶"}
                disabled={!canPlayAudio}
                onClick={() => {
                  void handleTogglePlay();
                }}
              />
              <ControlButton
                label="15↻"
                disabled={!canPlayAudio}
                onClick={() => handleSeekBy(15)}
              />
              <ControlButton
                label="⚙"
                disabled={false}
                onClick={() => setIsSettingsOpen((prev) => !prev)}
              />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}