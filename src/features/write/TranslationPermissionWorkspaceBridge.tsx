"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type TranslationPermissionMode = "open" | "closed";

type TranslationPermissionWorkspaceBridgeProps = {
  enabled: boolean;
  seriesId: string;
  initialMode: TranslationPermissionMode;
};

function findSeriesStatusGrid(): HTMLElement | null {
  const labels = Array.from(document.querySelectorAll<HTMLElement>("p"));
  const heading = labels.find((node) => node.textContent?.trim() === "作品状態");
  const container = heading?.parentElement;

  if (!container) return null;

  const candidates = Array.from(container.querySelectorAll<HTMLElement>("div"));
  return (
    candidates.find((candidate) =>
      Array.from(candidate.children).some((child) => child.tagName === "BUTTON")
    ) ?? null
  );
}

export default function TranslationPermissionWorkspaceBridge({
  enabled,
  seriesId,
  initialMode,
}: TranslationPermissionWorkspaceBridgeProps) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [mode, setMode] = useState<TranslationPermissionMode>(initialMode);
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode, seriesId]);

  useEffect(() => {
    if (!enabled) {
      setHost(null);
      return;
    }

    let currentHost: HTMLElement | null = null;

    function ensureHost() {
      const grid = findSeriesStatusGrid();

      if (!grid) {
        if (currentHost && !currentHost.isConnected) {
          currentHost = null;
          setHost(null);
        }
        return;
      }

      const existing = grid.querySelector<HTMLElement>(
        "[data-translation-permission-host='true']"
      );

      if (existing) {
        if (currentHost !== existing) {
          currentHost = existing;
          setHost(existing);
        }
        return;
      }

      const nextHost = document.createElement("div");
      nextHost.dataset.translationPermissionHost = "true";
      nextHost.style.display = "contents";

      const directButtons = Array.from(grid.children).filter(
        (child) => child.tagName === "BUTTON"
      );
      const lastButton = directButtons.at(-1) ?? null;
      grid.insertBefore(nextHost, lastButton?.nextSibling ?? null);

      currentHost = nextHost;
      setHost(nextHost);
    }

    ensureHost();

    const observer = new MutationObserver(ensureHost);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      if (currentHost?.isConnected) currentHost.remove();
      currentHost = null;
    };
  }, [enabled]);

  async function updateMode(nextMode: TranslationPermissionMode) {
    if (saving || nextMode === mode) return;

    setSaving(true);
    setMessage("");

    try {
      const response = await fetch(
        "/api/series/" + encodeURIComponent(seriesId) + "/translation-permission",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: nextMode }),
        }
      );
      const payload = (await response.json()) as {
        ok?: boolean;
        mode?: TranslationPermissionMode;
        message?: string;
      };

      if (!response.ok || !payload.ok) {
        setMessage(payload.message || "英語対訳許可を更新できませんでした。");
        return;
      }

      setMode(payload.mode === "open" ? "open" : "closed");
      setMessage("保存済み");
    } catch {
      setMessage("英語対訳許可を更新できませんでした。");
    } finally {
      setSaving(false);
    }
  }

  if (!enabled || !host) return null;

  return createPortal(
    <>
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        className={[
          "rounded-2xl border px-3 py-3 text-left transition",
          expanded
            ? "border-sky-200 bg-sky-50"
            : "border-black/10 bg-white hover:bg-neutral-50",
        ].join(" ")}
        aria-expanded={expanded}
      >
        <span className="block text-[11px] tracking-[0.16em] text-neutral-500">
          英語対訳許可
        </span>
        <span className="mt-1 block text-sm font-semibold text-black">
          {mode === "open" ? "対訳を許可" : "対訳を許可しない"}
        </span>
        <span className="mt-2 block text-xs text-neutral-500">
          {expanded ? "閉じる" : "変更"}
        </span>
      </button>

      {expanded ? (
        <div className="sm:col-span-2 rounded-2xl border border-black/10 bg-white p-3">
          <p className="text-sm font-semibold text-black">英語対訳許可</p>
          <p className="mt-2 text-xs leading-6 text-neutral-500">
            許可すると、この作品の読むページに英語対訳の表示項目を出せる。既存作品は初期状態では許可しない。
          </p>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {([
              ["open", "対訳を許可", "英語対訳機能の対象にする。"],
              ["closed", "対訳を許可しない", "読むページに英語対訳の項目を表示しない。"],
            ] as const).map(([value, label, description]) => {
              const active = mode === value;

              return (
                <button
                  key={value}
                  type="button"
                  disabled={saving}
                  onClick={() => void updateMode(value)}
                  className={[
                    "rounded-2xl border px-3 py-3 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-50",
                    active
                      ? "border-sky-200 bg-sky-50 text-black"
                      : "border-black/10 bg-white text-neutral-700 hover:bg-neutral-50",
                  ].join(" ")}
                >
                  <span className="block font-semibold">{label}</span>
                  <span className="mt-2 block text-xs leading-6 text-neutral-500">
                    {description}
                  </span>
                </button>
              );
            })}
          </div>

          {message ? (
            <p
              className={[
                "mt-3 text-xs",
                message === "保存済み" ? "text-emerald-700" : "text-red-700",
              ].join(" ")}
            >
              {message}
            </p>
          ) : null}
        </div>
      ) : null}
    </>,
    host
  );
}
