"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getPlayLogBySeries } from "@/lib/playLogs";
import { supabase } from "@/lib/supabaseClient";

type ContinueReadingCardProps = {
  seriesId: string;
  fallbackEpisodeNumber?: number | null;
  fallbackReaderKey?: string;
  fallbackReaderName?: string;
};

type BookmarkData = {
  seriesId: string;
  episodeNumber: number;
  episodeTitle?: string;
  currentTime: number;
  duration: number;
  readerKey?: string;
  readerName?: string;
  savedAt: string;
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
  source: "play_logs" | "local";
  episodeNumber: number;
  episodeTitle?: string;
  startAt: number;
  duration?: number;
  readerKey?: string;
  readerName?: string;
  savedAt?: string;
  progressPercent?: number;
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

function formatTime(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "0:00";

  const totalSeconds = Math.floor(value);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatSavedAt(value?: string): string {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleString("ja-JP");
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
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(`duonovel:bookmark:${seriesId}`);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as BookmarkData | null;
    if (!parsed || parsed.seriesId !== seriesId) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

async function fetchEpisodeTitle(episodeId: string): Promise<string | undefined> {
  if (!episodeId) return undefined;

  const { data, error } = await supabase
    .from("episodes")
    .select("title, episode_title")
    .eq("id", episodeId)
    .maybeSingle();

  if (error || !data) {
    return undefined;
  }

  const row = data as Record<string, unknown>;
  return pickText(row.title, row["episode_title"]) || undefined;
}

async function fetchRecordingReader(
  recordingId: string
): Promise<{ readerKey?: string; readerName?: string }> {
  if (!recordingId) {
    return {};
  }

  const { data, error } = await supabase
    .from("recordings")
    .select("*")
    .eq("id", recordingId)
    .maybeSingle();

  if (error || !data) {
    return {};
  }

  const recording = data as RecordingLookupRow;

  const readerKey =
    pickText(
      recording.reader_id,
      recording.reader_user_id,
      recording.readerUserId,
      recording.reader_name,
      recording.narrator_name,
      recording.display_name,
      recording.speaker_name,
      recording.id
    ) || undefined;

  const readerName =
    pickText(
      recording.reader_name,
      recording.narrator_name,
      recording.display_name,
      recording.speaker_name
    ) || undefined;

  return {
    readerKey,
    readerName,
  };
}

function toLocalResumeData(
  bookmark: BookmarkData,
  fallbackReaderKey?: string,
  fallbackReaderName?: string
): ResumeData {
  const duration = toSafeNumber(bookmark.duration, 0);
  const startAt = toSafeNumber(bookmark.currentTime, 0);
  const progressPercent =
    duration > 0 ? Math.min(100, Math.max(0, Math.floor((startAt / duration) * 100))) : undefined;

  return {
    source: "local",
    episodeNumber: Math.max(1, Math.floor(toSafeNumber(bookmark.episodeNumber, 1))),
    episodeTitle: bookmark.episodeTitle,
    startAt,
    duration,
    readerKey: bookmark.readerKey ?? fallbackReaderKey,
    readerName: bookmark.readerName ?? fallbackReaderName,
    savedAt: bookmark.savedAt,
    progressPercent,
  };
}

export default function ContinueReadingCard({
  seriesId,
  fallbackEpisodeNumber,
  fallbackReaderKey,
  fallbackReaderName,
}: ContinueReadingCardProps) {
  const [resume, setResume] = useState<ResumeData | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasSession, setHasSession] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadContinueReading() {
      setLoaded(false);
      setLoadError(null);

      const localBookmark = readLocalBookmark(seriesId);

      try {
        const { data: authData, error: authError } = await supabase.auth.getUser();

        if (authError) {
          throw authError;
        }

        const userId = authData.user?.id ?? null;

        if (cancelled) return;
        setHasSession(Boolean(userId));

        if (userId) {
          const { data: playLog, error } = await getPlayLogBySeries(supabase, {
            userId,
            seriesId,
          });

          if (error) {
            throw error;
          }

          if (playLog) {
            const [episodeTitle, recordingReader] = await Promise.all([
              fetchEpisodeTitle(playLog.episode_id),
              playLog.recording_id
                ? fetchRecordingReader(playLog.recording_id)
                : Promise.resolve<{ readerKey?: string; readerName?: string }>({}),
            ]);

            if (cancelled) return;

            setResume({
              source: "play_logs",
              episodeNumber: playLog.episode_number,
              episodeTitle,
              startAt: toSafeNumber(playLog.position_seconds, 0),
              readerKey: recordingReader.readerKey ?? fallbackReaderKey,
              readerName: recordingReader.readerName ?? fallbackReaderName,
              savedAt: playLog.last_played_at,
              progressPercent: toSafeNumber(playLog.progress_percent, 0),
            });
            setLoaded(true);
            return;
          }
        }
      } catch (error) {
        console.error("ContinueReadingCard: play_logs の取得に失敗", error);
        setHasSession(null);
        setLoadError("アカウント保存の続き位置を取得できなかったため、端末保存を優先した。");
      }

      if (cancelled) return;

      if (localBookmark) {
        setResume(toLocalResumeData(localBookmark, fallbackReaderKey, fallbackReaderName));
      } else {
        setResume(null);
      }

      setLoaded(true);
    }

    void loadContinueReading();

    return () => {
      cancelled = true;
    };
  }, [seriesId, fallbackReaderKey, fallbackReaderName]);

  const progressText = useMemo(() => {
    if (!resume) return "";

    if (typeof resume.duration === "number" && resume.duration > 0) {
      const percent = Math.min(
        100,
        Math.max(0, Math.floor((resume.startAt / resume.duration) * 100))
      );
      return `${formatTime(resume.startAt)} / ${formatTime(resume.duration)} ・ ${percent}%`;
    }

    if (typeof resume.progressPercent === "number" && resume.progressPercent > 0) {
      const percent = Math.min(100, Math.max(0, Math.floor(resume.progressPercent)));
      return `${formatTime(resume.startAt)} ・ ${percent}%`;
    }

    return formatTime(resume.startAt);
  }, [resume]);

  const savedAtText = useMemo(() => {
    return formatSavedAt(resume?.savedAt);
  }, [resume?.savedAt]);

  if (!loaded) {
    return (
      <div className="rounded-3xl border border-black/10 bg-white p-4 text-sm text-neutral-500">
        しおりを確認中...
      </div>
    );
  }

  if (!resume) {
    return (
      <div className="rounded-3xl border border-black/10 bg-white p-4">
        <p className="text-sm text-neutral-600">しおり未保存</p>
        <p className="mt-2 text-sm text-neutral-700">
          保存された続きを読める位置がまだない。最初の話から始める。
        </p>

        {hasSession === false ? (
          <p className="mt-3 text-xs leading-6 text-neutral-500">
            今はサイト内未ログイン状態。DB保存の続き位置は使わず、端末保存だけを見る。
          </p>
        ) : null}

        {loadError ? (
          <p className="mt-3 text-xs leading-6 text-neutral-600">{loadError}</p>
        ) : null}

        {fallbackEpisodeNumber !== null && fallbackEpisodeNumber !== undefined ? (
          <Link
            href={buildReadHref(
              seriesId,
              fallbackEpisodeNumber,
              fallbackReaderKey,
              fallbackReaderName
            )}
            className="mt-4 inline-flex rounded-full border border-black/10 bg-neutral-200 px-4 py-2 text-sm font-medium text-black transition hover:bg-neutral-300"
          >
            第1話から読む
          </Link>
        ) : null}
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-black/10 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-neutral-600">保存済みの続き</p>
        <span
          className={[
            "rounded-full border px-3 py-1 text-xs",
            resume.source === "play_logs"
              ? "border-sky-200 bg-sky-50 text-neutral-900"
              : "border-black/10 bg-neutral-50 text-neutral-600",
          ].join(" ")}
        >
          {resume.source === "play_logs" ? "DB" : "端末"}
        </span>
      </div>

      <p className="mt-2 text-xl font-semibold text-black">第{resume.episodeNumber}話</p>

      {resume.episodeTitle ? (
        <p className="mt-2 text-sm text-neutral-800">{resume.episodeTitle}</p>
      ) : null}

      {resume.readerName ? (
        <p className="mt-2 text-sm text-neutral-700">朗読者固定: {resume.readerName}</p>
      ) : null}

      <p className="mt-2 text-sm text-neutral-600">{progressText}</p>

      {savedAtText ? (
        <p className="mt-2 text-xs text-neutral-500">最終保存: {savedAtText}</p>
      ) : null}

      {resume.source === "local" && hasSession === false ? (
        <p className="mt-2 text-xs leading-6 text-neutral-500">
          今はサイト内未ログインのため、端末保存の続き位置を使っている。
        </p>
      ) : null}

      {loadError && resume.source === "local" ? (
        <p className="mt-2 text-xs leading-6 text-neutral-600">{loadError}</p>
      ) : null}

      <Link
        href={buildReadHref(
          seriesId,
          resume.episodeNumber,
          resume.readerKey,
          resume.readerName,
          resume.startAt
        )}
        className="mt-4 inline-flex rounded-full border border-black/10 bg-neutral-200 px-4 py-2 text-sm font-medium text-black transition hover:bg-neutral-300"
      >
        続きから読む
      </Link>
    </div>
  );
}