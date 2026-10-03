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

function isTransientReadFailure(error: unknown): boolean {
  if (error instanceof ReadOnlyTimeoutError) return true;
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return [
    "522",
    "timeout",
    "timed out",
    "fetch failed",
    "connection terminated",
    "connection reset",
    "econnreset",
    "503",
  ].some((needle) => message.includes(needle));
}

async function withTimeout<T>(
  operation: string,
  timeoutMs: number,
  read: () => Promise<T>
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      read(),
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new ReadOnlyTimeoutError(operation, timeoutMs)),
          timeoutMs
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function runReadOnlyWithRetry<T>(
  read: () => Promise<T>,
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
