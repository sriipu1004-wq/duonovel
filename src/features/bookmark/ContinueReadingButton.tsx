"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getPlayLogBySeries } from "@/lib/playLogs";
import { supabase } from "@/lib/supabaseClient";

type ContinueReadingButtonProps = {
  seriesId: string;
  fallbackEpisodeNumber?: number | null;
  fallbackReaderKey?: string;
  fallbackReaderName?: string;
};

type BookmarkData = {
  seriesId: string;
  episodeNumber: number;
  currentTime: number;
  readerKey?: string;
  readerName?: string;
};

type RecordingLookupRow = Record<string, unknown> & {
  id: string;
  reader_id?: string | null;
  reader_user_id?: string | null;
  readerUserId?: string | null;
  reader_name?: string | null;
  narrator_name?: string | null;
  display_name?: string | null;
  speaker_name?: string | null;
};

type ResumeData = {
  episodeNumber: number;
  startAt: number;
  readerKey?: string;
  readerName?: string;
};

function pickText(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return "";
}

function toSafeNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 0 ? fallback : value;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) {
    return fallback;
  }

  return parsed < 0 ? fallback : parsed;
}

function buildReadHref(
  seriesId: string,
  episodeNumber: number,
  readerKey?: string,
  readerName?: string,
  startAt?: number
): string {
  const query = new URLSearchParams();

  if (readerKey) query.set("readerKey", readerKey);
  if (readerName) query.set("readerName", readerName);
  if (typeof startAt === "number" && Number.isFinite(startAt) && startAt > 0) {
    query.set("startAt", String(Math.floor(startAt)));
  }

  const queryString = query.toString();
  return `/read/${seriesId}/${episodeNumber}${queryString ? `?${queryString}` : ""}`;
}

function readLocalBookmark(seriesId: string): BookmarkData | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(`duonovel:bookmark:${seriesId}`);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as BookmarkData | null;
    if (!parsed || parsed.seriesId !== seriesId) return null;

    return parsed;
  } catch {
    return null;
  }
}

function readLocalResume(seriesId: string): ResumeData | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(`duonovel:read-progress:${seriesId}`);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as {
      episodeNumber?: unknown;
      positionSeconds?: unknown;
      recordingId?: unknown;
    } | null;

    if (!parsed) return null;

    const episodeNumber = Math.max(
      1,
      Math.floor(toSafeNumber(parsed.episodeNumber, 1))
    );
    const startAt = toSafeNumber(parsed.positionSeconds, 0);

    return {
      episodeNumber,
      startAt,
    };
  } catch {
    return null;
  }
}

async function fetchRecordingReader(
  recordingId: string
): Promise<{ readerKey?: string; readerName?: string }> {
  if (!recordingId) return {};

  const { data, error } = await supabase
    .from("recordings")
    .select("*")
    .eq("id", recordingId)
    .maybeSingle();

  if (error || !data) {
    return {};
  }

  const recording = data as RecordingLookupRow;

  return {
    readerKey:
      pickText(
        recording.reader_id,
        recording.reader_user_id,
        recording.readerUserId,
        recording.reader_name,
        recording.narrator_name,
        recording.display_name,
        recording.speaker_name,
        recording.id
      ) || undefined,
    readerName:
      pickText(
        recording.reader_name,
        recording.narrator_name,
        recording.display_name,
        recording.speaker_name
      ) || undefined,
  };
}

export default function ContinueReadingButton({
  seriesId,
  fallbackEpisodeNumber,
  fallbackReaderKey,
  fallbackReaderName,
}: ContinueReadingButtonProps) {
  const [loaded, setLoaded] = useState(false);
  const [resume, setResume] = useState<ResumeData | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadResume() {
      setLoaded(false);

      const localResume = readLocalResume(seriesId);
      const localBookmark = readLocalBookmark(seriesId);

      try {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError) {
          throw authError;
        }

        if (user) {
          const { data: playLog, error } = await getPlayLogBySeries(supabase, {
            userId: user.id,
            seriesId,
          });

          if (error) {
            throw error;
          }

          if (playLog) {
            const recordingReader = playLog.recording_id
              ? await fetchRecordingReader(playLog.recording_id)
              : {};

            if (cancelled) return;

            setResume({
              episodeNumber: playLog.episode_number,
              startAt: toSafeNumber(playLog.position_seconds, 0),
              readerKey: recordingReader.readerKey ?? fallbackReaderKey,
              readerName: recordingReader.readerName ?? fallbackReaderName,
            });
            setLoaded(true);
            return;
          }
        }
      } catch {
        // noop
      }

      if (cancelled) return;

      if (localResume) {
        setResume({
          episodeNumber: localResume.episodeNumber,
          startAt: localResume.startAt,
          readerKey: fallbackReaderKey,
          readerName: fallbackReaderName,
        });
        setLoaded(true);
        return;
      }

      if (localBookmark) {
        setResume({
          episodeNumber: Math.max(1, Math.floor(toSafeNumber(localBookmark.episodeNumber, 1))),
          startAt: toSafeNumber(localBookmark.currentTime, 0),
          readerKey: localBookmark.readerKey ?? fallbackReaderKey,
          readerName: localBookmark.readerName ?? fallbackReaderName,
        });
      } else {
        setResume(null);
      }

      setLoaded(true);
    }

    void loadResume();

    return () => {
      cancelled = true;
    };
  }, [seriesId, fallbackReaderKey, fallbackReaderName]);

  if (!loaded) {
    return (
      <span className="rounded-full border border-black/10 bg-neutral-50 px-4 py-2.5 text-sm text-neutral-500">
        続きを確認中
      </span>
    );
  }

  if (resume) {
    return (
      <Link
        href={buildReadHref(
          seriesId,
          resume.episodeNumber,
          resume.readerKey,
          resume.readerName,
          resume.startAt
        )}
        className="rounded-full border border-black/10 bg-white px-4 py-2.5 text-sm text-neutral-700 transition hover:bg-neutral-50"
      >
        続きから読む
      </Link>
    );
  }

  if (fallbackEpisodeNumber !== null && fallbackEpisodeNumber !== undefined) {
    return (
      <Link
        href={buildReadHref(
          seriesId,
          fallbackEpisodeNumber,
          fallbackReaderKey,
          fallbackReaderName
        )}
        className="rounded-full border border-black/10 bg-white px-4 py-2.5 text-sm text-neutral-700 transition hover:bg-neutral-50"
      >
        続きから読む
      </Link>
    );
  }

  return (
    <span className="rounded-full border border-black/10 bg-neutral-50 px-4 py-2.5 text-sm text-neutral-500">
      続きから読む
    </span>
  );
}