import { isValidSeriesId } from "@/lib/write/ownedSeriesPayload";

export type OwnedEpisodeSavePayload = {
  series_id: string;
  episode_number: number;
  title: string;
  body: string;
  is_published: boolean;
  posting_status: "draft" | "scheduled" | "posted";
  scheduled_for: string | null;
  posted_at: string | null;
  last_edited_at: string | null;
};

const EPISODE_KEYS = new Set([
  "series_id", "episode_number", "title", "body", "is_published",
  "posting_status", "scheduled_for", "posted_at", "last_edited_at",
]);

function isTimestamp(value: unknown): value is string | null {
  return value === null ||
    (typeof value === "string" && Number.isFinite(Date.parse(value)));
}

export function isOwnedEpisodeSavePayload(
  value: unknown
): value is OwnedEpisodeSavePayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj);
  if (keys.length !== EPISODE_KEYS.size || keys.some(key => !EPISODE_KEYS.has(key))) return false;
  if (typeof obj.series_id !== "string" || !isValidSeriesId(obj.series_id)) return false;
  if (typeof obj.episode_number !== "number" || !Number.isSafeInteger(obj.episode_number) || obj.episode_number <= 0) return false;
  if (typeof obj.title !== "string" || !obj.title.trim()) return false;
  if (typeof obj.body !== "string") return false;
  if (obj.posting_status !== "draft" && obj.posting_status !== "scheduled" && obj.posting_status !== "posted") return false;
  if (obj.is_published !== (obj.posting_status === "posted")) return false;
  if (!isTimestamp(obj.scheduled_for) || !isTimestamp(obj.posted_at) || !isTimestamp(obj.last_edited_at)) return false;
  if (obj.posting_status === "scheduled" && obj.scheduled_for === null) return false;
  if (obj.posting_status !== "scheduled" && obj.scheduled_for !== null) return false;
  if (obj.posting_status === "posted" && obj.posted_at === null) return false;
  try {
    // Bound Server Action serialized input; larger future episodes require
    // an explicit upload strategy rather than silently bypassing this limit.
    if (JSON.stringify(obj).length > 900_000) return false;
  } catch {
    return false;
  }
  return true;
}

/** Preserve the existing editor's preceding-episode publication sequence rule
 * when the Server Action is invoked directly. This check is not a DB transaction:
 * concurrent changes and separate scheduler/direct-write paths need their own guard.
 */
export function validateEpisodePreviousTransition(
  next: Pick<OwnedEpisodeSavePayload, "posting_status" | "scheduled_for">,
  previous: { posting_status: string; scheduled_for: string | null } | null
): boolean {
  if (next.posting_status === "draft" || !previous) return true;
  if (previous.posting_status === "draft") return false;
  if (next.posting_status === "scheduled" && previous.posting_status === "scheduled") {
    const nextTimestamp = Date.parse(next.scheduled_for ?? "");
    const previousTimestamp = Date.parse(previous.scheduled_for ?? "");
    return Number.isFinite(nextTimestamp) &&
      Number.isFinite(previousTimestamp) &&
      nextTimestamp >= previousTimestamp;
  }
  return true;
}
