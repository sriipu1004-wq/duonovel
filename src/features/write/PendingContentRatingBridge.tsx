"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

type PendingRating = {
  rating: "r18";
  startedAt: number;
  sourcePath: string;
};

const PENDING_KEY = "duonovel:pending-content-rating-create";
const PENDING_TTL_MS = 60_000;

function readPending(): PendingRating | null {
  try {
    const raw = window.sessionStorage.getItem(PENDING_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<PendingRating>;
    if (
      parsed.rating !== "r18" ||
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

    return parsed as PendingRating;
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
              rating: pending.rating,
              createdAfter: new Date(pending.startedAt - 5000).toISOString(),
            }),
          }
        );

        window.sessionStorage.removeItem(PENDING_KEY);

        if (response.ok) {
          window.dispatchEvent(
            new CustomEvent("libread:content-rating-applied", {
              detail: { rating: pending.rating },
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
