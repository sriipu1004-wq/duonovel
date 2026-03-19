"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";

type BgmControllerProps = {
  seriesId: string;
  bgmSrc?: string | null;
  bgmTitle?: string;
  isNarrationPlaying: boolean;
  isOpen: boolean;
};

type BgmPreference = {
  enabled: boolean;
  volume: number;
};

function clampVolume(value: number): number {
  if (!Number.isFinite(value)) return 0.35;
  return Math.min(1, Math.max(0, value));
}

export default function BgmController({
  seriesId,
  bgmSrc,
  bgmTitle,
  isNarrationPlaying,
  isOpen,
}: BgmControllerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [enabled, setEnabled] = useState(true);
  const [volume, setVolume] = useState(0.35);
  const [audioError, setAudioError] = useState("");

  const playableBgmSrc = useMemo(() => {
    const value = (bgmSrc ?? "").trim();

    if (!value) return "";
    if (value.startsWith("http://")) return value;
    if (value.startsWith("https://")) return value;
    if (value.startsWith("/")) return value;

    return "";
  }, [bgmSrc]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(`duonovel:bgm:${seriesId}`);
      if (!raw) return;

      const parsed = JSON.parse(raw) as Partial<BgmPreference>;
      if (typeof parsed.enabled === "boolean") {
        setEnabled(parsed.enabled);
      }
      if (typeof parsed.volume === "number") {
        setVolume(clampVolume(parsed.volume));
      }
    } catch {
      // 読み込み失敗時はデフォルト継続
    }
  }, [seriesId]);

  useEffect(() => {
    try {
      const payload: BgmPreference = {
        enabled,
        volume,
      };

      window.localStorage.setItem(
        `duonovel:bgm:${seriesId}`,
        JSON.stringify(payload)
      );
    } catch {
      // 保存失敗は黙って継続
    }
  }, [seriesId, enabled, volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.volume = clampVolume(volume);
    audio.loop = true;
  }, [volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.pause();
    setAudioError("");
    audio.load();
  }, [playableBgmSrc]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.volume = clampVolume(volume);
    audio.loop = true;

    if (!enabled || !isNarrationPlaying || !playableBgmSrc) {
      audio.pause();
      return;
    }

    const targetAudio = audio;
    let cancelled = false;

    async function playBgm() {
      try {
        setAudioError("");
        await targetAudio.play();

        if (cancelled) {
          targetAudio.pause();
        }
      } catch {
        setAudioError("BGMの再生を開始できなかった");
      }
    }

    void playBgm();

    return () => {
      cancelled = true;
    };
  }, [enabled, isNarrationPlaying, playableBgmSrc, volume]);

  function handleVolumeChange(event: ChangeEvent<HTMLInputElement>) {
    const nextVolume = clampVolume(Number(event.target.value));
    setVolume(nextVolume);
  }

  if (!isOpen) {
    return (
      <audio ref={audioRef} preload="metadata">
        {playableBgmSrc ? <source src={playableBgmSrc} /> : null}
      </audio>
    );
  }

  return (
    <div className="mt-4 rounded-[28px] border border-white/10 bg-black/20 p-4">
      <audio ref={audioRef} preload="metadata">
        {playableBgmSrc ? <source src={playableBgmSrc} /> : null}
      </audio>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs tracking-[0.18em] text-neutral-500">BGM</p>
          <h3 className="mt-2 text-lg font-semibold text-white">
            {bgmTitle || "BGM未設定"}
          </h3>
        </div>

        <button
          type="button"
          onClick={() => setEnabled((prev) => !prev)}
          className={[
            "rounded-full px-4 py-2 text-sm font-medium transition",
            enabled
              ? "border border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
              : "border border-white/10 bg-white/5 text-neutral-300",
          ].join(" ")}
        >
          {enabled ? "BGM ON" : "BGM OFF"}
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <span
          className={[
            "rounded-full px-3 py-1 text-xs",
            playableBgmSrc
              ? "border border-sky-400/20 bg-sky-400/10 text-sky-200"
              : "border border-white/10 bg-white/5 text-neutral-500",
          ].join(" ")}
        >
          {playableBgmSrc ? "BGM接続済み" : "BGM未接続"}
        </span>

        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-neutral-400">
          朗読再生と連動
        </span>
      </div>

      <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div className="flex items-center justify-between gap-3 text-sm text-neutral-300">
          <span>音量</span>
          <span>{Math.round(volume * 100)}%</span>
        </div>

        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={handleVolumeChange}
          className="mt-3 w-full accent-white"
        />
      </div>

      <p className="mt-4 text-sm leading-7 text-neutral-400">
        今はテスト用BGM。あとで作品単位や話単位のBGM設定テーブルに差し替えられる構成。
      </p>

      {audioError ? (
        <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
          {audioError}
        </div>
      ) : null}
    </div>
  );
}