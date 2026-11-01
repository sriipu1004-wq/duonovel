// Issue #137: DEVELOPMENT-ONLY studio probe; NOT a Human publisher.
// No Storage bearer tokens, no full-file arrayBuffer, no hosted destinations.
const PART_BYTES = 8 * 1024 * 1024;
const MAX_BYTES = 1024 * 1024 * 1024;
const MIN_BYTES = 4 * 1024 * 1024;
const ENDPOINT = "/api/recordings/human-local-multipart";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const SHA = /^[0-9a-f]{64}$/u;
const allowed = new Set(["ISSUED", "CLAIMED", "SEALED"]);

export type LocalHumanStageLease = {
  sessionId: string;
  fileFingerprint: string;
  seriesId: string;
  episodeId: string;
  totalBytes: number;
};
export type LocalHumanStageProgress = {
  completedParts: number;
  totalParts: number;
  bytesCompleted: number;
  totalBytes: number;
};
type Reply = Record<string, unknown>;
type LocalFetch = typeof fetch;
type Status = "ISSUED" | "CLAIMED" | "SEALED";

function requireLocalRuntime() {
  if (process.env.NODE_ENV !== "development" ||
      typeof window === "undefined" ||
      !["localhost", "127.0.0.1"].includes(window.location.hostname)) {
    throw new Error("LOCAL_ONLY_HOLD");
  }
  if (!globalThis.crypto?.subtle) throw new Error("LOCAL_CRYPTO_UNAVAILABLE_HOLD");
}
function fingerprint(file: File) {
  return [file.name, file.size, file.lastModified].join(":");
}
async function jsonRequest(
  input: Reply,
  fetcher: LocalFetch,
): Promise<Reply> {
  const response = await fetcher(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    cache: "no-store",
    body: JSON.stringify(input),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("LOCAL_API_INVALID_RESPONSE_HOLD");
  }
  const data = body as Reply;
  if (!response.ok || data.ok !== true) {
    throw new Error(`LOCAL_API_${response.status}_HOLD`);
  }
  return data;
}
async function digestPart(part: Blob) {
  // One 8MiB logical part maximum; never file.arrayBuffer() for 1GiB.
  const bytes = await part.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
function stageState(data: Reply): Status {
  if (typeof data.state !== "string" || !allowed.has(data.state)) {
    throw new Error("LOCAL_STAGE_INVALID_STATE_HOLD");
  }
  return data.state as Status;
}
async function status(partId: string, fetcher: LocalFetch) {
  const reply = await jsonRequest({ action: "status", partId }, fetcher);
  return stageState(reply);
}

export async function stageHumanMultipartLocally(args: {
  file: File;
  seriesId: string;
  episodeId: string;
  previousLease?: LocalHumanStageLease | null;
  onLease?: (lease: LocalHumanStageLease) => void;
  onProgress?: (progress: LocalHumanStageProgress) => void;
  fetcher?: LocalFetch;
}): Promise<LocalHumanStageLease> {
  requireLocalRuntime();
  const { file, seriesId, episodeId } = args;
  if (!UUID.test(seriesId) || !UUID.test(episodeId) ||
      !Number.isSafeInteger(file.size) || file.size <= MIN_BYTES ||
      file.size > MAX_BYTES) throw new Error("LOCAL_SIZE_OR_SCOPE_HOLD");
  const identity = fingerprint(file);
  const count = Math.ceil(file.size / PART_BYTES);
  const fetcher = args.fetcher ?? fetch;
  let lease = args.previousLease ?? null;
  if (lease && (
    lease.fileFingerprint !== identity ||
    lease.seriesId !== seriesId ||
    lease.episodeId !== episodeId ||
    lease.totalBytes !== file.size ||
    !UUID.test(lease.sessionId)
  )) throw new Error("LOCAL_FILE_OR_WORK_CHANGED_HOLD");
  if (!lease) {
    const opened = await jsonRequest({
      action: "open", seriesId, episodeId, totalBytes: file.size,
    }, fetcher);
    if (!UUID.test(String(opened.sessionId ?? "")) ||
        opened.partCount !== count || opened.partSizeBytes !== PART_BYTES) {
      throw new Error("LOCAL_SESSION_MISMATCH_HOLD");
    }
    lease = { sessionId: String(opened.sessionId),
      fileFingerprint: identity, seriesId, episodeId, totalBytes: file.size };
    args.onLease?.(lease);
  }
  let completed = 0;
  let bytesCompleted = 0;
  for (let index = 0; index < count; index += 1) {
    const start = index * PART_BYTES;
    const end = Math.min(file.size, start + PART_BYTES);
    const part = file.slice(start, end);
    const expectedSha256 = await digestPart(part);
    if (!SHA.test(expectedSha256)) throw new Error("LOCAL_DIGEST_INVALID_HOLD");
    const issued = await jsonRequest({
      action: "part", sessionId: lease.sessionId, index, expectedSha256,
    }, fetcher);
    const partId = String(issued.partId ?? "");
    if (!UUID.test(partId) || issued.byteCount !== end - start) {
      throw new Error("LOCAL_PART_LEASE_MISMATCH_HOLD");
    }
    let current = stageState(issued);
    if (current === "CLAIMED" || current === "SEALED") {
      // A crashed worker may have persisted the part. No duplicate PUT.
      current = await status(partId, fetcher);
      if (current !== "SEALED") throw new Error("LOCAL_CLAIMED_HOLD");
    } else {
      let response: Response | undefined;
      try {
        response = await fetcher(ENDPOINT, {
          method: "PUT",
          headers: { "content-type": "application/octet-stream", "x-part-id": partId },
          credentials: "same-origin", cache: "no-store", body: part,
        });
      } catch {
        // Lost ACK: only a server-side receipt/readback may resolve success.
      }
      if (!response?.ok) {
        const reconciled = await status(partId, fetcher);
        if (reconciled !== "SEALED") throw new Error("LOCAL_PART_WRITE_HOLD");
      } else {
        const replied: unknown = await response.json().catch(() => null);
        if (!replied || typeof replied !== "object" ||
            (replied as Reply).ok !== true) {
          throw new Error("LOCAL_PART_RESPONSE_HOLD");
        }
        if (await status(partId, fetcher) !== "SEALED") {
          throw new Error("LOCAL_PART_UNSEALED_HOLD");
        }
      }
    }
    completed += 1;
    bytesCompleted += end - start;
    args.onProgress?.({ completedParts: completed, totalParts: count,
      bytesCompleted, totalBytes: file.size });
  }
  const done = await jsonRequest({ action: "finish", sessionId: lease.sessionId }, fetcher);
  if (done.reason !== "PRIVATE_PARTS_SEALED_NOT_PUBLISHED" ||
      done.partCount !== count) {
    throw new Error("LOCAL_NOT_SEALED_HOLD");
  }
  return lease;
}
