"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import {
  formatBgmSeconds,
  type BgmSettings,
} from "@/lib/bgm/bgmSettings";

type BgmControllerProps = {
  seriesId: string;
  bgmSrc?: string | null;
  bgmTitle?: string;
  bgmSettings?: BgmSettings;
  isNarrationPlaying: boolean;
  playbackRate?: number;
  isOpen: boolean;
};

type BgmPreference = {
  enabled: boolean;
  volume: number;
};

type BgmErrorState = {
  src: string;
  message: string;
};

const DEFAULT_BGM_PREFERENCE: BgmPreference = {
  enabled: true,
  volume: 0.35,
};

function clampVolume(value: number): number {
  if (!Number.isFinite(value)) return 0.35;
  return Math.min(1, Math.max(0, value));
}

function readStoredBgmPreference(seriesId: string): BgmPreference {
  if (typeof window === "undefined") {
    return DEFAULT_BGM_PREFERENCE;
  }

  try {
    const raw = window.localStorage.getItem(`duonovel:bgm:${seriesId}`);
    if (!raw) {
      return DEFAULT_BGM_PREFERENCE;
    }

    const parsed = JSON.parse(raw) as Partial<BgmPreference>;

    return {
      enabled:
        typeof parsed.enabled === "boolean"
          ? parsed.enabled
          : DEFAULT_BGM_PREFERENCE.enabled,
      volume:
        typeof parsed.volume === "number"
          ? clampVolume(parsed.volume)
          : DEFAULT_BGM_PREFERENCE.volume,
    };
  } catch {
    return DEFAULT_BGM_PREFERENCE;
  }
}

export default function BgmController({
  seriesId,
  bgmSrc,
  bgmTitle,
  bgmSettings,
  isNarrationPlaying,
  playbackRate = 1,
  isOpen,
}: BgmControllerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fadeFrameRef = useRef<number | null>(null);

  const [preference, setPreference] = useState<BgmPreference>(() =>
    readStoredBgmPreference(seriesId)
  );
  const [audioError, setAudioError] = useState<BgmErrorState>({
    src: "",
    message: "",
  });

  const enabled = preference.enabled;
  const volume = preference.volume;

  const playableBgmSrc = useMemo(() => {
    const value = (bgmSrc ?? "").trim();

    if (!value) return "";
    if (value.startsWith("http://")) return value;
    if (value.startsWith("https://")) return value;
    if (value.startsWith("/")) return value;

    return "";
  }, [bgmSrc]);

  const visibleAudioError =
    audioError.src === playableBgmSrc ? audioError.message : "";

  const fadeInSeconds = bgmSettings?.fadeInSeconds ?? 0;
  const fadeOutSeconds = bgmSettings?.fadeOutSeconds ?? 0;
  const sceneCueCount = bgmSettings?.sceneCues.length ?? 0;

  const cancelFade = useCallback(() => {
    if (fadeFrameRef.current !== null) {
      window.cancelAnimationFrame(fadeFrameRef.current);
      fadeFrameRef.current = null;
    }
  }, []);

  const animateVolume = useCallback(
    (targetVolume: number, durationSeconds: number, onDone?: () => void) => {
      const audio = audioRef.current;
      if (!audio) {
        onDone?.();
        return;
      }

      cancelFade();

      const safeTargetVolume = clampVolume(targetVolume);
      const safeDurationMs = Math.max(0, durationSeconds) * 1000;

      if (safeDurationMs === 0) {
        audio.volume = safeTargetVolume;
        onDone?.();
        return;
      }

      const startVolume = audio.volume;
      const diff = safeTargetVolume - startVolume;
      const startedAt = performance.now();

      const step = (now: number) => {
        const progress = Math.min((now - startedAt) / safeDurationMs, 1);
        audio.volume = clampVolume(startVolume + diff * progress);

        if (progress < 1) {
          fadeFrameRef.current = window.requestAnimationFrame(step);
          return;
        }

        fadeFrameRef.current = null;
        onDone?.();
      };

      fadeFrameRef.current = window.requestAnimationFrame(step);
    },
    [cancelFade]
  );

  const fadeOutAndPause = useCallback(
    (durationSeconds: number) => {
      const audio = audioRef.current;
      if (!audio) return;

      if (audio.paused) {
        audio.volume = 0;
        return;
      }

      animateVolume(0, durationSeconds, () => {
        audio.pause();
      });
    },
    [animateVolume]
  );

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

    audio.loop = true;
    audio.playbackRate = playbackRate;
  }, [playbackRate]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    cancelFade();
    audio.pause();
    audio.currentTime = 0;
    audio.volume = 0;
    audio.playbackRate = playbackRate;
    audio.load();
  }, [playableBgmSrc, playbackRate, cancelFade]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const targetAudio = audio;

    targetAudio.loop = true;
    targetAudio.playbackRate = playbackRate;

    if (!playableBgmSrc) {
      cancelFade();
      targetAudio.pause();
      return;
    }

    if (!enabled || !isNarrationPlaying) {
      fadeOutAndPause(fadeOutSeconds);
      return;
    }

    const targetVolume = clampVolume(volume);
    let cancelled = false;

    async function playBgm() {
      try {
        setAudioError({
          src: playableBgmSrc,
          message: "",
        });

        if (targetAudio.paused) {
          targetAudio.volume = fadeInSeconds > 0 ? 0 : targetVolume;
          await targetAudio.play();

          if (cancelled) {
            targetAudio.pause();
            return;
          }

          if (fadeInSeconds > 0) {
            animateVolume(targetVolume, fadeInSeconds);
          } else {
            targetAudio.volume = targetVolume;
          }

          return;
        }

        animateVolume(targetVolume, 0.12);
      } catch {
        setAudioError({
          src: playableBgmSrc,
          message: "BGMの再生を開始できなかった",
        });
      }
    }

    void playBgm();

    return () => {
      cancelled = true;
    };
  }, [
    enabled,
    isNarrationPlaying,
    playableBgmSrc,
    playbackRate,
    volume,
    fadeInSeconds,
    fadeOutSeconds,
    animateVolume,
    fadeOutAndPause,
    cancelFade,
  ]);

  useEffect(() => {
    return () => {
      cancelFade();
    };
  }, [cancelFade]);

  function handleVolumeChange(event: ChangeEvent<HTMLInputElement>) {
    const nextVolume = clampVolume(Number(event.target.value));
    setPreference((prev) => ({
      ...prev,
      volume: nextVolume,
    }));
  }

  function handleToggleEnabled() {
    setPreference((prev) => ({
      ...prev,
      enabled: !prev.enabled,
    }));
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
          onClick={handleToggleEnabled}
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

        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-neutral-300">
          fade in {formatBgmSeconds(fadeInSeconds)}
        </span>

        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-neutral-300">
          fade out {formatBgmSeconds(fadeOutSeconds)}
        </span>

        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-neutral-400">
          場面切替予約 {sceneCueCount}件
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
        今回の適用は、BGM開始時フェードインと、停止 / 再生終了時フェードアウトまで。
        場面展開でのBGM切り替えは、保存枠だけ先に置いて次段でつなぐ。
      </p>

      {visibleAudioError ? (
        <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
          {visibleAudioError}
        </div>
      ) : null}
    </div>
  );
}