// Issue #154 GI-P2: the /api/popularity/events handler with its I/O injected,
// so the ingest decisions (bot filter, same-site check, daily cap) can be
// exercised in unit tests without Supabase. The route file wires the real
// Supabase admin client into `PopularityIngestDeps`.

import { createHash } from "crypto";
import {
  classifyPopularityActorCaps,
  classifyPopularityIngestRequest,
  logPopularityIngestSkip,
  POPULARITY_DAILY_ROW_CAP,
  POPULARITY_DAILY_SERIES_ROW_CAP,
  type PopularityIngestSkipReason,
} from "@/lib/popularityIngestGuard";

export type PopularityEventKind = "series_view" | "recording_play";
export type PopularityEventTable = "series_view_events" | "recording_play_events";

type DbResult<T> = { data: T | null; error: unknown };

export type PopularityEpisodeRow = {
  id: string;
  series_id: string;
  episode_number: number | string;
  posting_status: string | null;
  is_published: boolean | null;
};

export type PopularitySeriesRow = { id: string; publication_status: string | null };

export type PopularityRecordingRow = {
  id: string;
  series_id: string;
  episode_id: string;
  is_public: boolean | null;
};

export type PopularityInsertRow = {
  series_id: string;
  episode_id: string;
  episode_number: number;
  user_id: string | null;
  session_id: string;
  recording_id?: string;
};

export type PopularityIngestDeps = {
  getCurrentUserId: () => Promise<string | null>;
  findEpisode: (episodeId: string) => Promise<DbResult<PopularityEpisodeRow>>;
  findSeries: (seriesId: string) => Promise<DbResult<PopularitySeriesRow>>;
  findRecording: (recordingId: string) => Promise<DbResult<PopularityRecordingRow>>;
  /**
   * series_id of the rows this actor (session_id) already has in `table`,
   * at most `limit` of them. null = could not be read.
   * Filter on session_id only, so the (session_id, episode_id|recording_id)
   * unique index serves the lookup.
   */
  listActorSeriesIds: (
    table: PopularityEventTable,
    sessionId: string,
    limit: number
  ) => Promise<string[] | null>;
  /** Insert ignoring (session_id, episode_id|recording_id) duplicates. */
  insertEvent: (
    table: PopularityEventTable,
    row: PopularityInsertRow
  ) => Promise<{ error: unknown }>;
  now?: () => Date;
  dailyRowCap?: number;
  dailySeriesRowCap?: number;
  onSkip?: (reason: PopularityIngestSkipReason) => void;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

function json(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, { status });
}

/**
 * 202 + no row. The browser client treats any 2xx as handled and does not
 * retry, so a filtered reader sees no error and the Reader is unaffected.
 */
function skipped(
  reason: PopularityIngestSkipReason,
  onSkip: (reason: PopularityIngestSkipReason) => void
): Response {
  onSkip(reason);
  return json({ ok: true, recorded: false }, 202);
}

/**
 * Vercel overwrites x-forwarded-for with the client's public IP and does not
 * forward external values (https://vercel.com/docs/headers/request-headers#x-forwarded-for),
 * so on Vercel the anonymous actor cannot be chosen by the caller.
 */
export function popularityForwardedIp(headers: Headers): string {
  for (const name of [
    "x-forwarded-for",
    "x-vercel-forwarded-for",
    "cf-connecting-ip",
    "x-real-ip",
  ]) {
    const value = headers.get(name)?.split(",")[0]?.trim();
    if (value) return value;
  }
  return "unknown";
}

export function tokyoCalendarDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}

/** Unchanged from before GI-P2: sha256(salt, JST day, user id or IP). */
export function popularitySessionId(args: {
  headers: Headers;
  userId: string | null;
  now?: Date;
}): string {
  const salt =
    process.env.IP_HASH_SALT ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "libread-local-popularity";
  const day = tokyoCalendarDate(args.now);
  const actor = args.userId
    ? `user:${args.userId}`
    : `ip:${popularityForwardedIp(args.headers)}`;
  return createHash("sha256")
    .update(`${salt}:popularity:v2:${day}:${actor}`)
    .digest("hex");
}

export async function handlePopularityEvent(
  request: Request,
  deps: PopularityIngestDeps
): Promise<Response> {
  const onSkip = deps.onSkip ?? logPopularityIngestSkip;

  // 1. Header-only filter, before any parsing or database work.
  const headerDecision = classifyPopularityIngestRequest(request.headers, request.url);
  if (!headerDecision.accept) {
    return skipped(headerDecision.reason, onSkip);
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: "リクエストを読めなかった。" }, 400);
  }
  if (!payload || typeof payload !== "object") {
    return json({ ok: false, error: "リクエストを読めなかった。" }, 400);
  }

  const kind = readText(payload.kind) as PopularityEventKind;
  const requestedSeriesId = readText(payload.seriesId);
  const episodeId = readText(payload.episodeId);
  const recordingId = readText(payload.recordingId);

  if (kind !== "series_view" && kind !== "recording_play") {
    return json({ ok: false, error: "event kind が不正。" }, 400);
  }
  if (!isUuid(requestedSeriesId) || !isUuid(episodeId)) {
    return json({ ok: false, error: "作品または話IDが不正。" }, 400);
  }
  if (kind === "recording_play" && !isUuid(recordingId)) {
    return json({ ok: false, error: "recordingId が不正。" }, 400);
  }

  const userId = await deps.getCurrentUserId();

  // Do not trust seriesId, episodeNumber, recording relationships, or public
  // visibility supplied by the browser. Popularity rows feed ranking counters,
  // so all canonical event dimensions are resolved from the database.
  const { data: episode, error: episodeError } = await deps.findEpisode(episodeId);
  if (
    episodeError ||
    !episode ||
    String(episode.series_id) !== requestedSeriesId ||
    episode.posting_status !== "posted" ||
    episode.is_published !== true
  ) {
    return json({ ok: false, error: "公開中の話が見つからない。" }, 404);
  }

  const { data: series, error: seriesError } = await deps.findSeries(requestedSeriesId);
  if (seriesError || !series || series.publication_status !== "public") {
    return json({ ok: false, error: "公開中の作品が見つからない。" }, 404);
  }

  const canonicalSessionId = popularitySessionId({
    headers: request.headers,
    userId,
    now: deps.now?.(),
  });
  const canonicalEpisodeNumber = Number(episode.episode_number);
  if (!Number.isSafeInteger(canonicalEpisodeNumber) || canonicalEpisodeNumber <= 0) {
    return json({ ok: false, error: "話番号が不正。" }, 500);
  }

  if (kind === "recording_play") {
    const { data: recording, error: recordingError } =
      await deps.findRecording(recordingId);
    if (
      recordingError ||
      !recording ||
      recording.is_public !== true ||
      String(recording.series_id) !== requestedSeriesId ||
      String(recording.episode_id) !== episodeId
    ) {
      return json({ ok: false, error: "公開中の朗読が見つからない。" }, 404);
    }
  }

  const table: PopularityEventTable =
    kind === "series_view" ? "series_view_events" : "recording_play_events";

  // 2. Two-level actor-day cap: total per event table, then per series.
  // session_id already encodes the JST day, so the actor's rows in this table
  // are exactly today's rows. One read returns up to `totalCap` series ids:
  // below the total cap that is every row (exact per-series count); at the
  // total cap the request is refused anyway. Counted in the app
  // (count-then-insert); concurrent requests can overshoot by at most the
  // number in flight, which is acceptable for a ranking backstop.
  // Both tables carry series_id, so recording plays use the same two levels.
  const totalCap = deps.dailyRowCap ?? POPULARITY_DAILY_ROW_CAP;
  const actorSeriesIds = await deps.listActorSeriesIds(
    table,
    canonicalSessionId,
    totalCap
  );
  const capDecision = classifyPopularityActorCaps({
    actorSeriesIds,
    seriesId: requestedSeriesId,
    totalCap,
    seriesCap: deps.dailySeriesRowCap ?? POPULARITY_DAILY_SERIES_ROW_CAP,
  });
  if (!capDecision.accept) {
    return skipped(capDecision.reason, onSkip);
  }

  const row: PopularityInsertRow = {
    series_id: requestedSeriesId,
    episode_id: episodeId,
    episode_number: canonicalEpisodeNumber,
    user_id: userId,
    session_id: canonicalSessionId,
  };
  if (kind === "recording_play") row.recording_id = recordingId;

  const { error } = await deps.insertEvent(table, row);
  if (error) {
    console.error(
      kind === "series_view" ? "[popularity-series-view]" : "[popularity-recording-play]",
      error
    );
    return json(
      {
        ok: false,
        error:
          kind === "series_view"
            ? "view_event_unavailable"
            : "recording_play_event_unavailable",
      },
      500
    );
  }

  return json({ ok: true });
}
