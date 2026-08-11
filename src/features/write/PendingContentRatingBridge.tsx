"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import type { SeriesContentWarning } from "@/lib/contentRating";

type PendingWarnings = {
  warnings: SeriesContentWarning[];
  startedAt: number;
  sourcePath: string;
};

const PENDING_KEY = "duonovel:pending-content-rating-create";
const PENDING_TTL_MS = 60_000;

function isWarning(value: unknown): value is SeriesContentWarning {
  return value === "sexual_r18" || value === "violence";
}

function readPending(): PendingWarnings | null {
  try {
    const raw = window.sessionStorage.getItem(PENDING_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<PendingWarnings>;
    const warnings = Array.isArray(parsed.warnings)
      ? Array.from(new Set(parsed.warnings.filter(isWarning)))
      : [];

    if (
      warnings.length === 0 ||
      typeof parsed.startedAt !== "number" ||
      parsed.sourcePath !== "/write/series/new"
    ) {
      window.sessionStorage.removeItem(PENDING_KEY);
      return null;
    }

    if (Date.now() - parsed.startedAt > PENDING_TTL_MS) {
      window.sessionStorage.removeItem(PENDING_KEY);
      return null;
    }

    return {
      warnings,
      startedAt: parsed.startedAt,
      sourcePath: parsed.sourcePath,
    };
  } catch {
    window.sessionStorage.removeItem(PENDING_KEY);
    return null;
  }
}

export default function PendingContentRatingBridge() {
  const pathname = usePathname();
  const applyingRef = useRef(false);

  useEffect(() => {
    if (applyingRef.current) return;

    const match = pathname.match(/^\/write\/series\/([^/]+)(?:\/|$)/);
    const seriesId = match?.[1] ?? "";
    if (!seriesId || seriesId === "new") return;

    const pending = readPending();
    if (!pending) return;

    applyingRef.current = true;

    void (async () => {
      try {
        const response = await fetch(
          "/api/series/" + encodeURIComponent(seriesId) + "/content-rating",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              warnings: pending.warnings,
              createdAfter: new Date(pending.startedAt - 5000).toISOString(),
            }),
          }
        );
        const payload = (await response.json().catch(() => null)) as
          | { ok?: boolean; warnings?: SeriesContentWarning[] }
          | null;

        window.sessionStorage.removeItem(PENDING_KEY);

        if (response.ok && payload?.ok && Array.isArray(payload.warnings)) {
          window.dispatchEvent(
            new CustomEvent("libread:content-rating-applied", {
              detail: { warnings: payload.warnings },
            })
          );
        }
      } catch {
        // Keep series creation non-blocking; stale pending data expires quickly.
      } finally {
        applyingRef.current = false;
      }
    })();
  }, [pathname]);

  return null;
}
