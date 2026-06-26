"use client";

import { useEffect, useRef } from "react";
import { LEGACY_AUTO_NARRATION_SUSPENDED } from "@/lib/recording/legacyAutoNarration";

type RunPendingResponse = {
  ok?: boolean;
  status?: "generated" | "none_missing" | "model_missing" | "skipped" | "busy";
  generatedCount?: number;
  steps?: Array<{
    status?: string;
    generatedEpisodeId?: string;
    generatedSeriesId?: string;
    generatedVoiceModelId?: string;
    narratorName?: string;
    reason?: string;
  }>;
  error?: string;
  detail?: string;
};

type AivisAutogenRunnerProps = {
  enabled: boolean;
};

const MAX_PENDING_STEPS_PER_CALL = 1;
const GENERATED_WAIT_MS = 1500;
const BUSY_WAIT_MS = 10000;
const IDLE_WAIT_MS = 30000;

export default function AivisAutogenRunner({
  enabled,
}: AivisAutogenRunnerProps) {
  const isRunningRef = useRef(false);

  useEffect(() => {
    if (LEGACY_AUTO_NARRATION_SUSPENDED || !enabled) {
      if (process.env.NODE_ENV === "development") {
        console.log("[aivis-autogen-runner] disabled");
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

    async function runPendingOnce() {
      const response = await fetch("/api/recordings/aivis-autogen-run-pending", {
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
        console.log("[aivis-autogen-runner pending]", {
          responseOk: response.ok,
          status: payload.status,
          generatedCount: payload.generatedCount,
          steps: payload.steps,
          error: payload.error,
          detail: payload.detail,
        });
      }

      if (!response.ok) {
        throw new Error(payload.detail || payload.error || "aivis_run_pending_failed");
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
          pendingResult.status === "model_missing"
        ) {
          scheduleNext(IDLE_WAIT_MS);
          return;
        }

        scheduleNext(IDLE_WAIT_MS);
      } catch (error) {
        if (process.env.NODE_ENV === "development") {
          console.error("[aivis-autogen-runner cycle failed]", error);
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
