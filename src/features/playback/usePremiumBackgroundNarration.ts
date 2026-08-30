"use client";

import { useEffect, useRef } from "react";

type PremiumBackgroundNarrationOptions = {
  isSubscriber: boolean;
  isPlaying: boolean;
  title: string;
  artist: string;
  album: string;
  onPlay: () => void;
  onPause: () => void;
  onNext?: () => void;
  onPrevious?: () => void;
};

export function usePremiumBackgroundNarration({
  isSubscriber,
  isPlaying,
  title,
  artist,
  album,
  onPlay,
  onPause,
  onNext,
  onPrevious,
}: PremiumBackgroundNarrationOptions): void {
  const hasNext = typeof onNext === "function";
  const hasPrevious = typeof onPrevious === "function";
  const onPlayRef = useRef(onPlay);
  const onPauseRef = useRef(onPause);
  const onNextRef = useRef(onNext);
  const onPreviousRef = useRef(onPrevious);

  useEffect(() => {
    onPlayRef.current = onPlay;
    onPauseRef.current = onPause;
    onNextRef.current = onNext;
    onPreviousRef.current = onPrevious;
  }, [onNext, onPause, onPlay, onPrevious]);

  useEffect(() => {
    if (isSubscriber) return;

    function stopFreeBackgroundPlayback() {
      if (document.hidden) onPauseRef.current();
    }

    document.addEventListener("visibilitychange", stopFreeBackgroundPlayback);
    return () => {
      document.removeEventListener(
        "visibilitychange",
        stopFreeBackgroundPlayback
      );
    };
  }, [isSubscriber]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;

    const mediaSession = navigator.mediaSession;
    if (!isSubscriber) {
      mediaSession.metadata = null;
      mediaSession.playbackState = "none";
      return;
    }

    if (typeof MediaMetadata !== "undefined") {
      mediaSession.metadata = new MediaMetadata({ title, artist, album });
    }

    const setHandler = (
      action: MediaSessionAction,
      handler: MediaSessionActionHandler | null
    ) => {
      try {
        mediaSession.setActionHandler(action, handler);
      } catch {
        // The browser does not support every Media Session action.
      }
    };

    setHandler("play", () => onPlayRef.current());
    setHandler("pause", () => onPauseRef.current());
    setHandler("nexttrack", hasNext ? () => onNextRef.current?.() : null);
    setHandler(
      "previoustrack",
      hasPrevious ? () => onPreviousRef.current?.() : null
    );

    return () => {
      setHandler("play", null);
      setHandler("pause", null);
      setHandler("nexttrack", null);
      setHandler("previoustrack", null);
      mediaSession.metadata = null;
      mediaSession.playbackState = "none";
    };
  }, [album, artist, hasNext, hasPrevious, isSubscriber, title]);

  useEffect(() => {
    if (!isSubscriber || !("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
  }, [isPlaying, isSubscriber]);
}
