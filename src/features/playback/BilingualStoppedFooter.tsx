"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  readReadingBookmark,
  writeReadingBookmark,
} from "@/lib/playback/readingBookmark";
import {
  readNarrationStopped,
  readWebSpeechSettings,
  writeNarrationStopped,
  writeWebSpeechSettings,
  type StoredWebSpeechSettings,
} from "@/lib/playback/webSpeechPreferences";

const ICONS = {
  settings: "/player-icons/settings.png",
  next: "/player-icons/next.png",
  prev: "/player-icons/prev.png",
  bookmark: "/player-icons/bookmark.png",
  bookmarkFilled: "/player-icons/bookmark-filled.png",
} as const;

type BilingualStoppedFooterProps = {
  seriesId: string;
  episodeNumber: number;
  positionIndex: number;
  prevHref?: string | null;
  nextHref?: string | null;
  splitRatio: number;
  upperPane: "source" | "target";
  readerHeight: number | null;
  onSplitRatioChange: (ratio: number) => void;
  onSwapLanguages: () => void;
  onResetReaderHeight: () => void;
};

function StoppedAction({
  label,
  icon,
  active = false,
  disabled = false,
  onClick,
}: {
  label: string;
  icon: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={[
        "flex h-12 w-full items-center justify-center rounded-2xl border-0 bg-transparent px-2 text-center text-[10px] font-medium leading-tight transition sm:text-sm",
        active ? "bg-sky-50" : "hover:bg-neutral-50",
        disabled ? "cursor-not-allowed opacity-25" : "opacity-80",
      ].join(" ")}
    >
      <Image
        src={icon}
        alt=""
        width={28}
        height={28}
        className="h-7 w-7 object-contain"
      />
    </button>
  );
}

export default function BilingualStoppedFooter({
  seriesId,
  episodeNumber,
  positionIndex,
  prevHref,
  nextHref,
  splitRatio,
  upperPane,
  readerHeight,
  onSplitRatioChange,
  onSwapLanguages,
  onResetReaderHeight,
}: BilingualStoppedFooterProps) {
  const router = useRouter();
  const toastTimerRef = useRef<number | null>(null);
  const [bookmarkSaved, setBookmarkSaved] = useState(false);
  const [bookmarkMessage, setBookmarkMessage] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [narrationStopped, setNarrationStopped] = useState(() =>
    readNarrationStopped(seriesId)
  );
  const [speechSettings, setSpeechSettings] = useState<StoredWebSpeechSettings>(
    () => readWebSpeechSettings(seriesId)
  );

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
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  function saveBookmark() {
    try {
      writeReadingBookmark({ seriesId, episodeNumber, positionIndex });
      setBookmarkSaved(true);
      setBookmarkMessage("ブックマーク保存をしました");
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = window.setTimeout(
        () => setBookmarkMessage(""),
        1800
      );
    } catch {
      setBookmarkMessage("ブックマークを保存できませんでした");
    }
  }

  function updateSpeechSettings(next: StoredWebSpeechSettings) {
    setSpeechSettings(next);
    writeWebSpeechSettings(next);
  }

  function toggleNarrationStopped() {
    const next = !narrationStopped;
    if (next && "speechSynthesis" in window) window.speechSynthesis.cancel();
    setNarrationStopped(next);
    writeNarrationStopped(seriesId, next);
  }

  return (
    <section
      aria-label="対訳中の朗読フッター"
      className="mt-5 border-t border-black/10 bg-white pt-3"
    >
      {settingsOpen ? (
        <div className="mb-3 grid gap-4 bg-neutral-50 px-4 py-4 text-sm sm:grid-cols-2">
          <div>
            <div className="flex items-center justify-between gap-3">
              <span>朗読停止</span>
              <button
                type="button"
                onClick={toggleNarrationStopped}
                className="rounded-full bg-white px-4 py-2 text-xs font-medium shadow-sm"
              >
                {narrationStopped ? "停止解除" : "停止"}
              </button>
            </div>
            <label className="mt-4 block">
              <span className="flex justify-between text-xs text-neutral-600">
                <span>速度</span>
                <span>{speechSettings.rate.toFixed(1)}</span>
              </span>
              <input
                type="range"
                min={0.7}
                max={1.5}
                step={0.1}
                value={speechSettings.rate}
                onChange={(event) =>
                  updateSpeechSettings({
                    ...speechSettings,
                    rate: Number(event.target.value),
                  })
                }
                className="mt-2 w-full accent-sky-300"
              />
            </label>
            <label className="mt-3 block">
              <span className="flex justify-between text-xs text-neutral-600">
                <span>音量</span>
                <span>{Math.round(speechSettings.volume * 100)}%</span>
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={speechSettings.volume}
                onChange={(event) =>
                  updateSpeechSettings({
                    ...speechSettings,
                    volume: Number(event.target.value),
                  })
                }
                className="mt-2 w-full accent-sky-300"
              />
            </label>
          </div>
          <div>
            <p className="text-xs text-neutral-600">対訳表示</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {[40, 50, 60].map((ratio) => (
                <button
                  key={ratio}
                  type="button"
                  onClick={() => onSplitRatioChange(ratio)}
                  className={[
                    "rounded-full px-3 py-2 text-xs",
                    splitRatio === ratio ? "bg-sky-100" : "bg-white",
                  ].join(" ")}
                >
                  上 {ratio}%
                </button>
              ))}
              <button
                type="button"
                onClick={onSwapLanguages}
                className="rounded-full bg-white px-3 py-2 text-xs"
              >
                上下を入れ替える
              </button>
              {readerHeight !== null ? (
                <button
                  type="button"
                  onClick={onResetReaderHeight}
                  className="rounded-full bg-white px-3 py-2 text-xs"
                >
                  高さを標準に戻す
                </button>
              ) : null}
            </div>
            <p className="mt-3 text-xs text-neutral-500">
              上段: {upperPane === "source" ? "原文" : "訳文"}
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid w-full grid-cols-4 gap-2">
        <div className="relative">
          {bookmarkMessage ? (
            <span
              role="status"
              className="absolute bottom-full left-1/2 z-10 mb-2 w-max max-w-56 -translate-x-1/2 rounded-full bg-black px-3 py-1.5 text-center text-xs text-white shadow-lg"
            >
              {bookmarkMessage}
            </span>
          ) : null}
          <StoppedAction
            label="栞"
            icon={bookmarkSaved ? ICONS.bookmarkFilled : ICONS.bookmark}
            active={bookmarkSaved}
            onClick={saveBookmark}
          />
        </div>
        <StoppedAction
          label="前話"
          icon={ICONS.prev}
          disabled={!prevHref}
          onClick={() => prevHref && router.push(prevHref)}
        />
        <StoppedAction
          label="次話"
          icon={ICONS.next}
          disabled={!nextHref}
          onClick={() => nextHref && router.push(nextHref)}
        />
        <StoppedAction
          label="設定"
          icon={ICONS.settings}
          active={settingsOpen}
          onClick={() => setSettingsOpen((current) => !current)}
        />
      </div>
    </section>
  );
}
