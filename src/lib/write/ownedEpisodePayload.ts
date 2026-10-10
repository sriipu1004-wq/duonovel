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
  if (!Number.isSafeInteger(obj.episode_number) || (obj.episode_number as number) <= 0) return false;
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
