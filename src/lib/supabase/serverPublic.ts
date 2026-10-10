import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

const PUBLIC_READ_FETCH_TIMEOUT_MS = 2500;

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
  let didReachLocalDeadline = false;

  const abortFromUpstream = () => controller.abort();
  if (upstreamSignal?.aborted) {
    controller.abort();
  } else {
    upstreamSignal?.addEventListener("abort", abortFromUpstream, { once: true });
  }

  const timer = setTimeout(() => {
    didReachLocalDeadline = true;
    controller.abort();
  }, PUBLIC_READ_FETCH_TIMEOUT_MS);

  try {
    return await globalThis.fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    // Record only local-deadline failures. Upstream cancellation and all
    // other network failures keep their previous propagation semantics.
    if (didReachLocalDeadline && !upstreamSignal?.aborted) {
      console.warn("[public-db-local-timeout]", {
        endpoint: classifyPublicReadEndpoint(input),
        timeoutMs: PUBLIC_READ_FETCH_TIMEOUT_MS,
        elapsedMs: Math.max(0, Date.now() - startedAt),
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