"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  FooterActionButton,
  FooterPlaybackRateControl,
  PLAYER_ICON_PATHS,
} from "@/features/playback/ReaderFooterControls";
import { useUiLocale } from "@/i18n/UiLocaleProvider";
import { readerDictionaries } from "@/i18n/dictionaries/reader";
import {
  applyReadingModeToHref,
  writeReadingBookmark,
} from "@/lib/playback/readingBookmark";
import {
  readNarrationStopped,
  readWebSpeechSettings,
  writeNarrationStopped,
  writeWebSpeechSettings,
  type StoredWebSpeechDisplaySettings,
  type StoredWebSpeechSettings,
} from "@/lib/playback/webSpeechPreferences";
import {
  getSupportedLanguage,
  type SupportedLanguageTag,
} from "@/lib/translation/languageRegistry";

type Props = {
  seriesId: string;
  episodeNumber: number;
  positionIndex: number;
  paragraphIndex?: number;
  sentenceIndex?: number;
  narrationUnits: string[];
  sourceLanguage: SupportedLanguageTag;
  targetLanguage: SupportedLanguageTag;
  prevHref?: string | null;
  nextHref?: string | null;
  displaySettings: StoredWebSpeechDisplaySettings;
  onDisplaySettingsChange: (settings: StoredWebSpeechDisplaySettings) => void;
  onPositionIndexChange: (index: number, shouldFollow: boolean) => void;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function buildTranslatedEpisodeHref(
  href: string,
  sourceLanguage: SupportedLanguageTag,
  targetLanguage: SupportedLanguageTag
): string {
  const baseHref = applyReadingModeToHref(href, {
    mode: "translation",
    sourceLanguage,
    targetLanguage,
    positionIndex: 0,
  });
  const url = new URL(baseHref, "https://libread.local");
  // Navigation itself is an explicit Reader request. Preserve generation intent
  // so a ready shared asset stays quota-free while a missing asset follows the
  // existing generation/quota path on arrival.
  url.searchParams.set("autoGenerate", "1");
  return `${url.pathname}${url.search}${url.hash}`;
}

export default function TranslationOnlyFooter({
  seriesId,
  episodeNumber,
  positionIndex,
  paragraphIndex,
  sentenceIndex,
  narrationUnits,
  sourceLanguage,
  targetLanguage,
  prevHref,
  nextHref,
  displaySettings,
  onDisplaySettingsChange,
  onPositionIndexChange,
}: Props) {
  const router = useRouter();
  const dictionary = readerDictionaries[useUiLocale()];
  const speechRunIdRef = useRef(0);
  const toastTimerRef = useRef<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [autoFollow, setAutoFollow] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [bookmarkMessage, setBookmarkMessage] = useState("");
  const [narrationStopped, setNarrationStopped] = useState(() =>
    readNarrationStopped(seriesId)
  );
  const [speechSettings, setSpeechSettings] = useState<StoredWebSpeechSettings>(
    () => readWebSpeechSettings(seriesId)
  );
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  const safeIndex = clamp(
    positionIndex,
    0,
    Math.max(0, narrationUnits.length - 1)
  );
  const narrationLanguage = getSupportedLanguage(targetLanguage).speechLanguage;
  const nextReaderHref = useMemo(
    () =>
      nextHref
        ? buildTranslatedEpisodeHref(nextHref, sourceLanguage, targetLanguage)
        : null,
    [nextHref, sourceLanguage, targetLanguage]
  );

  useEffect(() => {
    if (nextReaderHref) router.prefetch(nextReaderHref);
  }, [nextReaderHref, router]);

  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const load = () => setVoices(window.speechSynthesis.getVoices());
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", load);
  }, []);

  useEffect(() => {
    writeWebSpeechSettings(speechSettings);
  }, [speechSettings]);

  useEffect(() => {
    return () => {
      speechRunIdRef.current += 1;
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  function stopSpeech() {
    speechRunIdRef.current += 1;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    setIsPlaying(false);
  }

  function speakFrom(index: number, runId: number) {
    if (runId !== speechRunIdRef.current) return;
    let next = index;
    while (next < narrationUnits.length && !narrationUnits[next]?.trim()) next += 1;
    const text = narrationUnits[next]?.trim();
    if (!text) {
      setIsPlaying(false);
      return;
    }

    onPositionIndexChange(next, autoFollow);
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = narrationLanguage;
    utterance.rate = speechSettings.rate;
    utterance.pitch = speechSettings.pitch;
    utterance.volume = speechSettings.volume;
    utterance.voice =
      voices.find((voice) => voice.voiceURI === speechSettings.voiceURI) ??
      voices.find((voice) =>
        voice.lang.toLowerCase().startsWith(
          narrationLanguage.toLowerCase().split("-")[0]
        )
      ) ??
      null;
    utterance.onend = () => {
      if (runId === speechRunIdRef.current) speakFrom(next + 1, runId);
    };
    utterance.onerror = () => {
      if (runId === speechRunIdRef.current) setIsPlaying(false);
    };
    window.speechSynthesis.speak(utterance);
  }

  function togglePlayback() {
    if (isPlaying) {
      stopSpeech();
      return;
    }
    if (
      narrationStopped ||
      !("speechSynthesis" in window) ||
      typeof SpeechSynthesisUtterance === "undefined" ||
      narrationUnits.length === 0
    ) {
      return;
    }
    const runId = speechRunIdRef.current + 1;
    speechRunIdRef.current = runId;
    window.speechSynthesis.cancel();
    setIsPlaying(true);
    speakFrom(safeIndex, runId);
  }

  function moveTo(href?: string | null) {
    if (!href) return;
    stopSpeech();
    router.push(buildTranslatedEpisodeHref(href, sourceLanguage, targetLanguage));
  }

  function saveBookmark() {
    try {
      writeReadingBookmark({
        seriesId,
        episodeNumber,
        positionIndex: safeIndex,
        paragraphIndex,
        sentenceIndex,
        mode: "translation",
        sourceLanguage,
        targetLanguage,
      });
      setBookmarkMessage("✓");
    } catch {
      setBookmarkMessage("!");
    }
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setBookmarkMessage(""), 1600);
  }

  function toggleNarrationStopped() {
    const next = !narrationStopped;
    stopSpeech();
    setNarrationStopped(next);
    writeNarrationStopped(seriesId, next);
  }

  return (
    <section className="fixed inset-x-0 bottom-0 z-50 border-t border-black/10 bg-white/95 backdrop-blur">
      <div className="mx-auto max-w-3xl px-4 py-3 sm:px-6">
      {settingsOpen ? (
        <div className="mb-3 grid max-h-[62vh] gap-3 overflow-y-auto rounded-[24px] border border-black/10 bg-neutral-50 p-4 sm:grid-cols-2">
          <label className="rounded-2xl border border-black/10 bg-white p-4 text-sm">
            <span className="flex justify-between gap-3">
              <span>{dictionary.fontSize}</span>
              <span>{displaySettings.fontScale.toFixed(2)}×</span>
            </span>
            <input
              className="mt-3 w-full accent-sky-300"
              type="range"
              min={0.9}
              max={1.4}
              step={0.02}
              value={displaySettings.fontScale}
              onChange={(event) =>
                onDisplaySettingsChange({
                  ...displaySettings,
                  fontScale: Number(event.target.value),
                })
              }
            />
          </label>
          <div className="rounded-2xl border border-black/10 bg-white p-4 text-sm">
            <p>{dictionary.lineHeight}</p>
            <div className="mt-3 flex gap-2">
              {(["compact", "normal", "wide"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() =>
                    onDisplaySettingsChange({ ...displaySettings, lineHeight: value })
                  }
                  className={[
                    "rounded-full border px-3 py-1.5 text-xs",
                    displaySettings.lineHeight === value
                      ? "border-sky-200 bg-sky-50"
                      : "border-black/10 bg-white",
                  ].join(" ")}
                >
                  {value === "compact"
                    ? dictionary.compact
                    : value === "wide"
                      ? dictionary.wide
                      : dictionary.normal}
                </button>
              ))}
            </div>
          </div>
          <label className="rounded-2xl border border-black/10 bg-white p-4 text-sm">
            <span className="flex justify-between gap-3">
              <span>{dictionary.voice}</span>
              <span>{narrationLanguage}</span>
            </span>
            <select
              value={speechSettings.voiceURI}
              onChange={(event) =>
                setSpeechSettings({ ...speechSettings, voiceURI: event.target.value })
              }
              className="mt-3 w-full rounded-xl border border-black/10 bg-white px-3 py-2"
            >
              <option value="">{dictionary.defaultVoice}</option>
              {voices.map((voice) => (
                <option key={voice.voiceURI} value={voice.voiceURI}>
                  {voice.name} / {voice.lang}
                </option>
              ))}
            </select>
          </label>
          <div className="rounded-2xl border border-black/10 bg-white p-4 text-sm">
            <button
              type="button"
              onClick={toggleNarrationStopped}
              className="rounded-full border border-black/10 bg-white px-4 py-2"
            >
              {narrationStopped ? dictionary.narrationStopped : dictionary.stop}
            </button>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-7 gap-2 rounded-3xl border border-black/10 bg-white p-3 shadow-sm">
        <div className="relative">
          {bookmarkMessage ? (
            <span className="absolute bottom-full left-1/2 mb-2 -translate-x-1/2 rounded-full bg-black px-2 py-1 text-xs text-white">
              {bookmarkMessage}
            </span>
          ) : null}
          <FooterActionButton
            label={dictionary.bookmark}
            iconSrc={PLAYER_ICON_PATHS.bookmark}
            onClick={saveBookmark}
          />
        </div>
        <FooterPlaybackRateControl
          value={speechSettings.rate}
          onDecrease={() =>
            setSpeechSettings({
              ...speechSettings,
              rate: clamp(speechSettings.rate - 0.1, 0.7, 1.5),
            })
          }
          onIncrease={() =>
            setSpeechSettings({
              ...speechSettings,
              rate: clamp(speechSettings.rate + 0.1, 0.7, 1.5),
            })
          }
        />
        <FooterActionButton
          label={dictionary.previousEpisode}
          iconSrc={PLAYER_ICON_PATHS.prev}
          disabled={!prevHref}
          onClick={() => moveTo(prevHref)}
        />
        <FooterActionButton
          label={isPlaying ? dictionary.stop : dictionary.play}
          iconSrc={isPlaying ? PLAYER_ICON_PATHS.stop : PLAYER_ICON_PATHS.play}
          disabled={narrationStopped || narrationUnits.length === 0}
          onClick={togglePlayback}
        />
        <FooterActionButton
          label={dictionary.nextEpisode}
          iconSrc={PLAYER_ICON_PATHS.next}
          disabled={!nextHref}
          onClick={() => moveTo(nextHref)}
        />
        <FooterActionButton
          label={autoFollow ? dictionary.autoFollowOn : dictionary.autoFollowOff}
          active={autoFollow}
          onClick={() => setAutoFollow((current) => !current)}
        />
        <FooterActionButton
          label={dictionary.settings}
          iconSrc={PLAYER_ICON_PATHS.settings}
          active={settingsOpen}
          onClick={() => setSettingsOpen((current) => !current)}
        />
      </div>
      </div>
    </section>
  );
}
