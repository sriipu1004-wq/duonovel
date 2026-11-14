// Issue #137 PR-E: byte proxy core for PRIVATE media (no "server-only" import
// so the pure behavior can be unit tested; credentials are injected by the
// server-only wrapper in privateMediaProxy.ts).
//
// The client never receives a signed URL or any other bearer for the object:
// the server fetches the bytes and streams them back with no shared caching.
import { PRIVATE_AI_NARRATION_BUCKET } from "@/lib/recording/privateAiNarrationStorage";
import { DEFAULT_HUMAN_RECORDING_AUDIO_BUCKET } from "@/lib/recording/humanRecordingStorage";

export const PRIVATE_MEDIA_PROXY_BUCKETS: readonly string[] = [
  PRIVATE_AI_NARRATION_BUCKET,
  DEFAULT_HUMAN_RECORDING_AUDIO_BUCKET,
];

export const PRIVATE_MEDIA_NO_STORE = "private, no-store, max-age=0";
const RANGE_PATTERN = /^bytes=(?:\d+-\d*|-\d+)$/u;
const CONTENT_RANGE_PATTERN = /^bytes \d+-\d+\/\d+$/u;

export function isPrivateMediaProxyBucket(bucket: string): boolean {
  return PRIVATE_MEDIA_PROXY_BUCKETS.includes(bucket);
}

export function isSafePrivateMediaObjectPath(objectPath: string): boolean {
  if (!objectPath || objectPath.length > 512) return false;
  if (objectPath.startsWith("/") || objectPath.endsWith("/")) return false;
  if (objectPath.includes("\\") || /[?#%\s]/u.test(objectPath)) return false;
  return objectPath
    .split("/")
    .every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

export function isValidSingleByteRange(range: string | null): boolean {
  return range === null || RANGE_PATTERN.test(range);
}

export function privateMediaNotFound(status = 404): Response {
  return new Response(null, {
    status,
    headers: { "Cache-Control": PRIVATE_MEDIA_NO_STORE },
  });
}

export type PrivateMediaStreamInput = {
  request: Request;
  bucket: string;
  objectPath: string;
  endpoint: string | undefined;
  serviceKey: string | undefined;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

/**
 * Only call AFTER the viewer's access to this exact recording was verified.
 */
export async function streamPrivateMediaObject(
  input: PrivateMediaStreamInput
): Promise<Response> {
  const { request, bucket, objectPath } = input;
  if (!isPrivateMediaProxyBucket(bucket) || !isSafePrivateMediaObjectPath(objectPath)) {
    return privateMediaNotFound();
  }
  const range = request.headers.get("range");
  if (!isValidSingleByteRange(range)) return privateMediaNotFound(416);

  const endpoint = input.endpoint?.trim().replace(/\/+$/u, "");
  const key = input.serviceKey?.trim();
  if (!endpoint || !key) return privateMediaNotFound(503);

  const encodedPath = objectPath.split("/").map(encodeURIComponent).join("/");
  const url = `${endpoint}/storage/v1/object/authenticated/${encodeURIComponent(bucket)}/${encodedPath}`;
  const fetcher = input.fetchImpl ?? fetch;
  let upstream: Response;
  try {
    upstream = await fetcher(url, {
      method: "GET",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        ...(range ? { Range: range } : {}),
      },
      cache: "no-store",
      // A privileged Storage fetch must never follow an unexpected redirect.
      redirect: "error",
      signal: AbortSignal.timeout(input.timeoutMs ?? 15000),
    });
  } catch {
    return privateMediaNotFound(503);
  }

  if (!upstream.ok || !upstream.body) {
    return privateMediaNotFound(upstream.status === 416 ? 416 : 404);
  }
  // A Range request must not degrade into an unrequested full-object 200,
  // and an unsolicited 206 is not a valid answer to a plain GET.
  const validShape = range
    ? upstream.status === 206 &&
      CONTENT_RANGE_PATTERN.test(upstream.headers.get("content-range") ?? "")
    : upstream.status === 200;
  if (!validShape) {
    await upstream.body.cancel().catch(() => undefined);
    return privateMediaNotFound(502);
  }

  const headers = new Headers({
    "Cache-Control": PRIVATE_MEDIA_NO_STORE,
    "X-Content-Type-Options": "nosniff",
    Vary: "Cookie, Range",
    "Content-Type": upstream.headers.get("content-type") ?? "application/octet-stream",
  });
  for (const name of ["content-range", "content-length", "accept-ranges", "etag", "last-modified"]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(upstream.body, {
    status: upstream.status === 206 ? 206 : 200,
    headers,
  });
}
