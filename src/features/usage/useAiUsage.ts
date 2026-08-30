"use client";

import { useCallback, useEffect, useState } from "react";
import type { AiUsageSnapshot } from "@/lib/aiUsage/aiUsage";

type AiUsageResponse = Partial<AiUsageSnapshot> & {
  ok?: boolean;
};

export function useAiUsage() {
  const [snapshot, setSnapshot] = useState<AiUsageSnapshot | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/ai-usage", { cache: "no-store" });
      const payload = (await response.json()) as AiUsageResponse;
      if (
        response.ok &&
        payload.ok &&
        payload.actions &&
        (payload.plan === "free" || payload.plan === "subscriber") &&
        typeof payload.resetAt === "string"
      ) {
        setSnapshot({
          actions: payload.actions,
          plan: payload.plan,
          isSubscriber: payload.plan === "subscriber",
          resetAt: payload.resetAt,
        });
      }
    } catch {
      // Buttons remain usable; the server still enforces the quota.
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  return { snapshot, refresh };
}
