"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

type NemoAutoGenerationBootstrapProps = {
  seriesId: string;
  episodeIds: string[];
  enabled: boolean;
};

export function NemoAutoGenerationBootstrap({
  seriesId,
  episodeIds,
  enabled,
}: NemoAutoGenerationBootstrapProps) {
  const router = useRouter();

  useEffect(() => {
    if (!enabled || episodeIds.length === 0) {
      return;
    }

    let cancelled = false;
    let attempts = 0;

    async function runStep() {
      if (cancelled) return;
      if (attempts >= 8) return;

      attempts += 1;

      try {
        const response = await fetch("/api/recordings/nemo-autogen", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            seriesId,
            episodeIds,
          }),
        });

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as {
          status?: string;
        };

        if (cancelled) return;

        if (payload.status === "generated") {
          window.setTimeout(() => {
            if (!cancelled) {
              router.refresh();
            }
          }, 1200);

          window.setTimeout(runStep, 1800);
          return;
        }

        if (payload.status === "busy") {
          window.setTimeout(runStep, 2000);
          return;
        }

        if (payload.status === "none_missing") {
          router.refresh();
        }
      } catch {
        // no-op
      }
    }

    void runStep();

    return () => {
      cancelled = true;
    };
  }, [enabled, seriesId, episodeIds, router]);

  return null;
}