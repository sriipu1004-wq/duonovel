"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getPlayLogBySeries,
  savePlayLog,
  toPlayLogResumeState,
} from "@/lib/playLogs";

/*
  ここだけはプロジェクトの実ファイルに合わせて読み替えて。
  たぶんこのどちらか。
  1) "@/lib/supabase/client"
  2) "@/utils/supabase/client"
*/
import { createClient } from "@/lib/supabase/client";

export type ReadResumeState = {
  episodeNumber: number;
  recordingId: string | null;
  positionSeconds: number;
  markerIndex: number;
  progressPercent: number;
  isFollowing: boolean;
};

export type PlayLogSaveReason =
  | "interval"
  | "pause"
  | "seek"
  | "episode-move"
  | "pagehide"
  | "beforeunload";

type StorageMode = "unknown" | "supabase" | "local";

type UsePlayLogPersistenceArgs = {
  seriesId: string;
  episodeId: string | null;
  episodeNumber: number;
  recordingId: string | null;
  currentTime: number;
  duration: number;
  markerIndex: number;
  isFollowing: boolean;
  isPlaying: boolean;
  intervalMs?: number;
  restoreEnabled?: boolean;
  persistEpisodeScopedLocal?: boolean;
  onRestore: (nextState: ReadResumeState) => void;
  readLocalResumeState: (seriesId: string) => ReadResumeState | null;
  writeLocalResumeState: (seriesId: string, nextState: ReadResumeState) => void;
};

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function extractSkipped(result: unknown): boolean {
  if (!result || typeof result !== "object") return false;
  return "skipped" in result && Boolean((result as { skipped?: unknown }).skipped);
}

function extractData(result: unknown): unknown {
  if (!result || typeof result !== "object") return result ?? null;
  if ("data" in result) {
    return (result as { data?: unknown }).data ?? null;
  }
  return result;
}

function normalizeBoolean(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

function normalizeNumber(value: unknown, fallback: number) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function normalizeResumeState(value: unknown): ReadResumeState | null {
  if (!value || typeof value !== "object") return null;

  const raw = value as Record<string, unknown>;

  const episodeNumber = normalizeNumber(
    raw.episodeNumber ?? raw.episode_number,
    NaN
  );

  if (!Number.isFinite(episodeNumber)) {
    return null;
  }

  return {
    episodeNumber,
    recordingId:
      typeof (raw.recordingId ?? raw.recording_id) === "string"
        ? String(raw.recordingId ?? raw.recording_id)
        : null,
    positionSeconds: normalizeNumber(
      raw.positionSeconds ?? raw.position_seconds,
      0
    ),
    markerIndex: normalizeNumber(raw.markerIndex ?? raw.marker_index, 0),
    progressPercent: normalizeNumber(
      raw.progressPercent ?? raw.progress_percent,
      0
    ),
    isFollowing: normalizeBoolean(raw.isFollowing ?? raw.is_following, true),
  };
}

function buildEpisodeScopedResumeKey(seriesId: string, episodeNumber: number) {
  return `duonovel:read-progress:${seriesId}:episode:${episodeNumber}`;
}

function parseStoredResumeState(raw: string | null): ReadResumeState | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as unknown;
    return normalizeResumeState(parsed);
  } catch (error) {
    console.error("[usePlayLogPersistence] local episode resume parse failed:", error);
    return null;
  }
}

export function usePlayLogPersistence({
  seriesId,
  episodeId,
  episodeNumber,
  recordingId,
  currentTime,
  duration,
  markerIndex,
  isFollowing,
  isPlaying,
  intervalMs = 4000,
  restoreEnabled = false,
  persistEpisodeScopedLocal = false,
  onRestore,
  readLocalResumeState,
  writeLocalResumeState,
}: UsePlayLogPersistenceArgs) {
  const supabase = useMemo(() => createClient(), []);

  const [storageMode, setStorageMode] = useState<StorageMode>("unknown");
  const [initialRestoreFinished, setInitialRestoreFinished] = useState(false);

  const storageModeRef = useRef<StorageMode>("unknown");
  const initialRestoreFinishedRef = useRef(false);
  const restoreRequestedRef = useRef(false);
  const lastPersistedSignatureRef = useRef("");

  const snapshotRef = useRef({
    seriesId,
    episodeId,
    episodeNumber,
    recordingId,
    currentTime,
    duration,
    markerIndex,
    isFollowing,
    isPlaying,
  });

  useEffect(() => {
    snapshotRef.current = {
      seriesId,
      episodeId,
      episodeNumber,
      recordingId,
      currentTime,
      duration,
      markerIndex,
      isFollowing,
      isPlaying,
    };
  }, [
    seriesId,
    episodeId,
    episodeNumber,
    recordingId,
    currentTime,
    duration,
    markerIndex,
    isFollowing,
    isPlaying,
  ]);

  useEffect(() => {
    storageModeRef.current = storageMode;
  }, [storageMode]);

  useEffect(() => {
    initialRestoreFinishedRef.current = initialRestoreFinished;
  }, [initialRestoreFinished]);

  useEffect(() => {
    restoreRequestedRef.current = false;
    setInitialRestoreFinished(false);
    initialRestoreFinishedRef.current = false;
    lastPersistedSignatureRef.current = "";
  }, [seriesId, episodeNumber]);

  const buildResumeState = useCallback((): ReadResumeState | null => {
    const snap = snapshotRef.current;

    if (!snap.seriesId) return null;
    if (!Number.isFinite(Number(snap.episodeNumber))) return null;

    const safeDuration =
      Number.isFinite(snap.duration) && snap.duration > 0 ? snap.duration : 0;

    const safeCurrentTime = clampNumber(
      Number(snap.currentTime),
      0,
      safeDuration > 0 ? safeDuration : Number.MAX_SAFE_INTEGER
    );

    const progressPercent =
      safeDuration > 0 ? (safeCurrentTime / safeDuration) * 100 : 0;

    return {
      episodeNumber: Number(snap.episodeNumber),
      recordingId: snap.recordingId ?? null,
      positionSeconds: safeCurrentTime,
      markerIndex: Number.isFinite(Number(snap.markerIndex))
        ? Number(snap.markerIndex)
        : 0,
      progressPercent: clampNumber(progressPercent, 0, 100),
      isFollowing: Boolean(snap.isFollowing),
    };
  }, []);

  const writeToLocal = useCallback(
    (nextState: ReadResumeState) => {
      writeLocalResumeState(seriesId, nextState);
    },
    [seriesId, writeLocalResumeState]
  );

  const writeEpisodeScopedLocal = useCallback(
    (nextState: ReadResumeState) => {
      if (typeof window === "undefined") return;
      if (!seriesId) return;

      window.localStorage.setItem(
        buildEpisodeScopedResumeKey(seriesId, nextState.episodeNumber),
        JSON.stringify(nextState)
      );
    },
    [seriesId]
  );

  const readEpisodeScopedLocal = useCallback(
    (targetSeriesId: string, targetEpisodeNumber: number): ReadResumeState | null => {
      if (typeof window === "undefined") return null;
      if (!targetSeriesId) return null;
      if (!Number.isFinite(Number(targetEpisodeNumber))) return null;

      return parseStoredResumeState(
        window.localStorage.getItem(
          buildEpisodeScopedResumeKey(targetSeriesId, targetEpisodeNumber)
        )
      );
    },
    []
  );

  const getCurrentUserId = useCallback(async () => {
    const { data, error } = await supabase.auth.getUser();

    if (error) {
      console.error("[usePlayLogPersistence] getUser failed:", error);
      return null;
    }

    return data.user?.id ?? null;
  }, [supabase]);

  const flushPlayLog = useCallback(
    async (reason: PlayLogSaveReason) => {
      if (!initialRestoreFinishedRef.current) return;

      const snap = snapshotRef.current;
      if (!snap.seriesId || !snap.episodeId) return;

      const resumeState = buildResumeState();
      if (!resumeState) return;

      if (persistEpisodeScopedLocal) {
        writeEpisodeScopedLocal(resumeState);
      }

      const signature = JSON.stringify({
        episodeNumber: resumeState.episodeNumber,
        recordingId: resumeState.recordingId,
        positionSeconds: Math.floor(resumeState.positionSeconds),
        markerIndex: resumeState.markerIndex,
        progressPercent: Math.floor(resumeState.progressPercent),
        isFollowing: resumeState.isFollowing,
      });

      if (
        reason === "interval" &&
        signature === lastPersistedSignatureRef.current
      ) {
        return;
      }

      if (storageModeRef.current === "local") {
        writeToLocal(resumeState);
        lastPersistedSignatureRef.current = signature;
        return;
      }

      const userId = await getCurrentUserId();

      if (!userId) {
        setStorageMode("local");
        storageModeRef.current = "local";
        writeToLocal(resumeState);
        lastPersistedSignatureRef.current = signature;
        return;
      }

      const payload: Parameters<typeof savePlayLog>[1] = {
        userId,
        seriesId: snap.seriesId,
        episodeId: snap.episodeId,
        episodeNumber: resumeState.episodeNumber,
        recordingId: resumeState.recordingId,
        positionSeconds: resumeState.positionSeconds,
        markerIndex: resumeState.markerIndex,
        progressPercent: resumeState.progressPercent,
        isFollowing: resumeState.isFollowing,
      };

      try {
        const result = await savePlayLog(supabase, payload);

        if (extractSkipped(result)) {
          setStorageMode("local");
          storageModeRef.current = "local";
          writeToLocal(resumeState);
        } else {
          setStorageMode("supabase");
          storageModeRef.current = "supabase";
        }

        lastPersistedSignatureRef.current = signature;
      } catch (error) {
        console.error("[usePlayLogPersistence] savePlayLog failed:", error);
      }
    },
    [buildResumeState, getCurrentUserId, supabase, writeEpisodeScopedLocal, writeToLocal]
  );

  useEffect(() => {
    if (!seriesId || restoreRequestedRef.current) return;

    restoreRequestedRef.current = true;

    if (!restoreEnabled) {
      setInitialRestoreFinished(true);
      initialRestoreFinishedRef.current = true;
      return;
    }

    let cancelled = false;

    const run = async () => {
      try {
        const targetEpisodeNumber = Number(episodeNumber);
        const tryEpisodeScopedFallback = () => {
          const episodeScopedState = readEpisodeScopedLocal(
            seriesId,
            targetEpisodeNumber
          );

          if (
            episodeScopedState &&
            Number(episodeScopedState.episodeNumber) === targetEpisodeNumber
          ) {
            onRestore(episodeScopedState);
          }
        };

        const userId = await getCurrentUserId();

        if (cancelled) return;

        if (!userId) {
          setStorageMode("local");
          storageModeRef.current = "local";

          const localState = readLocalResumeState(seriesId);

          if (
            localState &&
            Number(localState.episodeNumber) === targetEpisodeNumber
          ) {
            onRestore(localState);
            return;
          }

          tryEpisodeScopedFallback();
          return;
        }

        const result = await getPlayLogBySeries(supabase, { userId, seriesId });

        if (cancelled) return;

        setStorageMode("supabase");
        storageModeRef.current = "supabase";

        const row = extractData(result);

        if (row) {
          const resumeState = normalizeResumeState(
            toPlayLogResumeState(row as never)
          );

          if (
            resumeState &&
            Number(resumeState.episodeNumber) === targetEpisodeNumber
          ) {
            onRestore(resumeState);
            return;
          }
        }

        tryEpisodeScopedFallback();
      } catch (error) {
        console.error("[usePlayLogPersistence] initial restore failed:", error);
      } finally {
        if (!cancelled) {
          setInitialRestoreFinished(true);
          initialRestoreFinishedRef.current = true;
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [
    seriesId,
    episodeNumber,
    getCurrentUserId,
    onRestore,
    readEpisodeScopedLocal,
    readLocalResumeState,
    restoreEnabled,
    supabase,
  ]);

  useEffect(() => {
    if (!initialRestoreFinished) return;
    if (!isPlaying) return;

    const timerId = window.setInterval(() => {
      void flushPlayLog("interval");
    }, intervalMs);

    return () => {
      window.clearInterval(timerId);
    };
  }, [flushPlayLog, initialRestoreFinished, intervalMs, isPlaying]);

  useEffect(() => {
    if (!initialRestoreFinished) return;

    const handlePageHide = () => {
      void flushPlayLog("pagehide");
    };

    const handleBeforeUnload = () => {
      void flushPlayLog("beforeunload");
    };

    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [flushPlayLog, initialRestoreFinished]);

  return {
    storageMode,
    initialRestoreFinished,
    flushPlayLog,
  };
}