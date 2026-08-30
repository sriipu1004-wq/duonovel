"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAiUsage } from "@/features/usage/useAiUsage";
import { usePremiumBackgroundNarration } from "@/features/playback/usePremiumBackgroundNarration";

type TimeMinutes = 5 | 10 | 15 | 20;

type GenerateRequest = {
  scene: string;
  timeMinutes: TimeMinutes;
  genre: string;
  mood: string;
};

type TimeFitStory = {
  title: string;
  synopsis: string;
  body: string;
  estimatedReadingMinutes: number;
  tags: string[];
  aiGenerated: true;
};

type GeneratedStoryPayload = {
  id: string;
  createdAt: string;
  request: GenerateRequest;
  story: TimeFitStory;
};

type SavedGeneratedStoryPayload = GeneratedStoryPayload & {
  savedAt: string;
  bookmarkUnitIndex: number;
  savedSeriesId?: string;
  savedEpisodeId?: string;
  workspaceHref?: string;
  editHref?: string;
  readHref?: string;
};

type SavedPrivateStoryResult = {
  ok: boolean;
  alreadySaved?: boolean;
  seriesId?: string;
  episodeId?: string;
  workspaceHref?: string;
  editHref?: string;
  readHref?: string;
  error?: string;
};

type PublishStoryResult = {
  ok: boolean;
  alreadyPublished?: boolean;
  seriesId?: string;
  episodeId?: string;
  readHref?: string;
  workHref?: string;
  error?: string;
};

type PlaybackState = "idle" | "playing";

type DisplayPreference = {
  fontScale: number;
  lineHeight: "compact" | "normal" | "wide";
  showMarker: boolean;
};

type SpeechVoiceOption = {
  voiceURI: string;
  name: string;
  lang: string;
};

const SAVED_STORIES_KEY = "libread.savedGeneratedStories.v1";

const DEFAULT_DISPLAY_PREFERENCE: DisplayPreference = {
  fontScale: 1,
  lineHeight: "normal",
  showMarker: true,
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

function buildGeneratedStoryStorageKey(storyId: string): string {
  return `libread.generatedStory.${storyId}`;
}

function clampFontScale(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_DISPLAY_PREFERENCE.fontScale;
  return Math.min(1.4, Math.max(0.9, value));
}

function clampPlaybackRate(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(1.5, Math.max(0.7, value));
}

function formatGeneratedTime(index: number, total: number): string {
  if (total <= 0) return "0 / 0";
  return `${Math.min(total, Math.max(0, index + 1))} / ${total}`;
}

function splitBodyParagraphs(body: string): string[] {
  return body
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function splitSentences(text: string): string[] {
  const normalized = text
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return normalized
    .split(/(?<=[。！？\n])/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
}

function readSavedStories(): SavedGeneratedStoryPayload[] {
  if (typeof window === "undefined") return [];

  const raw = window.localStorage.getItem(SAVED_STORIES_KEY);

  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as SavedGeneratedStoryPayload[]) : [];
  } catch {
    return [];
  }
}

function readGeneratedStoryRecord(storyId: string): {
  payload: GeneratedStoryPayload | null;
  bookmarkUnitIndex: number;
  isSaved: boolean;
  savedSeriesId: string;
  savedEpisodeId: string;
  workspaceHref: string;
  editHref: string;
  readHref: string;
} {
  if (typeof window === "undefined") {
    return {
      payload: null,
      bookmarkUnitIndex: 0,
      isSaved: false,
      savedSeriesId: "",
      savedEpisodeId: "",
      workspaceHref: "",
      editHref: "",
      readHref: "",
    };
  }

  const savedStory =
    readSavedStories().find((item) => item.id === storyId) ?? null;

  const sessionRaw = window.sessionStorage.getItem(
    buildGeneratedStoryStorageKey(storyId)
  );

  if (sessionRaw) {
    try {
      const parsed = JSON.parse(sessionRaw) as GeneratedStoryPayload;

      if (parsed?.story?.title && parsed?.story?.body) {
        return {
          payload: parsed,
          bookmarkUnitIndex: savedStory?.bookmarkUnitIndex ?? 0,
          isSaved: Boolean(savedStory),
          savedSeriesId: savedStory?.savedSeriesId ?? "",
          savedEpisodeId: savedStory?.savedEpisodeId ?? "",
          workspaceHref: savedStory?.workspaceHref ?? "",
          editHref: savedStory?.editHref ?? "",
          readHref: savedStory?.readHref ?? "",
        };
      }
    } catch {
      // noop
    }
  }

  if (savedStory?.story?.title && savedStory?.story?.body) {
    return {
      payload: savedStory,
      bookmarkUnitIndex: savedStory.bookmarkUnitIndex ?? 0,
      isSaved: true,
      savedSeriesId: savedStory.savedSeriesId ?? "",
      savedEpisodeId: savedStory.savedEpisodeId ?? "",
      workspaceHref: savedStory.workspaceHref ?? "",
      editHref: savedStory.editHref ?? "",
      readHref: savedStory.readHref ?? "",
    };
  }

  return {
    payload: null,
    bookmarkUnitIndex: 0,
    isSaved: false,
    savedSeriesId: "",
    savedEpisodeId: "",
    workspaceHref: "",
    editHref: "",
    readHref: "",
  };
}

function saveGeneratedStory(
  payload: GeneratedStoryPayload,
  bookmarkUnitIndex: number,
  savedInfo?: {
    savedSeriesId?: string;
    savedEpisodeId?: string;
    workspaceHref?: string;
    editHref?: string;
    readHref?: string;
  }
): void {
  const savedStories = readSavedStories();

  const nextStory: SavedGeneratedStoryPayload = {
    ...payload,
    savedAt: new Date().toISOString(),
    bookmarkUnitIndex,
    savedSeriesId: savedInfo?.savedSeriesId,
    savedEpisodeId: savedInfo?.savedEpisodeId,
    workspaceHref: savedInfo?.workspaceHref,
    editHref: savedInfo?.editHref,
    readHref: savedInfo?.readHref,
  };

  const nextStories = [
    nextStory,
    ...savedStories.filter((item) => item.id !== payload.id),
  ].slice(0, 30);

  window.localStorage.setItem(SAVED_STORIES_KEY, JSON.stringify(nextStories));
}

function buildPostDraftPayload(
  payload: GeneratedStoryPayload,
  editorName: string
): void {
  const genres = Array.from(new Set([payload.request.genre].filter(Boolean)));

  const tags = Array.from(
    new Set([
      "AI生成",
      "時間指定AI短編",
      payload.request.scene,
      payload.request.mood,
      `${payload.request.timeMinutes}分`,
      ...payload.story.tags,
    ])
  ).filter(Boolean);

  window.localStorage.setItem(
    "libread.pendingGeneratedPost.v1",
    JSON.stringify({
      source: "time_fit_ai_story",
      createdAt: new Date().toISOString(),
      authorName: "AI生成",
      editorName: editorName || "",
      title: payload.story.title,
      synopsis: payload.story.synopsis,
      body: payload.story.body,
      genres,
      tags,
      request: payload.request,
    })
  );
}

function FooterActionButton({
  label,
  iconSrc,
  disabled,
  active,
  accent,
  onClick,
}: {
  label: string;
  iconSrc?: string;
  disabled?: boolean;
  active?: boolean;
  accent?: boolean;
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
        "flex min-h-14 items-center justify-center rounded-2xl border px-2 py-2 transition",
        active
          ? "border-sky-200 bg-sky-50 text-black hover:bg-sky-100"
          : "border-black/10 bg-white text-neutral-700 hover:bg-neutral-50",
        disabled ? "cursor-not-allowed opacity-40" : "",
      ].join(" ")}
    >
      {iconSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={iconSrc}
          alt=""
          className="h-7 w-7"
        />
      ) : (
        <span className="whitespace-pre-line text-xs font-medium">{label}</span>
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
    <div className="flex min-h-14 items-center justify-center rounded-2xl border border-black/10 bg-white px-1 py-2">
      <button
        type="button"
        onClick={onDecrease}
        className="rounded-full px-2 py-1 text-sm text-neutral-700 transition hover:bg-neutral-100"
      >
        -
      </button>
      <span className="min-w-10 text-center text-[11px] font-medium text-black">
        {value.toFixed(1)}x
      </span>
      <button
        type="button"
        onClick={onIncrease}
        className="rounded-full px-2 py-1 text-sm text-neutral-700 transition hover:bg-neutral-100"
      >
        +
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
          ? "border-sky-200 bg-sky-50 text-black hover:bg-sky-100"
          : "border-black/10 bg-white text-neutral-700 hover:bg-neutral-50",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

export default function GeneratedStoryReaderClient({
  storyId,
}: {
  storyId: string;
}) {
  const { snapshot: aiUsage } = useAiUsage();
  const [payload, setPayload] = useState<GeneratedStoryPayload | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [playbackState, setPlaybackState] = useState<PlaybackState>("idle");
  const [activeUnitIndex, setActiveUnitIndex] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [autoFollow, setAutoFollow] = useState(true);
  const [isBookmarkPanelExpanded, setIsBookmarkPanelExpanded] = useState(false);
  const [isCurrentStorySaved, setIsCurrentStorySaved] = useState(false);
  const [bookmarkMessage, setBookmarkMessage] = useState("");
  const [savedSeriesId, setSavedSeriesId] = useState("");
  const [savedEpisodeId, setSavedEpisodeId] = useState("");
  const [savedWorkspaceHref, setSavedWorkspaceHref] = useState("");
  const [savedEditHref, setSavedEditHref] = useState("");
  const [savedReadHref, setSavedReadHref] = useState("");
  const [saveWorking, setSaveWorking] = useState(false);
  const [publishWorking, setPublishWorking] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [displayPreference, setDisplayPreference] =
    useState<DisplayPreference>(DEFAULT_DISPLAY_PREFERENCE);
  const [errorMessage, setErrorMessage] = useState("");
  const [availableVoices, setAvailableVoices] = useState<SpeechVoiceOption[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState("");
  const [speechPitch, setSpeechPitch] = useState(1);
  const [currentEditorName, setCurrentEditorName] = useState("");

  const unitRefs = useRef<Record<number, HTMLSpanElement | null>>({});
  const speechUnitsRef = useRef<string[]>([]);
  const activeUnitIndexRef = useRef(activeUnitIndex);
  const playbackRateRef = useRef(playbackRate);
  const selectedVoiceURIRef = useRef(selectedVoiceURI);
  const speechPitchRef = useRef(speechPitch);
  const playbackRunIdRef = useRef(0);
  const bookmarkToastTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const record = readGeneratedStoryRecord(storyId);

    setPayload(record.payload);
    setActiveUnitIndex(record.bookmarkUnitIndex);
    setIsCurrentStorySaved(record.isSaved);
    setSavedSeriesId(record.savedSeriesId);
    setSavedEpisodeId(record.savedEpisodeId);
    setSavedWorkspaceHref(record.workspaceHref);
    setSavedEditHref(record.editHref);
    setSavedReadHref(record.readHref);
    setLoaded(true);
    return () => {
      playbackRunIdRef.current += 1;

      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }

      if (bookmarkToastTimeoutRef.current) {
        window.clearTimeout(bookmarkToastTimeoutRef.current);
      }
    };
  }, [storyId]);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      return;
    }

    function loadVoices() {
      const voices = window.speechSynthesis
        .getVoices()
        .filter((voice) => voice.lang.toLowerCase().startsWith("ja"))
        .map((voice) => ({
          voiceURI: voice.voiceURI,
          name: voice.name,
          lang: voice.lang,
        }));

      setAvailableVoices(voices);

      if (!selectedVoiceURIRef.current && voices.length > 0) {
        selectedVoiceURIRef.current = voices[0].voiceURI;
        setSelectedVoiceURI(voices[0].voiceURI);
      }
    }

    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);

    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
    };
  }, []);

  useEffect(() => {
    async function loadCurrentUserName() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setCurrentEditorName("");
        return;
      }

      const metadata = user.user_metadata as Record<string, unknown> | null;
      const candidates = [
        metadata?.display_name,
        metadata?.displayName,
        metadata?.name,
        metadata?.full_name,
        user.email,
      ];

      const name =
        candidates.find(
          (value): value is string =>
            typeof value === "string" && value.trim().length > 0
        ) ?? "";

      setCurrentEditorName(name.trim());
    }

    void loadCurrentUserName();
  }, []);

  useEffect(() => {
    function handleUserScrollIntent() {
      setAutoFollow(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (
        [
          "ArrowUp",
          "ArrowDown",
          "PageUp",
          "PageDown",
          "Home",
          "End",
          " ",
        ].includes(event.key)
      ) {
        setAutoFollow(false);
      }
    }

    window.addEventListener("wheel", handleUserScrollIntent, { passive: true });
    window.addEventListener("touchstart", handleUserScrollIntent, {
      passive: true,
    });
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("wheel", handleUserScrollIntent);
      window.removeEventListener("touchstart", handleUserScrollIntent);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const bodyParagraphs = useMemo(
    () => splitBodyParagraphs(payload?.story.body ?? ""),
    [payload?.story.body]
  );

  const bodySentenceGroups = useMemo(
    () => bodyParagraphs.map((paragraph) => splitSentences(paragraph)),
    [bodyParagraphs]
  );

  const speechUnits = useMemo(() => {
    return bodySentenceGroups.flat().filter((unit) => unit.trim().length > 0);
  }, [bodySentenceGroups]);

  const bodyUnitStartIndex = 0;
  const maxUnitIndex = Math.max(0, speechUnits.length - 1);
  const safeActiveUnitIndex =
    speechUnits.length === 0
      ? 0
      : Math.min(maxUnitIndex, Math.max(0, activeUnitIndex));
  const isSubscriber = aiUsage?.isSubscriber === true;

  const lineHeightValue =
    displayPreference.lineHeight === "compact"
      ? 1.75
      : displayPreference.lineHeight === "wide"
        ? 2.45
        : 2.1;

  const readingStyle: CSSProperties = {
    fontSize: `${displayPreference.fontScale}rem`,
    lineHeight: lineHeightValue,
  };

  useEffect(() => {
    speechUnitsRef.current = speechUnits;
  }, [speechUnits]);

  useEffect(() => {
    activeUnitIndexRef.current = activeUnitIndex;
  }, [activeUnitIndex]);

  useEffect(() => {
    playbackRateRef.current = playbackRate;
  }, [playbackRate]);

  useEffect(() => {
    selectedVoiceURIRef.current = selectedVoiceURI;
  }, [selectedVoiceURI]);

  useEffect(() => {
    speechPitchRef.current = speechPitch;
  }, [speechPitch]);

  useEffect(() => {
    if (!autoFollow || safeActiveUnitIndex < 0) {
      return;
    }

    const node = unitRefs.current[safeActiveUnitIndex];

    if (!node) {
      return;
    }

    node.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, [safeActiveUnitIndex, autoFollow]);

  function buildSavePrivatePayload() {
    if (!payload) {
      return null;
    }

    return {
      storyId: payload.id,
      createdAt: payload.createdAt,
      title: payload.story.title,
      synopsis: payload.story.synopsis,
      body: payload.story.body,
      estimatedReadingMinutes: payload.story.estimatedReadingMinutes,
      request: payload.request,
      tags: payload.story.tags,
      bookmarkUnitIndex: safeActiveUnitIndex,
      editorName: currentEditorName,
    };
  }

  async function ensureSavedPrivateStory(): Promise<SavedPrivateStoryResult | null> {
    if (!payload) {
      return null;
    }

    if (savedSeriesId) {
      saveGeneratedStory(payload, safeActiveUnitIndex, {
        savedSeriesId,
        savedEpisodeId,
        workspaceHref: savedWorkspaceHref,
        editHref: savedEditHref,
        readHref: savedReadHref,
      });

      return {
        ok: true,
        alreadySaved: true,
        seriesId: savedSeriesId,
        episodeId: savedEpisodeId,
        workspaceHref: savedWorkspaceHref,
        editHref: savedEditHref,
        readHref: savedReadHref,
      };
    }

    const apiPayload = buildSavePrivatePayload();

    if (!apiPayload) {
      return null;
    }

    setSaveWorking(true);
    setErrorMessage("");

    try {
      const response = await fetch("/api/time-fit-stories/save-private", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(apiPayload),
      });

      const result = (await response.json()) as SavedPrivateStoryResult;

      if (!response.ok || !result.ok || !result.seriesId) {
        const message = result.error || "保存に失敗した。";
        setErrorMessage(message);
        showBookmarkMessage(message);
        return result;
      }

      const nextSavedSeriesId = result.seriesId;
      const nextSavedEpisodeId = result.episodeId ?? "";
      const nextWorkspaceHref =
        result.workspaceHref ?? `/write/series/${nextSavedSeriesId}`;
      const nextEditHref =
        result.editHref ||
        (nextSavedEpisodeId
          ? `/write/series/${nextSavedSeriesId}/episodes/${nextSavedEpisodeId}`
          : `/write/series/${nextSavedSeriesId}`);
      const nextReadHref = result.readHref ?? `/read/${nextSavedSeriesId}/1`;

      setSavedSeriesId(nextSavedSeriesId);
      setSavedEpisodeId(nextSavedEpisodeId);
      setSavedWorkspaceHref(nextWorkspaceHref);
      setSavedEditHref(nextEditHref);
      setSavedReadHref(nextReadHref);
      setIsCurrentStorySaved(true);

      saveGeneratedStory(payload, safeActiveUnitIndex, {
        savedSeriesId: nextSavedSeriesId,
        savedEpisodeId: nextSavedEpisodeId,
        workspaceHref: nextWorkspaceHref,
        editHref: nextEditHref,
        readHref: nextReadHref,
      });

      return {
        ...result,
        seriesId: nextSavedSeriesId,
        episodeId: nextSavedEpisodeId,
        workspaceHref: nextWorkspaceHref,
        editHref: nextEditHref,
        readHref: nextReadHref,
      };
    } catch {
      const message = "保存通信に失敗した。";
      setErrorMessage(message);
      showBookmarkMessage(message);
      return null;
    } finally {
      setSaveWorking(false);
    }
  }

  function showBookmarkMessage(message: string) {
    setBookmarkMessage(message);

    if (bookmarkToastTimeoutRef.current) {
      window.clearTimeout(bookmarkToastTimeoutRef.current);
    }

    bookmarkToastTimeoutRef.current = window.setTimeout(() => {
      setBookmarkMessage("");
    }, 1800);
  }

  function stopSpeech() {
    playbackRunIdRef.current += 1;

    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }

    setPlaybackState("idle");
  }

  function speakFrom(index: number, runId: number) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setErrorMessage("このブラウザでは読み上げ機能を利用できません。");
      setPlaybackState("idle");
      return;
    }

    if (runId !== playbackRunIdRef.current) {
      return;
    }

    const units = speechUnitsRef.current;
    const unit = units[index];

    if (!unit) {
      setPlaybackState("idle");
      return;
    }

    setActiveUnitIndex(index);
    setPlaybackState("playing");

    const utterance = new SpeechSynthesisUtterance(unit);
    utterance.lang = "ja-JP";
    utterance.rate = playbackRateRef.current;
    utterance.pitch = speechPitchRef.current;
    utterance.volume = 1;

    const selectedVoice = window.speechSynthesis
      .getVoices()
      .find((voice) => voice.voiceURI === selectedVoiceURIRef.current);

    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }

    utterance.onend = () => {
      if (runId !== playbackRunIdRef.current) {
        return;
      }

      const nextIndex = index + 1;

      if (nextIndex >= units.length) {
        setPlaybackState("idle");
        return;
      }

      speakFrom(nextIndex, runId);
    };

    utterance.onerror = () => {
      if (runId === playbackRunIdRef.current) {
        setPlaybackState("idle");
      }
    };

    window.speechSynthesis.speak(utterance);
  }

  function startPlaybackFrom(index: number) {
    if (speechUnits.length === 0) {
      return;
    }

    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setErrorMessage("このブラウザでは読み上げ機能を利用できません。");
      return;
    }

    playbackRunIdRef.current += 1;
    window.speechSynthesis.cancel();

    const runId = playbackRunIdRef.current;
    const boundedIndex = Math.min(Math.max(0, index), speechUnits.length - 1);

    setActiveUnitIndex(boundedIndex);
    setPlaybackState("playing");

    window.setTimeout(() => {
      speakFrom(boundedIndex, runId);
    }, 0);
  }

  function handleTogglePlay() {
    if (playbackState === "playing") {
      stopSpeech();
      return;
    }

    startPlaybackFrom(safeActiveUnitIndex);
  }

  function handleSliderChange(event: React.ChangeEvent<HTMLInputElement>) {
    const nextIndex = Number(event.target.value);

    if (!Number.isFinite(nextIndex)) {
      return;
    }

    const boundedIndex = Math.min(
      Math.max(0, nextIndex),
      Math.max(0, speechUnits.length - 1)
    );

    setActiveUnitIndex(boundedIndex);

    if (playbackState === "playing") {
      startPlaybackFrom(boundedIndex);
    }
  }

  function handleJumpToUnit(index: number) {
    setActiveUnitIndex(index);

    if (playbackState === "playing") {
      startPlaybackFrom(index);
    }
  }

  function handleDecreasePlaybackRate() {
    const nextRate = clampPlaybackRate(playbackRate - 0.1);
    setPlaybackRate(nextRate);

    if (playbackState === "playing") {
      startPlaybackFrom(safeActiveUnitIndex);
    }
  }

  function handleIncreasePlaybackRate() {
    const nextRate = clampPlaybackRate(playbackRate + 0.1);
    setPlaybackRate(nextRate);

    if (playbackState === "playing") {
      startPlaybackFrom(safeActiveUnitIndex);
    }
  }

  async function handleSave() {
    if (!payload) {
      return;
    }

    const result = await ensureSavedPrivateStory();

    if (!result?.ok) {
      return;
    }

    showBookmarkMessage(
      result.alreadySaved
        ? "保存済み作品の現在位置を更新した"
        : "マイページに保存した"
    );
  }

  async function handleEditAndPost() {
    if (!payload) {
      return;
    }

    buildPostDraftPayload(payload, currentEditorName);

    const result = await ensureSavedPrivateStory();

    if (!result?.ok || !result.seriesId) {
      return;
    }

    window.location.href =
      result.editHref ||
      savedEditHref ||
      (result.episodeId
        ? `/write/series/${result.seriesId}/episodes/${result.episodeId}`
        : `/write/series/${result.seriesId}`);
  }

  async function handlePublish() {
    if (!payload) {
      return;
    }

    buildPostDraftPayload(payload, currentEditorName);

    const saveResult = await ensureSavedPrivateStory();

    if (!saveResult?.ok || !saveResult.seriesId) {
      return;
    }

    setPublishWorking(true);
    setErrorMessage("");

    try {
      const response = await fetch("/api/time-fit-stories/publish", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          seriesId: saveResult.seriesId,
        }),
      });

      const result = (await response.json()) as PublishStoryResult;

      if (!response.ok || !result.ok) {
        const message = result.error || "投稿に失敗した。";
        setErrorMessage(message);
        showBookmarkMessage(message);
        return;
      }

      window.location.href =
        result.readHref ||
        saveResult.readHref ||
        savedReadHref ||
        `/read/${saveResult.seriesId}/1`;
    } catch {
      const message = "投稿通信に失敗した。";
      setErrorMessage(message);
      showBookmarkMessage(message);
    } finally {
      setPublishWorking(false);
    }
  }

  usePremiumBackgroundNarration({
    isSubscriber,
    isPlaying: playbackState === "playing",
    title: payload?.story.title ?? "AI生成物語",
    artist: currentEditorName || "LIB read",
    album: "LIB read AI生成物語",
    onPlay: () => {
      if (playbackState !== "playing") handleTogglePlay();
    },
    onPause: stopSpeech,
  });

  if (!loaded) {
    return (
      <main className="min-h-screen bg-white text-black">
        <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
          <div className="rounded-[32px] border border-black/10 bg-white p-6 shadow-sm">
            <p className="text-sm text-neutral-600">読み込み中...</p>
          </div>
        </div>
      </main>
    );
  }

  if (!payload) {
    return (
      <main className="min-h-screen bg-white text-black">
        <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
          <div className="rounded-[32px] border border-black/10 bg-white p-6 shadow-sm">
            <p className="text-[11px] tracking-[0.22em] text-neutral-500">
              GENERATED STORY
            </p>
            <h1 className="mt-3 text-2xl font-bold text-black">
              生成された物語が見つかりません
            </h1>
            <p className="mt-3 text-sm leading-7 text-neutral-600">
              保存していない生成結果は、このブラウザの一時データが消えると開けなくなります。
              もう一度生成してください。
            </p>
            <Link
              href="/generate"
              className="mt-6 inline-flex rounded-full bg-black px-5 py-3 text-sm font-medium text-white transition hover:bg-neutral-800"
            >
              物語を生成する
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const story = payload.story;
  const request = payload.request;

  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto w-full max-w-3xl px-4 pb-44 pt-6 sm:px-6">
        <section className="overflow-hidden rounded-[32px] border border-black/10 bg-white shadow-sm">
          <div className="border-b border-black/10 px-5 py-6 sm:px-8">
            <p className="text-xs tracking-[0.22em] text-neutral-500">
              LIB READ READER
            </p>

            <p className="mt-3 text-sm text-neutral-600">
              時間フィットAI短編
            </p>

            <h1 className="mt-2 text-3xl font-bold leading-tight text-black sm:text-4xl">
              {story.title}
            </h1>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-neutral-600">
              <span>作者:</span>
              <Link
                href="/search?tag=AI%E7%94%9F%E6%88%90"
                className="font-medium text-sky-700 underline-offset-4 hover:underline"
              >
                AI生成
              </Link>

              {currentEditorName ? (
                <>
                  <span className="text-neutral-400">/</span>
                  <span>編集: {currentEditorName}</span>
                </>
              ) : null}
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <span className="rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sm text-black">
                AI生成
              </span>
              <span className="rounded-full border border-black/10 bg-neutral-50 px-4 py-2 text-sm text-neutral-700">
                約{story.estimatedReadingMinutes}分
              </span>
              <span className="rounded-full border border-black/10 bg-neutral-50 px-4 py-2 text-sm text-neutral-700">
                {request.scene} / {request.genre} / {request.mood}
              </span>
            </div>

            {isSettingsOpen ? (
              <div className="mt-4 grid gap-4">
                <section className="rounded-[28px] border border-black/10 bg-neutral-50 p-4">
                  <p className="text-xs tracking-[0.18em] text-neutral-500">
                    DISPLAY
                  </p>
                  <h3 className="mt-2 text-lg font-semibold text-black">
                    表示設定
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

                  <div className="mt-4 rounded-2xl border border-black/10 bg-white p-4">
                    <div className="flex items-center justify-between gap-3 text-sm text-neutral-700">
                      <span>文字サイズ</span>
                      <span>
                        {Math.round(displayPreference.fontScale * 100)}%
                      </span>
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

                  <div className="mt-4 rounded-2xl border border-black/10 bg-white p-4">
                    <p className="text-sm text-neutral-700">読み上げ音声</p>
                    <p className="mt-1 text-xs leading-6 text-neutral-500">
                      ブラウザと端末に入っている日本語音声から選ぶ。
                    </p>

                    <select
                      value={selectedVoiceURI}
                      onChange={(event) => {
                        selectedVoiceURIRef.current = event.target.value;
                        setSelectedVoiceURI(event.target.value);

                        if (playbackState === "playing") {
                          startPlaybackFrom(safeActiveUnitIndex);
                        }
                      }}
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
                      onChange={(event) => {
                        const nextPitch = Number(event.target.value);
                        speechPitchRef.current = nextPitch;
                        setSpeechPitch(nextPitch);

                        if (playbackState === "playing") {
                          startPlaybackFrom(safeActiveUnitIndex);
                        }
                      }}
                      className="mt-3 w-full accent-sky-300"
                    />
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-black/10 bg-white p-4">
                    <div>
                      <p className="text-sm text-neutral-700">
                        バックグラウンド再生
                      </p>
                      <p className="mt-1 text-xs leading-6 text-neutral-500">
                        {isSubscriber
                          ? "別画面を開いても朗読を続ける。"
                          : "有料プランで利用できます。"}
                      </p>
                    </div>
                    {isSubscriber ? (
                      <span className="shrink-0 rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-medium text-black">
                        有効
                      </span>
                    ) : (
                      <Link
                        href="/subscription"
                        className="shrink-0 rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-medium text-black"
                      >
                        サブスク限定
                      </Link>
                    )}
                  </div>
                </section>
              </div>
            ) : null}

            {errorMessage ? (
              <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {errorMessage}
              </div>
            ) : null}

            {bookmarkMessage ? (
              <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-black">
                {bookmarkMessage}
              </div>
            ) : null}
          </div>

          <div className="px-5 py-8 sm:px-8 sm:py-10">
            {isSettingsOpen ? (
              <div className="rounded-[28px] border border-black/10 bg-neutral-50 p-6 text-sm leading-7 text-neutral-600">
                設定表示中。本文は一時的に隠れている。
              </div>
            ) : (
              <>
                <div className="rounded-[28px] bg-neutral-50 p-5 sm:p-7">
                  <p className="text-sm leading-7 text-neutral-700">
                    {story.synopsis}
                  </p>
                </div>

                <article
                  className="mt-8 space-y-7 text-black"
                  style={readingStyle}
                >
                  {bodySentenceGroups.map((sentences, paragraphIndex) => {
                    const previousSentenceCount = bodySentenceGroups
                      .slice(0, paragraphIndex)
                      .reduce((sum, group) => sum + group.length, 0);

                    return (
                      <p key={paragraphIndex}>
                        {sentences.map((sentence, sentenceIndex) => {
                          const unitIndex =
                            bodyUnitStartIndex +
                            previousSentenceCount +
                            sentenceIndex;
                          const isActive =
                            displayPreference.showMarker &&
                            unitIndex === safeActiveUnitIndex;

                          return (
                            <span
                              key={`${paragraphIndex}-${sentenceIndex}`}
                              ref={(node) => {
                                unitRefs.current[unitIndex] = node;
                              }}
                              role="button"
                              tabIndex={0}
                              onClick={() => handleJumpToUnit(unitIndex)}
                              onKeyDown={(event) => {
                                if (
                                  event.key !== "Enter" &&
                                  event.key !== " "
                                ) {
                                  return;
                                }

                                event.preventDefault();
                                handleJumpToUnit(unitIndex);
                              }}
                              className={[
                                "inline cursor-pointer rounded-md px-1 py-1 transition-all duration-200 hover:bg-sky-50/70",
                                isActive
                                  ? "bg-sky-100 text-black shadow-[0_0_0_3px_rgba(186,230,253,0.55)]"
                                  : "",
                              ].join(" ")}
                            >
                              {sentence}
                            </span>
                          );
                        })}
                      </p>
                    );
                  })}
                </article>
              </>
            )}
          </div>
        </section>

        <div className="mt-5 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={() => {
              void handleSave();
            }}
            disabled={saveWorking || publishWorking}
            className="rounded-full border border-sky-200 bg-sky-50 px-5 py-3 text-sm font-medium text-black transition hover:bg-sky-100 disabled:cursor-wait disabled:opacity-70"
          >
            {saveWorking
              ? "保存中..."
              : isCurrentStorySaved
                ? "保存済み"
                : "保存する"}
          </button>

          <button
            type="button"
            onClick={() => {
              void handleEditAndPost();
            }}
            disabled={saveWorking || publishWorking}
            className="rounded-full border border-black/10 bg-white px-5 py-3 text-sm font-medium text-neutral-800 transition hover:bg-neutral-50 disabled:cursor-wait disabled:opacity-70"
          >
            {saveWorking ? "保存中..." : "編集して投稿する"}
          </button>

          <button
            type="button"
            onClick={() => {
              void handlePublish();
            }}
            disabled={saveWorking || publishWorking}
            className="rounded-full bg-black px-5 py-3 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:cursor-wait disabled:opacity-70"
          >
            {publishWorking ? "投稿中..." : saveWorking ? "保存中..." : "投稿する"}
          </button>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-black/10 bg-white/92 backdrop-blur">
        <div className="mx-auto max-w-3xl px-4 py-3 sm:px-6">
          {isBookmarkPanelExpanded ? (
            <div className="mb-3 rounded-3xl border border-black/10 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-black">この物語を保存</p>
                  <p className="mt-1 text-xs leading-6 text-neutral-500">
                    保存するとマイページのブックマーク作品に追加されます。保存は直近24時間で5回まで、公開投稿は直近24時間で1回までです。
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setIsBookmarkPanelExpanded(false)}
                  className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-neutral-700 transition hover:bg-neutral-50"
                >
                  閉じる
                </button>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    void handleSave();
                  }}
                  disabled={saveWorking}
                  className={[
                    "rounded-full border px-4 py-2 text-sm font-medium transition",
                    isCurrentStorySaved
                      ? "border-sky-200 bg-sky-50 text-black hover:bg-sky-100"
                      : "border-black/10 bg-white text-neutral-700 hover:bg-neutral-50",
                    saveWorking ? "cursor-wait opacity-70" : "",
                  ].join(" ")}
                >
                  {saveWorking
                    ? "保存中..."
                    : isCurrentStorySaved
                      ? "保存位置を更新"
                      : "この物語を保存"}
                </button>

                <span className="rounded-full border border-black/10 bg-neutral-50 px-4 py-2 text-xs text-neutral-600">
                  現在 {formatGeneratedTime(safeActiveUnitIndex, speechUnits.length)}
                </span>
              </div>
            </div>
          ) : null}

          <div className="rounded-3xl border border-black/10 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3 text-sm text-neutral-700">
              <span>{formatGeneratedTime(safeActiveUnitIndex, speechUnits.length)}</span>
              <span>全{speechUnits.length}ブロック</span>
            </div>

            <input
              type="range"
              min={0}
              max={Math.max(0, speechUnits.length - 1)}
              step={1}
              value={safeActiveUnitIndex}
              onChange={handleSliderChange}
              disabled={speechUnits.length === 0}
              className="mt-3 w-full accent-sky-300 disabled:opacity-40"
            />
          </div>

          <div className="mt-3 grid w-full grid-cols-7 gap-2">
            <FooterActionButton
              label={
                isBookmarkPanelExpanded
                  ? "保存 OPEN"
                  : isCurrentStorySaved
                    ? "保存済み"
                    : "保存"
              }
              iconSrc={
                isCurrentStorySaved
                  ? PLAYER_ICON_PATHS.bookmarkFilled
                  : PLAYER_ICON_PATHS.bookmark
              }
              active={isBookmarkPanelExpanded || isCurrentStorySaved}
              onClick={() => setIsBookmarkPanelExpanded((prev) => !prev)}
            />

            <FooterPlaybackRateControl
              value={playbackRate}
              onDecrease={handleDecreasePlaybackRate}
              onIncrease={handleIncreasePlaybackRate}
            />

            <FooterActionButton
              label="前話"
              iconSrc={PLAYER_ICON_PATHS.prev}
              disabled
            />

            <FooterActionButton
              label={playbackState === "playing" ? "停止" : "再生"}
              iconSrc={
                playbackState === "playing"
                  ? PLAYER_ICON_PATHS.stop
                  : PLAYER_ICON_PATHS.play
              }
              disabled={speechUnits.length === 0}
              onClick={handleTogglePlay}
            />

            <FooterActionButton
              label="次話"
              iconSrc={PLAYER_ICON_PATHS.next}
              disabled
            />

            <FooterActionButton
              label={autoFollow ? "自動追尾\nON" : "自動追尾\nOFF"}
              active={autoFollow}
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
