"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import {
  buildContentBlocks,
  buildSceneBreakRuntimeList,
} from "@/lib/effects/effectTextLayout";
import {
  buildSegments,
  buildTypographyStyle,
  normalizeAozoraTextForDisplay,
  normalizeAozoraTextForLayout,
  renderIllustration,
  renderSegment,
  renderTextWithAozoraRuby,
} from "@/features/effects/EffectPreviewRenderer";
import {
  emptyEffectSettings,
  type EffectSettings,
} from "@/lib/effects/effectSettings";
import EpisodeCommentSection from "@/features/comment/EpisodeCommentSection";
import { trackSeriesViewOnce } from "@/lib/popularityEvents";
import { buildNemoAlignedParagraphBlocks } from "@/lib/recording/humanTimingShared";
import {
  readReadingBookmark,
  writeReadingBookmark,
} from "@/lib/playback/readingBookmark";
import {
  readNarrationStopped as readGlobalNarrationStopped,
  readWebSpeechDisplaySettings,
  readWebSpeechSettings,
  writeNarrationStopped as writeGlobalNarrationStopped,
  writeWebSpeechDisplaySettings,
  writeWebSpeechSettings,
} from "@/lib/playback/webSpeechPreferences";

type SpeechVoiceOption = {
  voiceURI: string;
  name: string;
  lang: string;
};

type NarrationSource = "browser" | "human";

type HumanNarrationOption = {
  recordingId: string;
  readerKey: string;
  readerName: string;
  audioStoragePath: string;
  readerAuthorHref?: string;
};

type DisplayPreference = {
  fontScale: number;
  lineHeight: "compact" | "normal" | "wide";
  hideEffects: boolean;
  showMarker: boolean;
};

type EpisodePlaybackProps = {
  seriesId: string;
  episodeId?: string | null;
  episodeNumber: number;
  seriesTitle?: string;
  episodeTitle?: string;
  workAuthorName?: string;
  workEditorName?: string;
  body?: string | null;
  selectedReaderKey?: string;
  selectedReaderName?: string;
  readerAuthorHref?: string;
  humanRecordingId?: string | null;
  humanAudioStoragePath?: string | null;
  humanNarrationOptions?: HumanNarrationOption[];
  isShortStory?: boolean;
  storySummary?: string;
  prevEpisodeHref?: string | null;
  prevEpisodeNumber?: number | null;
  nextEpisodeHref?: string | null;
  nextEpisodeNumber?: number | null;
  workIndexHref?: string | null;
  workIndexLabel?: string;
  initialAutoPlay?: boolean;
  loginHref?: string;
  showComments?: boolean;
  effectSettings?: EffectSettings;
  ownerActions?: ReactNode;
  speechLanguage?: string;
  trackPopularity?: boolean;
  constrainBodyScroll?: boolean;
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

const DEFAULT_DISPLAY_PREFERENCE: DisplayPreference = {
  fontScale: 1.06,
  lineHeight: "normal",
  hideEffects: false,
  showMarker: true,
};

const EMPTY_HUMAN_NARRATION_OPTIONS: HumanNarrationOption[] = [];

function clampFontScale(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_DISPLAY_PREFERENCE.fontScale;
  return Math.min(1.4, Math.max(0.9, value));
}

function clampPlaybackRate(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(1.5, Math.max(0.7, Math.round(value * 10) / 10));
}

function clampSpeechPitch(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(1.3, Math.max(0.8, Math.round(value * 10) / 10));
}

function clampVolume(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(1, Math.max(0, value));
}

function normalizeAudioSource(value?: string | null): string {
  const source = (value ?? "").trim();

  if (
    source.startsWith("https://") ||
    source.startsWith("http://") ||
    source.startsWith("/")
  ) {
    return source;
  }

  return "";
}

function readStoredNarrationStopped(seriesId: string): boolean {
  return readGlobalNarrationStopped(seriesId);
}

function writeStoredNarrationStopped(seriesId: string, value: boolean): void {
  writeGlobalNarrationStopped(seriesId, value);
}

function readStoredDisplayPreference(seriesId: string): DisplayPreference {
  return readWebSpeechDisplaySettings(seriesId);
}

function readStoredSpeechSettings(seriesId: string): {
  voiceURI: string;
  pitch: number;
  volume: number;
  rate: number;
  autoAdvance: boolean;
} {
  return readWebSpeechSettings(seriesId);
}

function splitForSpeech(text: string, speechLanguage: string): string[] {
  const normalized = normalizeAozoraTextForDisplay(text).trim();

  if (!normalized) return [];

  const matched = speechLanguage.toLowerCase().startsWith("ja")
    ? normalized.match(/[^、。！？!?…]+(?:[、。！？!?…]+[」』）】]*)?/gu)
    : normalized.match(
        /[^。！？!?…．.]+(?:[。！？!?…．.]+["'」』）】»”]*)?/gu
      );

  return (matched ?? [normalized])
    .map((item) => item.trim())
    .filter(Boolean);
}

function replaceRubyWithReadingText(text: string): string {
  return text
    .replace(/｜([^《》\r\n]+)《([^《》\r\n]+)》/gu, "$2")
    .replace(/([一-龯々〆ヵヶ〓]+)《([^《》\r\n]+)》/gu, "$2");
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
  iconSrc,
  disabled = false,
  active = false,
  onClick,
}: {
  label: string;
  iconSrc?: string;
  disabled?: boolean;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label.replace(/\n/g, " ")}
      title={label.replace(/\n/g, " ")}
      disabled={disabled}
      onClick={onClick}
      className={[
        "flex h-12 w-full items-center justify-center rounded-2xl px-2 text-center text-[10px] font-medium leading-tight transition sm:text-sm",
        iconSrc
          ? active
            ? "border-0 bg-sky-50/70"
            : "border-0 bg-transparent hover:bg-neutral-50/70"
          : active
            ? "border border-sky-200 bg-sky-50 text-black"
            : "border border-black/10 bg-white text-black hover:bg-neutral-50",
        disabled ? "cursor-not-allowed opacity-35" : "",
      ].join(" ")}
    >
      {iconSrc ? (
        <Image
          src={iconSrc}
          alt=""
          width={28}
          height={28}
          className="h-7 w-7 object-contain opacity-80"
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
  return (
    <div className="flex h-12 w-full overflow-hidden rounded-2xl border border-black/10 bg-white">
      <button
        type="button"
        onClick={onDecrease}
        disabled={value <= 0.7}
        className="flex w-1/4 items-center justify-center border-r border-black/10 text-sm text-black transition hover:bg-neutral-50 disabled:text-neutral-400"
      >
        −
      </button>
      <div className="flex flex-1 items-center justify-center text-[10px] font-medium text-black sm:text-sm">
        ×{value.toFixed(1)}
      </div>
      <button
        type="button"
        onClick={onIncrease}
        disabled={value >= 1.5}
        className="flex w-1/4 items-center justify-center border-l border-black/10 text-sm text-black transition hover:bg-neutral-50 disabled:text-neutral-400"
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

export default function WebSpeechEpisodePlayback({
  seriesId,
  episodeId,
  episodeNumber,
  seriesTitle,
  episodeTitle,
  workAuthorName,
  workEditorName,
  body,
  selectedReaderKey,
  selectedReaderName,
  readerAuthorHref,
  humanRecordingId,
  humanAudioStoragePath,
  humanNarrationOptions = EMPTY_HUMAN_NARRATION_OPTIONS,
  isShortStory = false,
  storySummary,
  prevEpisodeHref,
  prevEpisodeNumber,
  nextEpisodeHref,
  nextEpisodeNumber,
  workIndexHref,
  workIndexLabel = "作品ページ（目次）",
  initialAutoPlay = false,
  loginHref,
  showComments = true,
  effectSettings,
  ownerActions,
  speechLanguage = "ja-JP",
  trackPopularity = true,
  constrainBodyScroll = false,
}: EpisodePlaybackProps) {
  const router = useRouter();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sentenceRefs = useRef<Record<number, HTMLSpanElement | null>>({});
  const speechRunIdRef = useRef(0);
  const playbackRateRef = useRef(1);
  const speechPitchRef = useRef(1);
  const speechVolumeRef = useRef(1);
  const selectedVoiceURIRef = useRef("");
  const initialAutoPlayRef = useRef(false);
  const bookmarkToastTimeoutRef = useRef<number | null>(null);
  const initialBookmarkScrollRef = useRef<string | null>(null);

  const speechSettings = useMemo(
    () => readStoredSpeechSettings(seriesId),
    [seriesId]
  );

  const [isPlaying, setIsPlaying] = useState(false);
  const [isNarrationStopped, setIsNarrationStopped] = useState(() =>
    readStoredNarrationStopped(seriesId)
  );
  const [narrationSource, setNarrationSource] = useState<NarrationSource>("browser");
  const [selectedHumanRecordingId, setSelectedHumanRecordingId] = useState(
    humanRecordingId ?? humanNarrationOptions[0]?.recordingId ?? ""
  );
  const [activeUnitIndex, setActiveUnitIndex] = useState(0);
  const [humanCurrentTime, setHumanCurrentTime] = useState(0);
  const [humanDuration, setHumanDuration] = useState(0);
  const [audioError, setAudioError] = useState("");
  const [autoFollow, setAutoFollow] = useState(true);
  const [autoAdvanceToNext, setAutoAdvanceToNext] = useState(
    speechSettings.autoAdvance
  );
  const [isCurrentEpisodeBookmarked, setIsCurrentEpisodeBookmarked] =
    useState(false);
  const [bookmarkMessage, setBookmarkMessage] = useState("");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [displayPreference, setDisplayPreference] = useState<DisplayPreference>(
    () => readStoredDisplayPreference(seriesId)
  );
  const [availableVoices, setAvailableVoices] = useState<SpeechVoiceOption[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState(
    speechSettings.voiceURI
  );
  const [speechPitch, setSpeechPitch] = useState(speechSettings.pitch);
  const [speechVolume, setSpeechVolume] = useState(speechSettings.volume);
  const [playbackRate, setPlaybackRate] = useState(speechSettings.rate);

  const safeSeriesTitle =
    typeof seriesTitle === "string" && seriesTitle.trim()
      ? seriesTitle.trim()
      : "無題";
  const safeEpisodeTitle =
    typeof episodeTitle === "string" && episodeTitle.trim()
      ? episodeTitle.trim()
      : "話タイトル未設定";
  const safeAuthorName =
    typeof workAuthorName === "string" && workAuthorName.trim()
      ? workAuthorName.trim()
      : "作者名未設定";
  const safeEditorName =
    typeof workEditorName === "string" && workEditorName.trim()
      ? workEditorName.trim()
      : "";
  const safeBody =
    typeof body === "string" && body.trim()
      ? body
      : "本文がまだ登録されていません。";
  const safeSpeechLanguage = speechLanguage.trim() || "ja-JP";
  const speechLanguagePrefix = safeSpeechLanguage
    .split("-")[0]
    .toLowerCase();

  const normalizedHumanNarrationOptions = useMemo(
    () =>
      humanNarrationOptions
        .map((option) => ({
          ...option,
          recordingId: option.recordingId.trim(),
          readerKey: option.readerKey.trim(),
          readerName: option.readerName.trim(),
          audioStoragePath: normalizeAudioSource(option.audioStoragePath),
        }))
        .filter(
          (option) =>
            option.recordingId.length > 0 &&
            option.readerName.length > 0 &&
            option.audioStoragePath.length > 0
        ),
    [humanNarrationOptions]
  );
  const selectedHumanNarrationOption = useMemo(
    () =>
      normalizedHumanNarrationOptions.find(
        (option) => option.recordingId === selectedHumanRecordingId
      ) ??
      normalizedHumanNarrationOptions[0] ??
      null,
    [normalizedHumanNarrationOptions, selectedHumanRecordingId]
  );
  const humanAudioSrc =
    selectedHumanNarrationOption?.audioStoragePath ||
    normalizeAudioSource(humanAudioStoragePath);
  const hasHumanRecording = humanAudioSrc.length > 0;
  const isHumanNarration = narrationSource === "human" && hasHumanRecording;
  const humanNarrationName =
    selectedHumanNarrationOption?.readerName || selectedReaderName || "";
  const humanNarrationAuthorHref =
    selectedHumanNarrationOption?.readerAuthorHref || readerAuthorHref;

  const appliedEffectSettings = useMemo(
    () => effectSettings ?? emptyEffectSettings(),
    [effectSettings]
  );
  const effectTypographyStyle = useMemo(
    () => buildTypographyStyle(appliedEffectSettings),
    [appliedEffectSettings]
  );
  const layoutBody = useMemo(
    () => normalizeAozoraTextForLayout(safeBody),
    [safeBody]
  );
  const paragraphBlocks = useMemo(
    () => buildNemoAlignedParagraphBlocks(layoutBody),
    [layoutBody]
  );
  const sceneBreaks = useMemo(
    () =>
      buildSceneBreakRuntimeList(
        paragraphBlocks,
        appliedEffectSettings.illustrations
      ),
    [paragraphBlocks, appliedEffectSettings.illustrations]
  );
  const contentBlocks = useMemo(
    () => buildContentBlocks(paragraphBlocks, sceneBreaks),
    [paragraphBlocks, sceneBreaks]
  );

  const speechUnits = useMemo(
    () =>
      paragraphBlocks.flatMap((block) =>
        block.segments.flatMap((segment) =>
          splitForSpeech(segment.text, safeSpeechLanguage).map((text) => ({
            segmentIndex: segment.index,
            text: replaceRubyWithReadingText(text),
          }))
        )
      ),
    [paragraphBlocks, safeSpeechLanguage]
  );
  const firstSpeechUnitIndexBySegment = useMemo(() => {
    const map = new Map<number, number>();

    speechUnits.forEach((unit, index) => {
      if (!map.has(unit.segmentIndex)) {
        map.set(unit.segmentIndex, index);
      }
    });

    return map;
  }, [speechUnits]);

  const maxUnitIndex = Math.max(0, speechUnits.length - 1);
  const safeActiveUnitIndex = Math.min(
    Math.max(activeUnitIndex, 0),
    maxUnitIndex
  );
  const humanMarkerUnitIndex =
    humanDuration > 0 && speechUnits.length > 1
      ? Math.min(
          maxUnitIndex,
          Math.max(
            0,
            Math.floor((humanCurrentTime / humanDuration) * speechUnits.length)
          )
        )
      : 0;
  const markerUnitIndex = isHumanNarration
    ? humanMarkerUnitIndex
    : safeActiveUnitIndex;
  const currentSliderValue = isHumanNarration
    ? Math.min(humanCurrentTime, humanDuration || 0)
    : safeActiveUnitIndex;
  const currentSliderMax = isHumanNarration
    ? humanDuration || 0
    : maxUnitIndex;
  const currentPositionLabel = isHumanNarration
    ? `${Math.floor(humanCurrentTime)}秒 / ${Math.floor(humanDuration)}秒`
    : `${Math.min(speechUnits.length, safeActiveUnitIndex + 1)} / ${speechUnits.length}`;

  useEffect(() => {
    if (!trackPopularity) return;

    void trackSeriesViewOnce({
      seriesId,
      episodeId: episodeId ?? null,
      episodeNumber,
    });
  }, [episodeId, episodeNumber, seriesId, trackPopularity]);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("speechSynthesis" in window)
    ) {
      return;
    }

    function loadVoices() {
      const voices = window.speechSynthesis
        .getVoices()
        .filter((voice) =>
          voice.lang.toLowerCase().startsWith(speechLanguagePrefix)
        )
        .map((voice) => ({
          voiceURI: voice.voiceURI,
          name: voice.name,
          lang: voice.lang,
        }));

      setAvailableVoices(voices);

      const selectedVoiceStillMatches = voices.some(
        (voice) => voice.voiceURI === selectedVoiceURIRef.current
      );

      if (!selectedVoiceStillMatches) {
        const nextVoiceURI = voices[0]?.voiceURI ?? "";
        selectedVoiceURIRef.current = nextVoiceURI;
        setSelectedVoiceURI(nextVoiceURI);
      }
    }

    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);

    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
    };
  }, [speechLanguagePrefix]);

  useEffect(() => {
    playbackRateRef.current = playbackRate;
    speechPitchRef.current = speechPitch;
    speechVolumeRef.current = speechVolume;
    selectedVoiceURIRef.current = selectedVoiceURI;

    writeWebSpeechSettings({
      voiceURI: selectedVoiceURI,
      pitch: speechPitch,
      volume: speechVolume,
      rate: playbackRate,
      autoAdvance: autoAdvanceToNext,
    });
  }, [
    seriesId,
    selectedVoiceURI,
    speechPitch,
    speechVolume,
    playbackRate,
    autoAdvanceToNext,
  ]);

  useEffect(() => {
    writeWebSpeechDisplaySettings(displayPreference);
  }, [displayPreference]);

  useEffect(() => {
    writeStoredNarrationStopped(seriesId, isNarrationStopped);
  }, [seriesId, isNarrationStopped]);

  useEffect(() => {
    const initialOption =
      normalizedHumanNarrationOptions.find(
        (option) => option.recordingId === humanRecordingId
      ) ??
      normalizedHumanNarrationOptions[0] ??
      null;

    speechRunIdRef.current += 1;
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    const timer = window.setTimeout(() => {
      setSelectedHumanRecordingId(initialOption?.recordingId ?? "");
      setNarrationSource("browser");
      setIsNarrationStopped(readStoredNarrationStopped(seriesId));
      setIsPlaying(false);
      setHumanCurrentTime(0);
      setHumanDuration(0);
      setActiveUnitIndex(0);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [
    episodeId,
    humanRecordingId,
    normalizedHumanNarrationOptions,
    seriesId,
  ]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const parsed = readReadingBookmark(seriesId);
        const sameEpisode = Number(parsed?.episodeNumber) === episodeNumber;
        const sameReader =
          (parsed?.readerKey ?? "") === (selectedReaderKey ?? "") &&
          (parsed?.readerName ?? "") === (selectedReaderName ?? "");

        setIsCurrentEpisodeBookmarked(Boolean(sameEpisode && sameReader));

        if (
          sameEpisode &&
          sameReader &&
          typeof parsed?.positionIndex === "number" &&
          Number.isFinite(parsed.positionIndex)
        ) {
          setActiveUnitIndex(parsed.positionIndex);
          initialBookmarkScrollRef.current = `${seriesId}:${episodeNumber}:${parsed.positionIndex}`;
        }
      } catch {
        setIsCurrentEpisodeBookmarked(false);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [seriesId, episodeNumber, selectedReaderKey, selectedReaderName]);

  useEffect(() => {
    const restoreKey = initialBookmarkScrollRef.current;
    if (!restoreKey || speechUnits.length === 0) return;
    initialBookmarkScrollRef.current = null;
    const bookmark = readReadingBookmark(seriesId);
    if (!bookmark || bookmark.episodeNumber !== episodeNumber) return;
    const targetIndex = Math.min(bookmark.positionIndex, maxUnitIndex);
    window.requestAnimationFrame(() => {
      let node = sentenceRefs.current[targetIndex] ?? null;
      for (let index = targetIndex; !node && index >= 0; index -= 1) {
        node = sentenceRefs.current[index] ?? null;
      }
      node?.scrollIntoView({ behavior: "auto", block: "start" });
    });
  }, [episodeNumber, maxUnitIndex, seriesId, speechUnits.length]);

  useEffect(() => {
    if (!displayPreference.showMarker || !autoFollow || !isPlaying) {
      return;
    }

    const node = sentenceRefs.current[markerUnitIndex];
    node?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, [
    markerUnitIndex,
    autoFollow,
    isPlaying,
    displayPreference.showMarker,
  ]);

  useEffect(() => {
    function stopAutoFollow() {
      if (isPlaying) {
        setAutoFollow(false);
      }
    }

    window.addEventListener("wheel", stopAutoFollow, { passive: true });
    window.addEventListener("touchstart", stopAutoFollow, { passive: true });

    return () => {
      window.removeEventListener("wheel", stopAutoFollow);
      window.removeEventListener("touchstart", stopAutoFollow);
    };
  }, [isPlaying]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !isHumanNarration) return;

    const handleLoadedMetadata = () => {
      setHumanDuration(audio.duration || 0);
      audio.playbackRate = playbackRate;
      audio.volume = speechVolume;

      if (initialAutoPlay && !initialAutoPlayRef.current && !isNarrationStopped) {
        initialAutoPlayRef.current = true;
        void audio.play().catch(() => setIsPlaying(false));
      }
    };
    const handleTimeUpdate = () => setHumanCurrentTime(audio.currentTime || 0);
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleError = () => {
      setAudioError("公開朗読音声の読み込みに失敗した。");
      setIsPlaying(false);
    };
    const handleEnded = () => {
      setIsPlaying(false);
      if (autoAdvanceToNext && nextEpisodeHref) {
        router.push(nextEpisodeHref);
      }
    };

    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("error", handleError);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("error", handleError);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [
    isHumanNarration,
    humanAudioSrc,
    playbackRate,
    speechVolume,
    initialAutoPlay,
    isNarrationStopped,
    autoAdvanceToNext,
    nextEpisodeHref,
    router,
  ]);

  useEffect(() => {
    return () => {
      speechRunIdRef.current += 1;
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      if (bookmarkToastTimeoutRef.current) {
        window.clearTimeout(bookmarkToastTimeoutRef.current);
      }
    };
  }, []);

  function stopSpeech() {
    speechRunIdRef.current += 1;

    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }

    setIsPlaying(false);
  }

  function speakFrom(index: number, runId: number) {
    if (
      typeof window === "undefined" ||
      !("speechSynthesis" in window)
    ) {
      setAudioError("このブラウザでは読み上げ機能を利用できません。");
      setIsPlaying(false);
      return;
    }

    if (runId !== speechRunIdRef.current) return;

    const unit = speechUnits[index];
    if (!unit) {
      setIsPlaying(false);
      return;
    }

    setActiveUnitIndex(index);
    setIsPlaying(true);

    const utterance = new SpeechSynthesisUtterance(unit.text);
    utterance.lang = safeSpeechLanguage;
    utterance.rate = playbackRateRef.current;
    utterance.pitch = speechPitchRef.current;
    utterance.volume = speechVolumeRef.current;

    const selectedVoice = window.speechSynthesis
      .getVoices()
      .find((voice) => voice.voiceURI === selectedVoiceURIRef.current);

    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }

    utterance.onend = () => {
      if (runId !== speechRunIdRef.current) return;

      const nextIndex = index + 1;

      if (nextIndex >= speechUnits.length) {
        setIsPlaying(false);

        if (autoAdvanceToNext && nextEpisodeHref) {
          router.push(nextEpisodeHref);
        }

        return;
      }

      speakFrom(nextIndex, runId);
    };

    utterance.onerror = () => {
      if (runId === speechRunIdRef.current) {
        setIsPlaying(false);
      }
    };

    window.speechSynthesis.speak(utterance);
  }

  function startBrowserSpeechFrom(index: number) {
    if (speechUnits.length === 0) return;

    if (
      typeof window === "undefined" ||
      !("speechSynthesis" in window)
    ) {
      setAudioError("このブラウザでは読み上げ機能を利用できません。");
      return;
    }

    speechRunIdRef.current += 1;
    window.speechSynthesis.cancel();
    const runId = speechRunIdRef.current;
    const boundedIndex = Math.min(Math.max(index, 0), maxUnitIndex);

    setActiveUnitIndex(boundedIndex);
    setIsPlaying(true);

    window.setTimeout(() => {
      speakFrom(boundedIndex, runId);
    }, 0);
  }

  function handleTogglePlay() {
    if (isNarrationStopped) {
      return;
    }

    setAudioError("");

    if (isHumanNarration) {
      const audio = audioRef.current;
      if (!audio) return;

      if (audio.paused) {
        void audio.play().catch(() => {
          setAudioError("公開朗読を開始できなかった。");
          setIsPlaying(false);
        });
      } else {
        audio.pause();
      }

      return;
    }

    if (isPlaying) {
      stopSpeech();
      return;
    }

    startBrowserSpeechFrom(safeActiveUnitIndex);
  }

  function handleSliderChange(event: ChangeEvent<HTMLInputElement>) {
    const nextValue = Number(event.target.value);

    if (!Number.isFinite(nextValue)) return;

    if (isHumanNarration) {
      const audio = audioRef.current;
      if (!audio) return;

      audio.currentTime = nextValue;
      setHumanCurrentTime(nextValue);
      return;
    }

    const boundedIndex = Math.min(Math.max(nextValue, 0), maxUnitIndex);
    setActiveUnitIndex(boundedIndex);

    if (isPlaying) {
      startBrowserSpeechFrom(boundedIndex);
    }
  }

  function handleJumpToSentence(segmentIndex: number) {
    const targetIndex = firstSpeechUnitIndexBySegment.get(segmentIndex);

    if (targetIndex === undefined) return;

    setAutoFollow(true);
    setActiveUnitIndex(targetIndex);

    if (isHumanNarration) {
      const audio = audioRef.current;

      if (audio && humanDuration > 0 && speechUnits.length > 1) {
        const nextTime = (targetIndex / maxUnitIndex) * humanDuration;
        audio.currentTime = nextTime;
        setHumanCurrentTime(nextTime);
      }

      return;
    }

    if (isPlaying) {
      startBrowserSpeechFrom(targetIndex);
    }
  }

  function handleMove(targetHref?: string | null) {
    if (!targetHref) return;

    stopSpeech();
    audioRef.current?.pause();
    router.push(targetHref);
  }

  function handleSaveBookmark() {
    try {
      writeReadingBookmark({
        seriesId,
        episodeNumber,
        positionIndex: markerUnitIndex,
        readerKey: selectedReaderKey,
        readerName: selectedReaderName,
      });

      setIsCurrentEpisodeBookmarked(true);
      setBookmarkMessage("ブックマーク保存をしました");

      if (bookmarkToastTimeoutRef.current) {
        window.clearTimeout(bookmarkToastTimeoutRef.current);
      }

      bookmarkToastTimeoutRef.current = window.setTimeout(() => {
        setBookmarkMessage("");
      }, 1800);
    } catch {
      setBookmarkMessage("ブックマークを保存できませんでした");
    }
  }

  function setBrowserSource() {
    audioRef.current?.pause();
    setNarrationSource("browser");
    setIsNarrationStopped(false);
    setIsPlaying(false);
  }

  function setHumanSource() {
    stopSpeech();
    setNarrationSource("human");
    setIsNarrationStopped(false);
  }

  function handleToggleNarrationStopped() {
    const nextStopped = !isNarrationStopped;

    if (nextStopped) {
      stopSpeech();
      audioRef.current?.pause();
    }

    setIsNarrationStopped(nextStopped);
  }

  function updatePlaybackRate(nextRate: number) {
    const safeRate = clampPlaybackRate(nextRate);
    setPlaybackRate(safeRate);

    if (isHumanNarration && audioRef.current) {
      audioRef.current.playbackRate = safeRate;
    } else if (isPlaying) {
      startBrowserSpeechFrom(safeActiveUnitIndex);
    }
  }

  function updateSpeechVoice(nextVoiceURI: string) {
    setSelectedVoiceURI(nextVoiceURI);

    if (!isHumanNarration && isPlaying) {
      startBrowserSpeechFrom(safeActiveUnitIndex);
    }
  }

  function updateSpeechPitch(nextPitch: number) {
    const safePitch = clampSpeechPitch(nextPitch);
    setSpeechPitch(safePitch);

    if (!isHumanNarration && isPlaying) {
      startBrowserSpeechFrom(safeActiveUnitIndex);
    }
  }

  const lineHeightValue =
    displayPreference.lineHeight === "compact"
      ? 1.95
      : displayPreference.lineHeight === "wide"
        ? 2.45
        : 2.2;

  return (
    <main className="min-h-screen bg-white text-black">
      <audio ref={audioRef} preload="metadata">
        {isHumanNarration && humanAudioSrc ? (
          <source src={humanAudioSrc} />
        ) : null}
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
                aria-label={`${safeSeriesTitle}の${workIndexLabel}へ`}
                className="mt-3 inline-flex text-sm text-neutral-600 transition hover:text-black"
              >
                {safeSeriesTitle} · {workIndexLabel}
              </Link>
            ) : (
              <p className="mt-3 text-sm text-neutral-600">{safeSeriesTitle}</p>
            )}

            <h1 className="mt-2 text-3xl font-bold leading-tight text-black sm:text-4xl">
              {safeEpisodeTitle}
            </h1>

            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-neutral-600">
              <span className="inline-flex items-center gap-2">
                <span>作者</span>
                <span>{safeAuthorName}</span>
              </span>

              {safeEditorName ? (
                <span className="inline-flex items-center gap-2">
                  <span>編集</span>
                  <span>{safeEditorName}</span>
                </span>
              ) : null}
            </div>

            {isShortStory && storySummary?.trim() ? (
              <div className="mt-5 rounded-[24px] bg-neutral-50 px-4 py-4">
                <p className="text-xs tracking-[0.16em] text-neutral-500">あらすじ</p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-neutral-700">
                  {storySummary.trim()}
                </p>
              </div>
            ) : null}

            <div className="mt-5 flex flex-wrap gap-2">
              {isNarrationStopped ? (
                <span className="rounded-full border border-black/10 bg-neutral-50 px-4 py-2 text-sm text-neutral-600">
                  朗読停止中
                </span>
              ) : isHumanNarration && humanNarrationName ? (
                humanNarrationAuthorHref ? (
                  <Link
                    href={humanNarrationAuthorHref}
                    className="rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sm text-black transition hover:bg-sky-100"
                  >
                    人の朗読: {humanNarrationName}
                  </Link>
                ) : (
                  <span className="rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sm text-black">
                    人の朗読: {humanNarrationName}
                  </span>
                )
              ) : (
                <span className="rounded-full border border-black/10 bg-neutral-50 px-4 py-2 text-sm text-neutral-600">
                  ブラウザ読み上げ
                </span>
              )}
            </div>

            {isSettingsOpen ? (
              <div className="mt-4 grid gap-4">
                <section className="rounded-[28px] border border-black/10 bg-neutral-50 p-4">
                  <p className="text-xs tracking-[0.18em] text-neutral-500">
                    NARRATION
                  </p>
                  <h3 className="mt-2 text-lg font-semibold text-black">
                    朗読
                  </h3>

                  <div className="mt-4 rounded-2xl border border-black/10 bg-white p-4">
                    <p className="text-sm text-neutral-700">再生方式</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <SettingChip
                        active={!isHumanNarration}
                        label="ブラウザ読み上げ"
                        onClick={setBrowserSource}
                      />
                      {hasHumanRecording ? (
                        <SettingChip
                          active={isHumanNarration}
                          label="人の朗読"
                          onClick={setHumanSource}
                        />
                      ) : null}
                    </div>
                  </div>

                  {isHumanNarration && normalizedHumanNarrationOptions.length > 1 ? (
                    <div className="mt-4 rounded-2xl border border-black/10 bg-white p-4">
                      <p className="text-sm text-neutral-700">朗読者</p>
                      <select
                        value={selectedHumanNarrationOption?.recordingId ?? ""}
                        onChange={(event) => {
                          audioRef.current?.pause();
                          setSelectedHumanRecordingId(event.target.value);
                          setHumanCurrentTime(0);
                          setHumanDuration(0);
                          setIsPlaying(false);
                        }}
                        className="mt-3 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm outline-none transition focus:border-sky-300"
                      >
                        {normalizedHumanNarrationOptions.map((option) => (
                          <option key={option.recordingId} value={option.recordingId}>
                            {option.readerName}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}

                  {!isHumanNarration ? (
                    <>
                      <div className="mt-4 rounded-2xl border border-black/10 bg-white p-4">
                        <p className="text-sm text-neutral-700">
                          朗読者（ブラウザ音声）
                        </p>
                        <p className="mt-1 text-xs leading-6 text-neutral-500">
                          ブラウザと端末に入っている日本語音声から選ぶ。
                        </p>

                        <select
                          value={selectedVoiceURI}
                          onChange={(event) => updateSpeechVoice(event.target.value)}
                          className="mt-3 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm outline-none transition focus:border-sky-300"
                        >
                          {availableVoices.length === 0 ? (
                            <option value="">標準音声</option>
                          ) : (
                            availableVoices.map((voice) => (
                              <option key={voice.voiceURI} value={voice.voiceURI}>
                                {voice.name} / {voice.lang}
                              </option>
                            ))
                          )}
                        </select>
                      </div>

                      <div className="mt-4 rounded-2xl border border-black/10 bg-white p-4">
                        <div className="flex items-center justify-between gap-3 text-sm text-neutral-700">
                          <span>声の高さ</span>
                          <span>{speechPitch.toFixed(1)}</span>
                        </div>
                        <input
                          type="range"
                          min={0.8}
                          max={1.3}
                          step={0.1}
                          value={speechPitch}
                          onChange={(event) => updateSpeechPitch(Number(event.target.value))}
                          className="mt-3 w-full accent-sky-300"
                        />
                      </div>
                    </>
                  ) : null}

                  <div className="mt-4 rounded-2xl border border-black/10 bg-white p-4">
                    <div className="flex items-center justify-between gap-3 text-sm text-neutral-700">
                      <span>朗読音量</span>
                      <span>{Math.round(speechVolume * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={speechVolume}
                      onChange={(event) => {
                        const nextVolume = clampVolume(Number(event.target.value));
                        setSpeechVolume(nextVolume);
                        if (audioRef.current) {
                          audioRef.current.volume = nextVolume;
                        }
                      }}
                      className="mt-3 w-full accent-sky-300"
                    />
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-black/10 bg-white p-4">
                    <div>
                      <p className="text-sm text-neutral-700">朗読停止</p>
                      <p className="mt-1 text-xs leading-6 text-neutral-500">
                        停止中は再生を開始しない。停止解除すると、現在位置から再生できる。
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

                  <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-black/10 bg-white p-4">
                    <div>
                      <p className="text-sm text-neutral-700">次話自動再生</p>
                      <p className="mt-1 text-xs leading-6 text-neutral-500">
                        最後まで読み終えた時に、次の話へ移動する。
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAutoAdvanceToNext((prev) => !prev)}
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
                </section>

                <section className="rounded-[28px] border border-black/10 bg-neutral-50 p-4">
                  <p className="text-xs tracking-[0.18em] text-neutral-500">
                    DISPLAY
                  </p>
                  <h3 className="mt-2 text-lg font-semibold text-black">
                    表示演出
                  </h3>

                  <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-black/10 bg-white p-4">
                    <div>
                      <p className="text-sm text-neutral-700">マーカー表示</p>
                      <p className="mt-1 text-xs leading-6 text-neutral-500">
                        読み上げ中の文章を青いマーカーで強調する。
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <SettingChip
                        active={displayPreference.showMarker}
                        label="表示"
                        onClick={() =>
                          setDisplayPreference((prev) => ({
                            ...prev,
                            showMarker: true,
                          }))
                        }
                      />
                      <SettingChip
                        active={!displayPreference.showMarker}
                        label="非表示"
                        onClick={() =>
                          setDisplayPreference((prev) => ({
                            ...prev,
                            showMarker: false,
                          }))
                        }
                      />
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-black/10 bg-white p-4">
                    <div>
                      <p className="text-sm text-neutral-700">全演出を非表示</p>
                      <p className="mt-1 text-xs leading-6 text-neutral-500">
                        背景、文字装飾、挿絵を一括で隠す。
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setDisplayPreference((prev) => ({
                          ...prev,
                          hideEffects: !prev.hideEffects,
                        }))
                      }
                      className={[
                        "rounded-full border px-4 py-2 text-sm font-medium transition",
                        displayPreference.hideEffects
                          ? "border-sky-200 bg-sky-50 text-black hover:bg-sky-100"
                          : "border-black/10 bg-white text-neutral-700 hover:bg-neutral-50",
                      ].join(" ")}
                    >
                      {displayPreference.hideEffects ? "ON" : "OFF"}
                    </button>
                  </div>

                  <div className="mt-4 rounded-2xl border border-black/10 bg-white p-4">
                    <div className="flex items-center justify-between gap-3 text-sm text-neutral-700">
                      <span>文字サイズ</span>
                      <span>{Math.round(displayPreference.fontScale * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min={0.9}
                      max={1.4}
                      step={0.05}
                      value={displayPreference.fontScale}
                      onChange={(event) =>
                        setDisplayPreference((prev) => ({
                          ...prev,
                          fontScale: clampFontScale(Number(event.target.value)),
                        }))
                      }
                      className="mt-3 w-full accent-sky-300"
                    />
                  </div>

                  <div className="mt-4">
                    <p className="text-sm text-neutral-700">行間</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <SettingChip
                        active={displayPreference.lineHeight === "compact"}
                        label="狭め"
                        onClick={() =>
                          setDisplayPreference((prev) => ({
                            ...prev,
                            lineHeight: "compact",
                          }))
                        }
                      />
                      <SettingChip
                        active={displayPreference.lineHeight === "normal"}
                        label="標準"
                        onClick={() =>
                          setDisplayPreference((prev) => ({
                            ...prev,
                            lineHeight: "normal",
                          }))
                        }
                      />
                      <SettingChip
                        active={displayPreference.lineHeight === "wide"}
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
              </div>
            ) : null}

            {audioError ? (
              <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {audioError}
              </div>
            ) : null}

          </div>

          <div className="px-5 py-8 sm:px-8 sm:py-10">
            {isSettingsOpen ? (
              <div className="rounded-[28px] border border-black/10 bg-neutral-50 p-6 text-sm leading-7 text-neutral-600">
                設定表示中。本文は一時的に隠れている。
              </div>
            ) : (
              <div
                className={[
                  "rounded-[28px] border border-black/10 bg-white p-5 shadow-sm sm:p-6",
                  constrainBodyScroll
                    ? "max-h-[70dvh] overflow-y-auto overscroll-contain"
                    : "",
                ].join(" ")}
              >
                {!displayPreference.hideEffects &&
                appliedEffectSettings.illustrations.length > 0 ? (
                  <div className="mb-6 grid gap-4">
                    {appliedEffectSettings.illustrations
                      .filter((illustration) => illustration.placement !== "scene_break")
                      .map(renderIllustration)}
                  </div>
                ) : null}

                <article
                  className="space-y-7 text-black [&_*]:text-black"
                  style={{
                    fontSize: `${displayPreference.fontScale}rem`,
                    lineHeight: lineHeightValue,
                    ...(displayPreference.hideEffects
                      ? {}
                      : effectTypographyStyle),
                    color: "#111111",
                  }}
                >
                  {contentBlocks.map((block) => {
                    if (block.kind === "scene_break") {
                      if (displayPreference.hideEffects) return null;

                      return (
                        <div key={block.key} className="my-6 grid gap-4">
                          {block.illustrations.map(renderIllustration)}
                        </div>
                      );
                    }

                    return (
                      <p key={block.key}>
                        {block.sentences.map((segment) => {
                          const unitIndex =
                            firstSpeechUnitIndexBySegment.get(segment.index) ?? 0;
                          const isActive =
                            displayPreference.showMarker &&
                            unitIndex === markerUnitIndex;

                          return (
                            <span
                              key={segment.index}
                              ref={(node) => {
                                sentenceRefs.current[unitIndex] = node;
                              }}
                              role="button"
                              tabIndex={0}
                              onClick={() => handleJumpToSentence(segment.index)}
                              onKeyDown={(event) => {
                                if (event.key !== "Enter" && event.key !== " ") {
                                  return;
                                }

                                event.preventDefault();
                                handleJumpToSentence(segment.index);
                              }}
                              className={[
                                "inline cursor-pointer rounded-md px-1 py-1 transition-all duration-200 hover:bg-sky-50/70",
                                isActive
                                  ? "bg-sky-100 text-black shadow-[0_0_0_3px_rgba(186,230,253,0.55)]"
                                  : "",
                              ].join(" ")}
                            >
                              {displayPreference.hideEffects
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
                  })}
                </article>
              </div>
            )}

            {!isSettingsOpen ? ownerActions : null}

            {!isSettingsOpen && showComments && episodeId ? (
              <EpisodeCommentSection
                episodeId={episodeId}
                episodeNumber={episodeNumber}
                loginHref={loginHref}
              />
            ) : null}
          </div>
        </section>
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-black/10 bg-white/92 backdrop-blur">
        <div className="mx-auto max-w-3xl px-4 py-3 sm:px-6">
          <div className="rounded-3xl border border-black/10 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3 text-sm text-neutral-700">
              <span>{currentPositionLabel}</span>
              <span>
                {isHumanNarration ? "公開朗読" : `全${speechUnits.length}ブロック`}
              </span>
            </div>

            <input
              type="range"
              min={0}
              max={currentSliderMax}
              step={isHumanNarration ? 0.1 : 1}
              value={currentSliderValue}
              onChange={handleSliderChange}
              disabled={
                isNarrationStopped ||
                (isHumanNarration ? humanDuration <= 0 : speechUnits.length === 0)
              }
              className="mt-3 w-full accent-sky-300 disabled:opacity-40"
            />
          </div>

          <div className="mt-3 grid w-full grid-cols-7 gap-2">
            <div className="relative">
              {bookmarkMessage ? (
                <span
                  role="status"
                  className="absolute bottom-full left-1/2 z-10 mb-2 w-max max-w-56 -translate-x-1/2 rounded-full bg-black px-3 py-1.5 text-center text-xs text-white shadow-lg"
                >
                  {bookmarkMessage}
                </span>
              ) : null}
              <FooterActionButton
                label="栞"
                iconSrc={
                  isCurrentEpisodeBookmarked
                    ? PLAYER_ICON_PATHS.bookmarkFilled
                    : PLAYER_ICON_PATHS.bookmark
                }
                active={isCurrentEpisodeBookmarked}
                onClick={handleSaveBookmark}
              />
            </div>
            <FooterPlaybackRateControl
              value={playbackRate}
              onDecrease={() => updatePlaybackRate(playbackRate - 0.1)}
              onIncrease={() => updatePlaybackRate(playbackRate + 0.1)}
            />
            <FooterActionButton
              label="前話"
              iconSrc={PLAYER_ICON_PATHS.prev}
              disabled={typeof prevEpisodeNumber !== "number" || !prevEpisodeHref}
              onClick={() => handleMove(prevEpisodeHref)}
            />
            <FooterActionButton
              label={isPlaying ? "停止" : "再生"}
              iconSrc={isPlaying ? PLAYER_ICON_PATHS.stop : PLAYER_ICON_PATHS.play}
              disabled={
                isNarrationStopped ||
                (isHumanNarration
                  ? !humanAudioSrc
                  : speechUnits.length === 0)
              }
              onClick={handleTogglePlay}
            />
            <FooterActionButton
              label="次話"
              iconSrc={PLAYER_ICON_PATHS.next}
              disabled={typeof nextEpisodeNumber !== "number" || !nextEpisodeHref}
              onClick={() => handleMove(nextEpisodeHref)}
            />
            <FooterActionButton
              label={autoFollow ? "自動追尾\nON" : "自動追尾\nOFF"}
              active={autoFollow}
              disabled={isNarrationStopped}
              onClick={() => setAutoFollow((prev) => !prev)}
            />
            <FooterActionButton
              label="設定"
              iconSrc={PLAYER_ICON_PATHS.settings}
              active={isSettingsOpen}
              onClick={() => setIsSettingsOpen((prev) => !prev)}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
