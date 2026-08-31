"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  FooterActionButton,
  FooterPlaybackRateControl,
  PLAYER_ICON_PATHS,
} from "@/features/playback/ReaderFooterControls";
import {
  readReadingBookmark,
  writeReadingBookmark,
} from "@/lib/playback/readingBookmark";
import {
  getSupportedLanguage,
  type SupportedLanguageTag,
} from "@/lib/translation/languageRegistry";
import {
  readNarrationStopped,
  readWebSpeechSettings,
  writeNarrationStopped,
  writeWebSpeechSettings,
  type StoredWebSpeechDisplaySettings,
  type StoredWebSpeechSettings,
} from "@/lib/playback/webSpeechPreferences";

type SpeechVoiceOption = {
  voiceURI: string;
  name: string;
  lang: string;
};

type BilingualStoppedFooterProps = {
  seriesId: string;
  episodeNumber: number;
  positionIndex: number;
  sentenceCount: number;
  prevHref?: string | null;
  nextHref?: string | null;
  upperPane: "source" | "target";
  narrationUnits: string[];
  narrationLanguage: string;
  sourceLanguage: SupportedLanguageTag;
  targetLanguage: SupportedLanguageTag;
  displaySettings: StoredWebSpeechDisplaySettings;
  onDisplaySettingsChange: (settings: StoredWebSpeechDisplaySettings) => void;
  onPositionIndexChange: (index: number, autoFollow: boolean) => void;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function SettingChip({
  active,
  label,
  disabled = false,
  onClick,
}: {
  active: boolean;
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={[
        "rounded-full border px-4 py-2 text-sm font-medium transition",
        active
          ? "border-sky-200 bg-sky-50 text-black"
          : "border-black/10 bg-white text-neutral-700 hover:bg-neutral-50",
        disabled ? "cursor-not-allowed opacity-45" : "",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

export default function BilingualStoppedFooter({
  seriesId,
  episodeNumber,
  positionIndex,
  sentenceCount,
  prevHref,
  nextHref,
  upperPane,
  narrationUnits,
  narrationLanguage,
  sourceLanguage,
  targetLanguage,
  displaySettings,
  onDisplaySettingsChange,
  onPositionIndexChange,
}: BilingualStoppedFooterProps) {
  const router = useRouter();
  const toastTimerRef = useRef<number | null>(null);
  const speechRunIdRef = useRef(0);
  const [bookmarkSaved, setBookmarkSaved] = useState(false);
  const [bookmarkMessage, setBookmarkMessage] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [autoFollow, setAutoFollow] = useState(true);
  const [narrationStopped, setNarrationStopped] = useState(() =>
    readNarrationStopped(seriesId)
  );
  const [speechSettings, setSpeechSettings] = useState<StoredWebSpeechSettings>(
    () => readWebSpeechSettings(seriesId)
  );
  const [availableVoices, setAvailableVoices] = useState<SpeechVoiceOption[]>([]);

  const safePositionIndex = Math.min(
    Math.max(0, positionIndex),
    Math.max(0, sentenceCount - 1)
  );
  const lowerPaneLanguage =
    upperPane === "source" ? targetLanguage : sourceLanguage;
  const upperPaneLanguage =
    upperPane === "source" ? sourceLanguage : targetLanguage;
  const narrationSignature = narrationUnits.join("\u0000");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const bookmark = readReadingBookmark(seriesId);
      setBookmarkSaved(bookmark?.episodeNumber === episodeNumber);
      setNarrationStopped(readNarrationStopped(seriesId));
      setSpeechSettings(readWebSpeechSettings(seriesId));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [episodeNumber, seriesId]);

  useEffect(() => {
    if (!("speechSynthesis" in window)) return;

    function loadVoices() {
      const lowerPrefix = narrationLanguage.toLowerCase().split("-")[0];
      const upperPrefix = getSupportedLanguage(upperPaneLanguage)
        .speechLanguage.toLowerCase().split("-")[0];
      const priority = (language: string) => {
        const prefix = language.toLowerCase().split("-")[0];
        if (prefix === lowerPrefix) return 0;
        if (prefix === upperPrefix) return 1;
        return 2;
      };
      const voices = window.speechSynthesis.getVoices().slice().sort(
        (left, right) =>
          priority(left.lang) - priority(right.lang) ||
          left.lang.localeCompare(right.lang, "en") ||
          left.name.localeCompare(right.name)
      );
      const options = voices.map((voice) => ({
        voiceURI: voice.voiceURI,
        name: voice.name,
        lang: voice.lang,
      }));
      setAvailableVoices(options);

      if (!options.some((voice) => voice.voiceURI === speechSettings.voiceURI)) {
        const preferred =
          options.find(
            (voice) => voice.lang.toLowerCase().split("-")[0] === lowerPrefix
          ) ?? options[0];
        if (preferred) {
          setSpeechSettings((current) => ({
            ...current,
            voiceURI: preferred.voiceURI,
          }));
        }
      }
    }

    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () =>
      window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
  }, [narrationLanguage, speechSettings.voiceURI, upperPaneLanguage]);

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

  useEffect(() => {
    speechRunIdRef.current += 1;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    const timer = window.setTimeout(() => setIsPlaying(false), 0);
    return () => window.clearTimeout(timer);
  }, [lowerPaneLanguage, narrationSignature]);

  function saveBookmark() {
    try {
      writeReadingBookmark({
        seriesId,
        episodeNumber,
        positionIndex: safePositionIndex,
      });
      setBookmarkSaved(true);
      setBookmarkMessage("栞の位置を記録しました");
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = window.setTimeout(
        () => setBookmarkMessage(""),
        1800
      );
    } catch {
      setBookmarkMessage("栞の位置を記録できませんでした");
    }
  }

  function updateSpeechSettings(next: StoredWebSpeechSettings) {
    setSpeechSettings(next);
  }

  function toggleNarrationStopped() {
    const next = !narrationStopped;
    speechRunIdRef.current += 1;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    setIsPlaying(false);
    setNarrationStopped(next);
    writeNarrationStopped(seriesId, next);
  }

  function bilingualHref(href: string): string {
    const url = new URL(href, window.location.origin);
    url.searchParams.set("bilingual", "1");
    url.searchParams.set("sourceLanguage", sourceLanguage);
    url.searchParams.set("targetLanguage", targetLanguage);
    url.searchParams.set("lockLanguage", "1");
    return `${url.pathname}${url.search}${url.hash}`;
  }

  function stopNarration() {
    speechRunIdRef.current += 1;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    setIsPlaying(false);
  }

  function speakFrom(index: number, runId: number) {
    if (runId !== speechRunIdRef.current) return;

    let nextIndex = index;
    while (
      nextIndex < narrationUnits.length &&
      !narrationUnits[nextIndex]?.trim()
    ) {
      nextIndex += 1;
    }

    const text = narrationUnits[nextIndex]?.trim();
    if (!text) {
      setIsPlaying(false);
      return;
    }

    onPositionIndexChange(nextIndex, autoFollow);
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = narrationLanguage;
    utterance.rate = speechSettings.rate;
    utterance.pitch = speechSettings.pitch;
    utterance.volume = speechSettings.volume;
    const voices = window.speechSynthesis.getVoices();
    utterance.voice =
      voices.find((voice) => voice.voiceURI === speechSettings.voiceURI) ??
      voices.find((voice) =>
        voice.lang.toLowerCase().startsWith(
          narrationLanguage.toLowerCase().split("-")[0]
        )
      ) ??
      null;
    utterance.onend = () => {
      if (speechRunIdRef.current !== runId) return;
      speakFrom(nextIndex + 1, runId);
    };
    utterance.onerror = () => {
      if (speechRunIdRef.current === runId) setIsPlaying(false);
    };
    window.speechSynthesis.speak(utterance);
  }

  function startPlaybackFrom(index: number) {
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
    speakFrom(index, runId);
  }

  function togglePlayback() {
    if (isPlaying) {
      stopNarration();
      return;
    }
    startPlaybackFrom(safePositionIndex);
  }

  function moveTo(href?: string | null) {
    if (!href) return;
    stopNarration();
    router.push(bilingualHref(href));
  }

  function changePosition(index: number) {
    onPositionIndexChange(index, autoFollow);
    if (isPlaying) startPlaybackFrom(index);
  }

  return (
    <section
      aria-label="対訳中の朗読フッター"
      className="mt-5 border-t border-black/10 bg-white pt-3"
    >
      {settingsOpen ? (
        <div className="border-b border-black/10 bg-white/98">
          <div className="mx-auto max-h-[52dvh] max-w-4xl overflow-y-auto px-4 py-4 sm:px-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <section className="rounded-[28px] border border-black/10 bg-neutral-50 p-4">
                <p className="text-xs tracking-[0.18em] text-neutral-500">NARRATION</p>
                <h3 className="mt-2 text-lg font-semibold text-black">朗読</h3>

                <div className="mt-4 rounded-2xl border border-black/10 bg-white p-4">
                  <p className="text-sm text-neutral-700">再生方式</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <SettingChip active label="ブラウザ朗読" onClick={() => undefined} />
                    <SettingChip active={false} disabled label="ユーザー朗読（対訳では未対応）" onClick={() => undefined} />
                  </div>
                  <p className="mt-3 text-xs leading-6 text-neutral-500">下段を現在位置から最後まで読み上げます。</p>
                </div>

                <div className="mt-4 rounded-2xl border border-black/10 bg-white p-4">
                  <p className="text-sm text-neutral-700">朗読者（ブラウザ音声）</p>
                  <select
                    value={speechSettings.voiceURI}
                    onChange={(event) => updateSpeechSettings({ ...speechSettings, voiceURI: event.target.value })}
                    className="mt-3 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm outline-none transition focus:border-sky-300"
                  >
                    {availableVoices.length === 0 ? <option value="">標準音声</option> : availableVoices.map((voice) => (
                      <option key={voice.voiceURI} value={voice.voiceURI}>{voice.name} / {voice.lang}</option>
                    ))}
                  </select>
                </div>

                <label className="mt-4 block rounded-2xl border border-black/10 bg-white p-4">
                  <span className="flex justify-between text-sm text-neutral-700"><span>声の高さ</span><span>{speechSettings.pitch.toFixed(1)}</span></span>
                  <input type="range" min={0.8} max={1.3} step={0.1} value={speechSettings.pitch} onChange={(event) => updateSpeechSettings({ ...speechSettings, pitch: Number(event.target.value) })} className="mt-3 w-full accent-sky-300" />
                </label>

                <label className="mt-4 block rounded-2xl border border-black/10 bg-white p-4">
                  <span className="flex justify-between text-sm text-neutral-700"><span>朗読音量</span><span>{Math.round(speechSettings.volume * 100)}%</span></span>
                  <input type="range" min={0} max={1} step={0.01} value={speechSettings.volume} onChange={(event) => updateSpeechSettings({ ...speechSettings, volume: Number(event.target.value) })} className="mt-3 w-full accent-sky-300" />
                </label>

                <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-black/10 bg-white p-4">
                  <div><p className="text-sm text-neutral-700">朗読停止</p><p className="mt-1 text-xs leading-6 text-neutral-500">停止中は1文再生を開始しません。</p></div>
                  <button type="button" onClick={toggleNarrationStopped} className={["rounded-full border px-4 py-2 text-sm font-medium transition", narrationStopped ? "border-sky-200 bg-sky-50 text-black" : "border-black/10 bg-white text-neutral-700"].join(" ")}>{narrationStopped ? "停止解除" : "停止"}</button>
                </div>
              </section>

              <section className="rounded-[28px] border border-black/10 bg-neutral-50 p-4">
                <p className="text-xs tracking-[0.18em] text-neutral-500">DISPLAY</p>
                <h3 className="mt-2 text-lg font-semibold text-black">表示演出</h3>

                <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-black/10 bg-white p-4">
                  <span className="text-sm text-neutral-700">マーカー表示</span>
                  <div className="flex gap-2">
                    <SettingChip active={displaySettings.showMarker} label="ON" onClick={() => onDisplaySettingsChange({ ...displaySettings, showMarker: true })} />
                    <SettingChip active={!displaySettings.showMarker} label="OFF" onClick={() => onDisplaySettingsChange({ ...displaySettings, showMarker: false })} />
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-black/10 bg-white p-4">
                  <span className="text-sm text-neutral-700">全演出</span>
                  <div className="flex gap-2">
                    <SettingChip active={!displaySettings.hideEffects} label="ON" onClick={() => onDisplaySettingsChange({ ...displaySettings, hideEffects: false })} />
                    <SettingChip active={displaySettings.hideEffects} label="OFF" onClick={() => onDisplaySettingsChange({ ...displaySettings, hideEffects: true })} />
                  </div>
                </div>

                <label className="mt-4 block rounded-2xl border border-black/10 bg-white p-4">
                  <span className="flex justify-between text-sm text-neutral-700"><span>文字サイズ</span><span>{Math.round(displaySettings.fontScale * 100)}%</span></span>
                  <input type="range" min={0.9} max={1.4} step={0.05} value={displaySettings.fontScale} onChange={(event) => onDisplaySettingsChange({ ...displaySettings, fontScale: Number(event.target.value) })} className="mt-3 w-full accent-sky-300" />
                </label>

                <div className="mt-4 rounded-2xl border border-black/10 bg-white p-4">
                  <p className="text-sm text-neutral-700">行間</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(["compact", "normal", "wide"] as const).map((value) => (
                      <SettingChip key={value} active={displaySettings.lineHeight === value} label={value === "compact" ? "狭め" : value === "wide" ? "広め" : "標準"} onClick={() => onDisplaySettingsChange({ ...displaySettings, lineHeight: value })} />
                    ))}
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mx-auto max-w-4xl px-4 py-3 sm:px-6">
        <div className="rounded-3xl border border-black/10 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3 text-sm text-neutral-700">
            <span>{sentenceCount > 0 ? safePositionIndex + 1 : 0} / {sentenceCount}</span>
            <span>下段・全文再生</span>
          </div>
          <input type="range" min={0} max={Math.max(0, sentenceCount - 1)} step={1} value={safePositionIndex} disabled={narrationStopped || sentenceCount === 0} onChange={(event) => changePosition(Number(event.target.value))} className="mt-3 w-full accent-sky-300 disabled:opacity-40" />
        </div>

        <div className="mt-3 grid w-full grid-cols-7 gap-2">
          <div className="relative">
            {bookmarkMessage ? <span role="status" className="absolute bottom-full left-1/2 z-10 mb-2 w-max max-w-56 -translate-x-1/2 rounded-full bg-black px-3 py-1.5 text-center text-xs text-white shadow-lg">{bookmarkMessage}</span> : null}
            <FooterActionButton label="栞" iconSrc={bookmarkSaved ? PLAYER_ICON_PATHS.bookmarkFilled : PLAYER_ICON_PATHS.bookmark} active={bookmarkSaved} onClick={saveBookmark} />
          </div>
          <FooterPlaybackRateControl value={speechSettings.rate} onDecrease={() => updateSpeechSettings({ ...speechSettings, rate: clamp(speechSettings.rate - 0.1, 0.7, 1.5) })} onIncrease={() => updateSpeechSettings({ ...speechSettings, rate: clamp(speechSettings.rate + 0.1, 0.7, 1.5) })} />
          <FooterActionButton label="前話" iconSrc={PLAYER_ICON_PATHS.prev} disabled={!prevHref} onClick={() => moveTo(prevHref)} />
          <FooterActionButton label={isPlaying ? "停止" : "再生"} iconSrc={isPlaying ? PLAYER_ICON_PATHS.stop : PLAYER_ICON_PATHS.play} disabled={narrationStopped || narrationUnits.length === 0} active={isPlaying} onClick={togglePlayback} />
          <FooterActionButton label="次話" iconSrc={PLAYER_ICON_PATHS.next} disabled={!nextHref} onClick={() => moveTo(nextHref)} />
          <FooterActionButton label={autoFollow ? "自動追尾\nON" : "自動追尾\nOFF"} active={autoFollow} disabled={narrationStopped} onClick={() => setAutoFollow((current) => !current)} />
          <FooterActionButton label="設定" iconSrc={PLAYER_ICON_PATHS.settings} active={settingsOpen} onClick={() => setSettingsOpen((current) => !current)} />
        </div>
      </div>
    </section>
  );
}
