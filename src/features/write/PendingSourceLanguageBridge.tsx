"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { stripUiLocalePrefix } from "@/i18n/config";
import { parseSupportedLanguageTag } from "@/lib/translation/languageRegistry";

const PENDING_CREATE_SOURCE_LANGUAGE_KEY =
  "duonovel:pending-source-language-create";
const PENDING_TTL_MS = 60_000;
const RETRY_DELAY_MS = 2_000;

type PendingSourceLanguage = {
  language: string;
  startedAt: number;
  sourcePath: string;
};

function clearPendingSourceLanguage() {
  window.sessionStorage.removeItem(PENDING_CREATE_SOURCE_LANGUAGE_KEY);
}

function isPendingExpired(pending: PendingSourceLanguage): boolean {
  return Date.now() - pending.startedAt > PENDING_TTL_MS;
}

function readPendingSourceLanguage(): PendingSourceLanguage | null {
  try {
    const raw = window.sessionStorage.getItem(PENDING_CREATE_SOURCE_LANGUAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingSourceLanguage>;
    const sourcePath =
      typeof parsed.sourcePath === "string"
        ? stripUiLocalePrefix(parsed.sourcePath)
        : "";
    if (
      !parseSupportedLanguageTag(parsed.language) ||
      typeof parsed.startedAt !== "number" ||
      sourcePath !== "/write/series/new"
    ) {
      clearPendingSourceLanguage();
      return null;
    }
    const pending = parsed as PendingSourceLanguage;
    if (isPendingExpired(pending)) {
      clearPendingSourceLanguage();
      return null;
    }
    return pending;
  } catch {
    clearPendingSourceLanguage();
    return null;
  }
}

export default function PendingSourceLanguageBridge() {
  const pathname = usePathname();
  const applyingRef = useRef(false);

  useEffect(() => {
    const routePath = stripUiLocalePrefix(pathname);
    const match = routePath.match(/^\/write\/series\/([^/]+)(?:\/|$)/u);
    const seriesId = match?.[1] ?? "";
    if (!seriesId || seriesId === "new") return;

    const pending = readPendingSourceLanguage();
    if (!pending) return;
    const language = parseSupportedLanguageTag(pending.language);
    if (!language) return;

    let cancelled = false;
    let retryTimer: number | null = null;

    const scheduleRetry = () => {
      if (cancelled) return;
      if (isPendingExpired(pending)) {
        clearPendingSourceLanguage();
        return;
      }
      retryTimer = window.setTimeout(() => void applyPendingLanguage(), RETRY_DELAY_MS);
    };

    const applyPendingLanguage = async () => {
      if (cancelled || applyingRef.current) return;
      applyingRef.current = true;
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

        let payload: { ok?: boolean; language?: unknown } = {};
        try {
          payload = (await response.json()) as {
            ok?: boolean;
            language?: unknown;
          };
        } catch {
          // A transient non-JSON server response can be retried below.
        }

        if (response.ok && payload.ok) {
          clearPendingSourceLanguage();
          window.dispatchEvent(
            new CustomEvent("libread:source-language-applied", {
              detail: { language: payload.language ?? language },
            })
          );
          return;
        }

        if (response.status >= 500 || response.status === 429) {
          scheduleRetry();
          return;
        }

        // Authentication/ownership/mismatch failures are not transient. Do not
        // risk applying this pending selection to another series later.
        clearPendingSourceLanguage();
      } catch {
        scheduleRetry();
      } finally {
        applyingRef.current = false;
      }
    };

    void applyPendingLanguage();

    return () => {
      cancelled = true;
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      applyingRef.current = false;
    };
  }, [pathname]);

  return null;
}
