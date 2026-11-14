import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

const PUBLIC_READ_FETCH_TIMEOUT_MS = 2500;
// Production evidence (Issue #137, 2026-11-07): background cache revalidation
// continues after the response is sent, the function instance is suspended,
// and on thaw the overdue deadline timer fires 10-186 s late with only tens of
// ms of CPU used. Aborting at that moment kills a request that never had a
// fair chance to run. When the deadline callback itself is this late, treat it
// as suspension evidence and allow one bounded grace window before aborting.
// An on-time deadline (slow database) still aborts at 2500 ms (D023).
const PUBLIC_READ_SUSPENSION_EVIDENCE_MS = 1000;
const PUBLIC_READ_SUSPENSION_GRACE_MS = 2500;
// Production evidence (Issue #137, 2026-11-08): the grace timer itself can be
// frozen again by a second suspension and then fire 50-130 s late, which the
// single-grace version treated as a real timeout. Each timer's lateness is now
// judged against its own schedule, and a late grace timer may re-arm, at most
// this many times in total, so live waiting stays bounded (2500 ms + 3 x 2500 ms).
const PUBLIC_READ_SUSPENSION_MAX_GRACES = 3;

/**
 * Only expose a fixed endpoint category to server logs. Never include URLs,
 * Supabase keys, query strings, row IDs, or request/response bodies.
 */
const PUBLIC_READ_ENDPOINTS = new Set([
  "series",
  "episodes",
  "users",
  "recordings",
  "public_episode_work_summaries",
  "series_popularity_daily",
  "episode_human_translations",
  "episode_translations",
]);

export function classifyPublicReadEndpoint(input: Parameters<typeof fetch>[0]): string {
  try {
    const rawUrl = typeof input === "string" || input instanceof URL ? String(input) : input.url;
    const pathname = new URL(rawUrl).pathname;
    const match = /^\/rest\/v1\/([a-z_]+)$/.exec(pathname);
    const candidate = match?.[1] ?? "";
    return PUBLIC_READ_ENDPOINTS.has(candidate) ? candidate : "other";
  } catch {
    return "other";
  }
}

// Production evidence (Issue #137, 2026-11-14): background cache revalidation
// fails with `TypeError: fetch failed` about 190 times a day, several fetches of
// one request failing within milliseconds of each other. The working hypothesis
// is pooled keep-alive sockets that the server closed while the instance was
// suspended. Reads are idempotent, so one retry (which opens a new socket) is
// safe; the cause code is logged so the hypothesis can be confirmed.
const NETWORK_FAILURE_CAUSE_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ECONNABORTED",
  "EPIPE",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "UND_ERR_SOCKET",
  "UND_ERR_CLOSED",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
]);

/** Only an allowlisted error code is logged, never a message or address. */
export function classifyNetworkFailureCause(error: unknown): string {
  const cause = (error as { cause?: unknown } | null)?.cause;
  const code = (cause as { code?: unknown } | null)?.code;
  return typeof code === "string" && NETWORK_FAILURE_CAUSE_CODES.has(code) ? code : "other";
}

function requestMethod(input: Parameters<typeof fetch>[0], init?: RequestInit): string {
  const method = init?.method ?? (input instanceof Request ? input.method : "GET");
  return method.toUpperCase();
}

function isRetryableNetworkFailure(
  error: unknown,
  input: Parameters<typeof fetch>[0],
  init?: RequestInit
): boolean {
  if (!(error instanceof TypeError) || error.message !== "fetch failed") return false;
  if (init?.signal?.aborted) return false;
  const method = requestMethod(input, init);
  return method === "GET" || method === "HEAD";
}

/**
 * Retry an idempotent read once when the network layer fails before any
 * response. Writes, aborted requests and HTTP error responses are never
 * retried. Logs carry the client label, an allowlisted endpoint and cause code.
 */
export async function fetchWithReadRetry(
  client: "public" | "admin",
  input: Parameters<typeof fetch>[0],
  init?: RequestInit
): Promise<Response> {
  try {
    return await globalThis.fetch(input, init);
  } catch (error) {
    if (!isRetryableNetworkFailure(error, input, init)) throw error;
    const endpoint = classifyPublicReadEndpoint(input);
    console.warn("[supabase-read-network-retry]", {
      client,
      endpoint,
      causeCode: classifyNetworkFailureCause(error),
    });
    try {
      return await globalThis.fetch(input, init);
    } catch (retryError) {
      if (retryError instanceof TypeError && retryError.message === "fetch failed") {
        console.warn("[supabase-read-network-retry-failed]", {
          client,
          endpoint,
          causeCode: classifyNetworkFailureCause(retryError),
        });
      }
      throw retryError;
    }
  }
}

/** Global fetch for the service-role client: same single read retry, no deadline. */
export const adminReadRetryFetch: typeof fetch = (input, init) =>
  fetchWithReadRetry("admin", input, init);

export const publicReadFetch: typeof fetch = async (input, init) => {
  const controller = new AbortController();
  const upstreamSignal = init?.signal;
  const startedAt = Date.now();
  const monotonicStartedAtMs = performance.now();
  // CPU usage is process-wide; shared Fluid instances can serve other requests.
  const cpuStartedAt = process.cpuUsage();
  let didReachLocalDeadline = false;
  let timerFiredAtMs: number | null = null;
  let timerFiredMonotonicAtMs: number | null = null;
  let deadlineTimerCpuUserMs = 0;
  let deadlineTimerCpuSystemMs = 0;
  let suspensionGraceCount = 0;
  let suspensionDetectedDelayMs = 0;
  let timerScheduledAtMs = monotonicStartedAtMs;
  let timerDelayMs = PUBLIC_READ_FETCH_TIMEOUT_MS;

  const abortFromUpstream = () => controller.abort();
  if (upstreamSignal?.aborted) {
    controller.abort();
  } else {
    upstreamSignal?.addEventListener("abort", abortFromUpstream, { once: true });
  }

  const onDeadline = () => {
    const nowMonotonic = performance.now();
    // Lateness of the timer that just fired, measured against its own schedule.
    const deadlineLateByMs = nowMonotonic - timerScheduledAtMs - timerDelayMs;
    if (
      suspensionGraceCount < PUBLIC_READ_SUSPENSION_MAX_GRACES &&
      deadlineLateByMs >= PUBLIC_READ_SUSPENSION_EVIDENCE_MS
    ) {
      // The process did not run on schedule (suspended or blocked); the
      // request has not really been waiting this timer's live time.
      suspensionGraceCount += 1;
      suspensionDetectedDelayMs = Math.max(
        suspensionDetectedDelayMs,
        Math.round(deadlineLateByMs)
      );
      timerScheduledAtMs = nowMonotonic;
      timerDelayMs = PUBLIC_READ_SUSPENSION_GRACE_MS;
      timer = setTimeout(onDeadline, PUBLIC_READ_SUSPENSION_GRACE_MS);
      return;
    }
    timerFiredAtMs = Date.now();
    timerFiredMonotonicAtMs = nowMonotonic;
    const cpuAtDeadline = process.cpuUsage(cpuStartedAt);
    deadlineTimerCpuUserMs = Math.max(0, Math.round(cpuAtDeadline.user / 1000));
    deadlineTimerCpuSystemMs = Math.max(0, Math.round(cpuAtDeadline.system / 1000));
    didReachLocalDeadline = true;
    controller.abort();
  };
  let timer = setTimeout(onDeadline, PUBLIC_READ_FETCH_TIMEOUT_MS);

  try {
    const response = await fetchWithReadRetry("public", input, {
      ...init,
      signal: controller.signal,
    });
    if (suspensionGraceCount > 0) {
      // Bounded numeric timings and an allowlisted endpoint only.
      console.info("[public-db-suspension-grace-recovered]", {
        endpoint: classifyPublicReadEndpoint(input),
        suspensionDetectedDelayMs,
        suspensionGraceCount,
        elapsedMonotonicMs: Math.max(0, Math.round(performance.now() - monotonicStartedAtMs)),
      });
    }
    return response;
  } catch (error) {
    // Record only local-deadline failures. Upstream cancellation and all
    // other network failures keep their previous propagation semantics.
    if (didReachLocalDeadline && !upstreamSignal?.aborted) {
      const elapsedMs = Math.max(0, Date.now() - startedAt);
      const timerElapsedMs = Math.max(
        0,
        (timerFiredAtMs ?? startedAt) - startedAt
      );
      // Distinguish delayed deadline callback from delayed promise
      // settlement after abort. Neither value implies a network cause.
      // Only bounded numeric timings and an allowlisted endpoint are logged.
      console.warn("[public-db-local-timeout]", {
        endpoint: classifyPublicReadEndpoint(input),
        timeoutMs: PUBLIC_READ_FETCH_TIMEOUT_MS,
        elapsedMs,
        deadlineTimerDelayMs: Math.max(
          0,
          timerElapsedMs - PUBLIC_READ_FETCH_TIMEOUT_MS
        ),
        abortSettlementDelayMs: Math.max(0, elapsedMs - timerElapsedMs),
        // Monotonic measurement helps detect wall-clock steps in Date.now().
        elapsedMonotonicMs: Math.max(0, Math.round(performance.now() - monotonicStartedAtMs)),
        deadlineTimerDelayMonotonicMs: Math.max(
          0,
          Math.round((timerFiredMonotonicAtMs ?? monotonicStartedAtMs) - monotonicStartedAtMs - PUBLIC_READ_FETCH_TIMEOUT_MS)
        ),
        // Process-wide CPU time during the pending timer; not per-request attribution.
        deadlineTimerCpuUserMs,
        deadlineTimerCpuSystemMs,
        suspensionGraceGranted: suspensionGraceCount > 0,
        suspensionGraceCount,
        suspensionDetectedDelayMs,
      });
    }
    throw error;
  } finally {
    clearTimeout(timer);
    upstreamSignal?.removeEventListener("abort", abortFromUpstream);
  }
};

export function createPublicServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Supabase public server env is missing");
  }

  if (client) {
    return client;
  }

  client = createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: publicReadFetch,
    },
  });

  return client;
}