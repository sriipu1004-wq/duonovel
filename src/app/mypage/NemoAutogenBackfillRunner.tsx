"use client";

import { useEffect, useRef } from "react";

type BackfillResponse = {
  ok?: boolean;
  status?: "seeded" | "config_missing";
  scannedEpisodeCount?: number;
  seededPendingCount?: number;
  seededCompletedCount?: number;
  skippedCount?: number;
  error?: string;
  detail?: string;
};

type RunPendingResponse = {
  ok?: boolean;
  status?:
    | "generated"
    | "none_missing"
    | "busy"
    | "config_missing"
    | "skipped";
  generatedCount?: number;
  steps?: Array<{
    status?: string;
    generatedEpisodeId?: string;
    reason?: string;
  }>;
  error?: string;
  detail?: string;
};

type NemoAutogenBackfillRunnerProps = {
  enabled: boolean;
};

const INITIAL_BACKFILL_LIMIT = 1000;
const MAX_PENDING_STEPS_PER_CALL = 1;
const GENERATED_WAIT_MS = 1500;
const BUSY_WAIT_MS = 10000;
const IDLE_WAIT_MS = 30000;
const BACKFILL_RESEED_INTERVAL_MS = 5 * 60 * 1000;

export default function NemoAutogenBackfillRunner({
  enabled,
}: NemoAutogenBackfillRunnerProps) {
  const isRunningRef = useRef(false);
  const lastSeededAtRef = useRef<number>(0);

  useEffect(() => {
    if (!enabled) {
      if (process.env.NODE_ENV === "development") {
        console.log("[nemo-autogen-runner] disabled");
      }
      return;
    }

    let cancelled = false;
    let timerId: number | null = null;

    function scheduleNext(delayMs: number) {
      if (cancelled) {
        return;
      }

      timerId = window.setTimeout(() => {
        void runCycle();
      }, delayMs);
    }

    async function runBackfillSeedIfNeeded() {
      const now = Date.now();
      const shouldSeed =
        lastSeededAtRef.current === 0 ||
        now - lastSeededAtRef.current >= BACKFILL_RESEED_INTERVAL_MS;

      if (!shouldSeed) {
        return;
      }

      const response = await fetch("/api/recordings/nemo-autogen-backfill", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          limitEpisodes: INITIAL_BACKFILL_LIMIT,
        }),
      });

      const payload = (await response.json()) as BackfillResponse;

      if (process.env.NODE_ENV === "development") {
        console.log("[nemo-autogen-runner seed]", {
          responseOk: response.ok,
          status: payload.status,
          scannedEpisodeCount: payload.scannedEpisodeCount,
          seededPendingCount: payload.seededPendingCount,
          seededCompletedCount: payload.seededCompletedCount,
          skippedCount: payload.skippedCount,
          error: payload.error,
          detail: payload.detail,
        });
      }

      if (!response.ok) {
        throw new Error(payload.detail || payload.error || "backfill_seed_failed");
      }

      lastSeededAtRef.current = now;
    }

    async function runPendingOnce() {
      const response = await fetch("/api/recordings/nemo-autogen-run-pending", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          maxSteps: MAX_PENDING_STEPS_PER_CALL,
        }),
      });

      const payload = (await response.json()) as RunPendingResponse;

      if (process.env.NODE_ENV === "development") {
        console.log("[nemo-autogen-runner pending]", {
          responseOk: response.ok,
          status: payload.status,
          generatedCount: payload.generatedCount,
          steps: payload.steps,
          error: payload.error,
          detail: payload.detail,
        });
      }

      if (!response.ok) {
        throw new Error(payload.detail || payload.error || "run_pending_failed");
      }

      return payload;
    }

    async function runCycle() {
      if (cancelled) {
        return;
      }

      if (isRunningRef.current) {
        scheduleNext(BUSY_WAIT_MS);
        return;
      }

      isRunningRef.current = true;

      try {
        await runBackfillSeedIfNeeded();

        const pendingResult = await runPendingOnce();

        if (cancelled) {
          return;
        }

        if (pendingResult.status === "generated") {
          scheduleNext(GENERATED_WAIT_MS);
          return;
        }

        if (pendingResult.status === "busy") {
          scheduleNext(BUSY_WAIT_MS);
          return;
        }

        if (
          pendingResult.status === "none_missing" ||
          pendingResult.status === "skipped" ||
          pendingResult.status === "config_missing"
        ) {
          scheduleNext(IDLE_WAIT_MS);
          return;
        }

        scheduleNext(IDLE_WAIT_MS);
      } catch (error) {
        if (process.env.NODE_ENV === "development") {
          console.error("[nemo-autogen-runner cycle failed]", error);
        }

        scheduleNext(BUSY_WAIT_MS);
      } finally {
        isRunningRef.current = false;
      }
    }

    void runCycle();

    return () => {
      cancelled = true;

      if (timerId !== null) {
        window.clearTimeout(timerId);
      }
    };
  }, [enabled]);

  return null;
}