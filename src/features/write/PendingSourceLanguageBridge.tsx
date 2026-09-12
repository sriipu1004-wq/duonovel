"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { parseSupportedLanguageTag } from "@/lib/translation/languageRegistry";

const PENDING_CREATE_SOURCE_LANGUAGE_KEY =
  "duonovel:pending-source-language-create";
const PENDING_TTL_MS = 60_000;

type PendingSourceLanguage = {
  language: string;
  startedAt: number;
  sourcePath: string;
};

function readPendingSourceLanguage(): PendingSourceLanguage | null {
  try {
    const raw = window.sessionStorage.getItem(PENDING_CREATE_SOURCE_LANGUAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingSourceLanguage>;
    if (
      !parseSupportedLanguageTag(parsed.language) ||
      typeof parsed.startedAt !== "number" ||
      parsed.sourcePath !== "/write/series/new"
    ) {
      window.sessionStorage.removeItem(PENDING_CREATE_SOURCE_LANGUAGE_KEY);
      return null;
    }
    if (Date.now() - parsed.startedAt > PENDING_TTL_MS) {
      window.sessionStorage.removeItem(PENDING_CREATE_SOURCE_LANGUAGE_KEY);
      return null;
    }
    return parsed as PendingSourceLanguage;
  } catch {
    window.sessionStorage.removeItem(PENDING_CREATE_SOURCE_LANGUAGE_KEY);
    return null;
  }
}

export default function PendingSourceLanguageBridge() {
  const pathname = usePathname();
  const applyingRef = useRef(false);

  useEffect(() => {
    if (applyingRef.current) return;
    const match = pathname.match(/^\/write\/series\/([^/]+)(?:\/|$)/u);
    const seriesId = match?.[1] ?? "";
    if (!seriesId || seriesId === "new") return;

    const pending = readPendingSourceLanguage();
    if (!pending) return;
    const language = parseSupportedLanguageTag(pending.language);
    if (!language) return;

    applyingRef.current = true;
    void (async () => {
      try {
        const response = await fetch(
          `/api/series/${encodeURIComponent(seriesId)}/source-language`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              language,
              createdAfter: new Date(pending.startedAt - 5000).toISOString(),
            }),
          }
        );
        const payload = (await response.json()) as {
          ok?: boolean;
          language?: unknown;
        };
        window.sessionStorage.removeItem(PENDING_CREATE_SOURCE_LANGUAGE_KEY);
        if (response.ok && payload.ok) {
          window.dispatchEvent(
            new CustomEvent("libread:source-language-applied", {
              detail: { language: payload.language ?? language },
            })
          );
        }
      } catch {
        // Non-blocking; the pending value expires shortly.
      } finally {
        applyingRef.current = false;
      }
    })();
  }, [pathname]);

  return null;
}
