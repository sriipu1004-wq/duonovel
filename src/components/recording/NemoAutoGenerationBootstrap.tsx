"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LEGACY_AUTO_NARRATION_SUSPENDED } from "@/lib/recording/legacyAutoNarration";

type NemoAutoGenerationBootstrapProps = {
  seriesId: string;
  episodeIds: string[];
  enabled: boolean;
};

type NemoAutogenResponse = {
  ok?: boolean;
  status?:
    | "generated"
    | "none_missing"
    | "busy"
    | "config_missing"
    | "skipped";
  generatedEpisodeId?: string;
  reason?: string;
  error?: string;
  detail?: string;
};

export function NemoAutoGenerationBootstrap({
  seriesId,
  episodeIds,
  enabled,
}: NemoAutoGenerationBootstrapProps) {
  const router = useRouter();

  useEffect(() => {
    if (
      LEGACY_AUTO_NARRATION_SUSPENDED ||
      !enabled ||
      episodeIds.length === 0
    ) {
      if (process.env.NODE_ENV === "development") {
        console.log("[nemo-autogen bootstrap] disabled", {
          enabled,
          episodeCount: episodeIds.length,
          seriesId,
        });
      }
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

        const payload = (await response.json()) as NemoAutogenResponse;

        if (process.env.NODE_ENV === "development") {
          console.log("[nemo-autogen bootstrap response]", {
            responseOk: response.ok,
            status: payload.status,
            reason: payload.reason,
            error: payload.error,
            detail: payload.detail,
            generatedEpisodeId: payload.generatedEpisodeId,
            seriesId,
            attempts,
          });
        }

        if (!response.ok) {
          return;
        }

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
          return;
        }

        if (payload.status === "config_missing" || payload.status === "skipped") {
          return;
        }
      } catch (error) {
        if (process.env.NODE_ENV === "development") {
          console.log("[nemo-autogen bootstrap fetch failed]", {
            seriesId,
            attempts,
            error,
          });
        }
      }
    }

    void runStep();

    return () => {
      cancelled = true;
    };
  }, [enabled, seriesId, episodeIds, router]);

  return null;
}
