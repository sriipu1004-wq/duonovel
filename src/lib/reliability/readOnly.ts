export type ReadOnlyRetryOptions = {
  operation: string;
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
};

export class ReadOnlyTimeoutError extends Error {
  constructor(operation: string, timeoutMs: number) {
    super(operation + " timed out after " + timeoutMs + "ms");
    this.name = "ReadOnlyTimeoutError";
  }
}

export function isTransientReadUnavailable(error: unknown): boolean {
  if (error instanceof ReadOnlyTimeoutError) return true;

  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  return [
    "522",
    "503",
    "timeout",
    "timed out",
    "fetch failed",
    "failed to fetch",
    "network error",
    "network request failed",
    "connection terminated",
    "connection reset",
    "econnreset",
  ].some((needle) => message.includes(needle));
}

function isTransientReadFailure(error: unknown): boolean {
  // A local deadline is final for retry purposes. It is still a valid trigger
  // for a separately isolated browser-direct fallback path.
  if (error instanceof ReadOnlyTimeoutError) return false;
  return isTransientReadUnavailable(error);
}

export function isSchemaCompatibilityReadFailure(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as Record<string, unknown>;
  const code = typeof record.code === "string" ? record.code.toUpperCase() : "";
  const message =
    typeof record.message === "string" ? record.message.toLowerCase() : "";

  if (code === "42703" || code === "PGRST204") return true;

  return (
    (message.includes("column") && message.includes("does not exist")) ||
    (message.includes("could not find") && message.includes("column"))
  );
}

async function withTimeout<T>(
  operation: string,
  timeoutMs: number,
  read: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      read(controller.signal),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new ReadOnlyTimeoutError(operation, timeoutMs));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function runReadOnlyWithRetry<T>(
  read: (signal: AbortSignal) => Promise<T>,
  options: ReadOnlyRetryOptions
): Promise<T> {
  const timeoutMs = Math.max(250, options.timeoutMs ?? 3000);
  const retries = Math.max(0, Math.min(2, options.retries ?? 0));
  const retryDelayMs = Math.max(0, options.retryDelayMs ?? 100);

  for (let attempt = 0; ; attempt += 1) {
    try {
      return await withTimeout(options.operation, timeoutMs, read);
    } catch (error) {
      if (attempt >= retries || !isTransientReadFailure(error)) {
        throw error;
      }
      if (retryDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      }
    }
  }
}
