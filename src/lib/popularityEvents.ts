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

async function postPopularityEvent(payload: Record<string, unknown>): Promise<boolean> {
  try {
    const response = await fetch("/api/popularity/events", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      keepalive: true,
    });

    return response.ok;
  } catch (error) {
    console.error("[popularityEvents] event post failed:", error);
    return false;
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

  const ok = await postPopularityEvent({
    kind: "series_view",
    seriesId: input.seriesId,
    episodeId,
    episodeNumber: Math.floor(input.episodeNumber),
    sessionId,
  });

  if (!ok) {
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

  const ok = await postPopularityEvent({
    kind: "recording_play",
    seriesId: input.seriesId,
    episodeId,
    episodeNumber: Math.floor(input.episodeNumber),
    recordingId,
    sessionId,
  });

  if (!ok) {
    return;
  }

  storage.setItem(localKey, "1");
}