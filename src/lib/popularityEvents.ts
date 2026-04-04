import { supabase } from "@/lib/supabaseClient";

type TrackSeriesViewInput = {
  seriesId: string;
  episodeId: string | null;
  episodeNumber: number;
};

type TrackRecordingPlayStartInput = {
  seriesId: string;
  episodeId: string | null;
  episodeNumber: number;
  recordingId: string | null;
};

const POPULARITY_SESSION_KEY = "duonovel:popularity-session-id";
const SERIES_VIEW_PREFIX = "duonovel:popularity:series-view:";
const RECORDING_PLAY_PREFIX = "duonovel:popularity:recording-play:";

function getSessionStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function createRandomId(): string {
  if (typeof window !== "undefined" && window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getPopularitySessionId(): string | null {
  const storage = getSessionStorage();
  if (!storage) {
    return null;
  }

  const existing = storage.getItem(POPULARITY_SESSION_KEY);
  if (existing) {
    return existing;
  }

  const nextValue = createRandomId();
  storage.setItem(POPULARITY_SESSION_KEY, nextValue);
  return nextValue;
}

function buildSeriesViewStorageKey(sessionId: string, episodeId: string): string {
  return `${SERIES_VIEW_PREFIX}${sessionId}:${episodeId}`;
}

function buildRecordingPlayStorageKey(
  sessionId: string,
  recordingId: string
): string {
  return `${RECORDING_PLAY_PREFIX}${sessionId}:${recordingId}`;
}

async function getCurrentUserId(): Promise<string | null> {
  try {
    const { data, error } = await supabase.auth.getUser();

    if (error) {
      return null;
    }

    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

export async function trackSeriesViewOnce(
  input: TrackSeriesViewInput
): Promise<void> {
  const episodeId = input.episodeId?.trim() ?? "";

  if (!input.seriesId || !episodeId) {
    return;
  }

  if (!Number.isFinite(input.episodeNumber) || input.episodeNumber <= 0) {
    return;
  }

  const storage = getSessionStorage();
  const sessionId = getPopularitySessionId();

  if (!storage || !sessionId) {
    return;
  }

  const localKey = buildSeriesViewStorageKey(sessionId, episodeId);
  if (storage.getItem(localKey) === "1") {
    return;
  }

  const userId = await getCurrentUserId();

  const { error } = await supabase.from("series_view_events").upsert(
    {
      series_id: input.seriesId,
      episode_id: episodeId,
      episode_number: Math.floor(input.episodeNumber),
      user_id: userId,
      session_id: sessionId,
    },
    {
      onConflict: "session_id,episode_id",
      ignoreDuplicates: true,
    }
  );

  if (error) {
    console.error("[popularityEvents] series view insert failed:", error);
    return;
  }

  storage.setItem(localKey, "1");
}

export async function trackRecordingPlayStartOnce(
  input: TrackRecordingPlayStartInput
): Promise<void> {
  const episodeId = input.episodeId?.trim() ?? "";
  const recordingId = input.recordingId?.trim() ?? "";

  if (!input.seriesId || !episodeId || !recordingId) {
    return;
  }

  if (!Number.isFinite(input.episodeNumber) || input.episodeNumber <= 0) {
    return;
  }

  const storage = getSessionStorage();
  const sessionId = getPopularitySessionId();

  if (!storage || !sessionId) {
    return;
  }

  const localKey = buildRecordingPlayStorageKey(sessionId, recordingId);
  if (storage.getItem(localKey) === "1") {
    return;
  }

  const userId = await getCurrentUserId();

  const { error } = await supabase.from("recording_play_events").upsert(
    {
      series_id: input.seriesId,
      episode_id: episodeId,
      episode_number: Math.floor(input.episodeNumber),
      recording_id: recordingId,
      user_id: userId,
      session_id: sessionId,
    },
    {
      onConflict: "session_id,recording_id",
      ignoreDuplicates: true,
    }
  );

  if (error) {
    console.error("[popularityEvents] recording play insert failed:", error);
    return;
  }

  storage.setItem(localKey, "1");
}