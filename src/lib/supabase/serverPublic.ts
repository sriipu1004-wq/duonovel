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
    const response = await globalThis.fetch(input, {
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