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
/** Time allowed for the upstream RESPONSE HEADERS only, not the body. */
export const PRIVATE_MEDIA_HEADER_TIMEOUT_MS = 15000;
const RANGE_PATTERN = /^bytes=(?:\d+-\d*|-\d+)$/u;
const CONTENT_RANGE_PATTERN = /^bytes \d+-\d+\/\d+$/u;
const UNSATISFIED_CONTENT_RANGE_PATTERN = /^bytes \*\/\d+$/u;
const AUDIO_MEDIA_TYPE_PATTERN = /^audio\/[a-z0-9][a-z0-9.+-]*$/u;

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

/** A single `bytes=` range we forward upstream. Anything else is ignored. */
export function isValidSingleByteRange(range: string | null): boolean {
  return range === null || RANGE_PATTERN.test(range);
}

/**
 * RFC 9110 §14.2: a server MAY ignore the Range header. A malformed or
 * multi-range header is ignored (full 200), never answered with 416.
 */
export function forwardableRange(range: string | null): string | null {
  return range !== null && RANGE_PATTERN.test(range) ? range : null;
}

/** Only audio/* and application/json (timing) are served with their type. */
export function safePrivateMediaContentType(value: string | null): string {
  const essence = (value ?? "").split(";")[0].trim().toLowerCase();
  if (essence === "application/json" || AUDIO_MEDIA_TYPE_PATTERN.test(essence)) {
    return essence;
  }
  return "application/octet-stream";
}

export function privateMediaNotFound(status = 404, extraHeaders?: HeadersInit): Response {
  const headers = new Headers(extraHeaders);
  headers.set("Cache-Control", PRIVATE_MEDIA_NO_STORE);
  return new Response(null, { status, headers });
}

export type PrivateMediaStreamInput = {
  request: Request;
  bucket: string;
  objectPath: string;
  endpoint: string | undefined;
  serviceKey: string | undefined;
  fetchImpl?: typeof fetch;
  /** Header timeout; the body may stream for as long as the client listens. */
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
  const range = forwardableRange(request.headers.get("range"));

  const endpoint = input.endpoint?.trim().replace(/\/+$/u, "");
  const key = input.serviceKey?.trim();
  if (!endpoint || !key) return privateMediaNotFound(503);

  const encodedPath = objectPath.split("/").map(encodeURIComponent).join("/");
  const url = `${endpoint}/storage/v1/object/authenticated/${encodeURIComponent(bucket)}/${encodedPath}`;
  const fetcher = input.fetchImpl ?? fetch;

  // The timeout covers the response headers only. Once headers arrive the
  // timer is cleared so long playback is not cut off. A client disconnect
  // aborts the upstream request (and its body) at any time.
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new Error("private_media_upstream_header_timeout")),
    input.timeoutMs ?? PRIVATE_MEDIA_HEADER_TIMEOUT_MS
  );
  const clientSignal = request.signal;
  const onClientAbort = () => controller.abort(clientSignal.reason);
  if (clientSignal.aborted) onClientAbort();
  else clientSignal.addEventListener("abort", onClientAbort, { once: true });
  const detachClient = () => clientSignal.removeEventListener("abort", onClientAbort);

  let upstream: Response;
  try {
    upstream = await fetcher(url, {
      method: "GET",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        // Byte ranges and content-length must refer to the stored bytes, not
        // to a compressed transfer that fetch would transparently decode.
        "Accept-Encoding": "identity",
        ...(range ? { Range: range } : {}),
      },
      cache: "no-store",
      // A privileged Storage fetch must never follow an unexpected redirect.
      redirect: "error",
      signal: controller.signal,
    });
  } catch {
    detachClient();
    return privateMediaNotFound(503);
  } finally {
    clearTimeout(timer);
  }

  if (!upstream.ok || !upstream.body) {
    detachClient();
    await upstream.body?.cancel().catch(() => undefined);
    if (upstream.status === 416) {
      const unsatisfied = upstream.headers.get("content-range") ?? "";
      return privateMediaNotFound(
        416,
        UNSATISFIED_CONTENT_RANGE_PATTERN.test(unsatisfied)
          ? { "Content-Range": unsatisfied }
          : undefined
      );
    }
    return privateMediaNotFound(404);
  }
  // A forwarded Range must not degrade into an unrequested full-object 200,
  // and an unsolicited 206 is not a valid answer to a plain GET.
  const validShape = range
    ? upstream.status === 206 &&
      CONTENT_RANGE_PATTERN.test(upstream.headers.get("content-range") ?? "")
    : upstream.status === 200;
  if (!validShape) {
    detachClient();
    await upstream.body.cancel().catch(() => undefined);
    return privateMediaNotFound(502);
  }

  const headers = new Headers({
    "Cache-Control": PRIVATE_MEDIA_NO_STORE,
    "X-Content-Type-Options": "nosniff",
    Vary: "Cookie, Range",
    "Content-Type": safePrivateMediaContentType(upstream.headers.get("content-type")),
  });
  // fetch decodes a content-encoded body, so its content-length would not
  // match the bytes we send; drop it (and the encoding) in that case.
  const encoded = Boolean(upstream.headers.get("content-encoding")?.trim());
  for (const name of ["content-range", "content-length", "accept-ranges", "etag", "last-modified"]) {
    if (encoded && name === "content-length") continue;
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }

  // Keep the client-abort link for the body's lifetime, then detach.
  const reader = upstream.body.getReader();
  const body = new ReadableStream<Uint8Array>({
    async pull(streamController) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          detachClient();
          streamController.close();
          return;
        }
        streamController.enqueue(value);
      } catch (error) {
        detachClient();
        streamController.error(error);
      }
    },
    async cancel(reason) {
      detachClient();
      controller.abort(reason);
      await reader.cancel(reason).catch(() => undefined);
    },
  });

  return new Response(body, {
    status: upstream.status === 206 ? 206 : 200,
    headers,
  });
}
