"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

type PendingPermission = {
  mode: "open" | "closed";
  startedAt: number;
  sourcePath: string;
};

const PENDING_CREATE_PERMISSION_KEY =
  "duonovel:pending-translation-permission-create";
const PENDING_TTL_MS = 60_000;

function readPendingPermission(): PendingPermission | null {
  try {
    const raw = window.sessionStorage.getItem(PENDING_CREATE_PERMISSION_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<PendingPermission>;
    if (
      (parsed.mode !== "open" && parsed.mode !== "closed") ||
      typeof parsed.startedAt !== "number" ||
      parsed.sourcePath !== "/write/series/new"
    ) {
      window.sessionStorage.removeItem(PENDING_CREATE_PERMISSION_KEY);
      return null;
    }

    if (Date.now() - parsed.startedAt > PENDING_TTL_MS) {
      window.sessionStorage.removeItem(PENDING_CREATE_PERMISSION_KEY);
      return null;
    }

    return parsed as PendingPermission;
  } catch {
    window.sessionStorage.removeItem(PENDING_CREATE_PERMISSION_KEY);
    return null;
  }
}

export default function PendingTranslationPermissionBridge() {
  const pathname = usePathname();
  const applyingRef = useRef(false);

  useEffect(() => {
    if (applyingRef.current) return;

    const match = pathname.match(/^\/write\/series\/([^/]+)(?:\/|$)/);
    const seriesId = match?.[1] ?? "";
    if (!seriesId || seriesId === "new") return;

    const pending = readPendingPermission();
    if (!pending) return;

    applyingRef.current = true;

    void (async () => {
      try {
        const response = await fetch(
          "/api/series/" + encodeURIComponent(seriesId) + "/translation-permission",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              mode: pending.mode,
              createdAfter: new Date(pending.startedAt - 5000).toISOString(),
            }),
          }
        );
        const payload = (await response.json()) as {
          ok?: boolean;
          mode?: "open" | "closed";
        };

        window.sessionStorage.removeItem(PENDING_CREATE_PERMISSION_KEY);

        if (response.ok && payload.ok) {
          window.dispatchEvent(
            new CustomEvent("libread:translation-permission-applied", {
              detail: { mode: payload.mode ?? pending.mode },
            })
          );
        }
      } catch {
        // Keep the create flow non-blocking. The pending value expires quickly.
      } finally {
        applyingRef.current = false;
      }
    })();
  }, [pathname]);

  return null;
}
