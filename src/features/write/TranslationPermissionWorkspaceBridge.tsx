"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type TranslationPermissionMode = "open" | "closed";

type TranslationPermissionWorkspaceBridgeProps = {
  seriesId?: string | null;
  initialMode: TranslationPermissionMode;
  isAiGenerated?: boolean;
  isOfficialAuthor?: boolean;
};

function findSeriesStatusButton(): HTMLButtonElement | null {
  const existing = document.querySelector<HTMLButtonElement>(
    "button[data-permission-status-integrated='true']"
  );
  if (existing) return existing;

  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("button"));

  return (
    buttons.find((button) => {
      const directLabel = button.querySelector<HTMLElement>(":scope > span:first-child");
      return directLabel?.textContent?.trim() === "朗読許可";
    }) ?? null
  );
}

function integrateStatusButton(button: HTMLButtonElement): void {
  button.dataset.permissionStatusIntegrated = "true";
  const label = button.querySelector<HTMLElement>(":scope > span:first-child");
  if (label && label.textContent?.trim() !== "許可") {
    label.textContent = "許可";
  }
}

function findPermissionPanel(): HTMLElement | null {
  const existing = document.querySelector<HTMLElement>(
    "[data-permission-panel-integrated='true']"
  );
  if (existing) return existing;

  const headings = Array.from(document.querySelectorAll<HTMLElement>("main p"));
  const heading = headings.find((node) => node.textContent?.trim() === "朗読許可");
  const panel = heading?.parentElement;
  return panel instanceof HTMLElement ? panel : null;
}

function integratePermissionPanel(panel: HTMLElement): HTMLElement {
  panel.dataset.permissionPanelIntegrated = "true";

  const heading = panel.querySelector<HTMLElement>(":scope > p:first-child");
  if (heading && heading.textContent?.trim() !== "許可") {
    heading.textContent = "許可";
  }

  let narrationLabel = panel.querySelector<HTMLElement>(
    ":scope > [data-narration-permission-label='true']"
  );

  if (!narrationLabel) {
    narrationLabel = document.createElement("div");
    narrationLabel.dataset.narrationPermissionLabel = "true";
    narrationLabel.className = "mt-3";
    narrationLabel.innerHTML =
      '<p class="text-xs tracking-[0.16em] text-neutral-500">朗読許可</p>';

    const firstContent = heading?.nextSibling ?? null;
    panel.insertBefore(narrationLabel, firstContent);
  }

  let host = panel.querySelector<HTMLElement>(
    ":scope > [data-translation-permission-host='true']"
  );

  if (!host) {
    host = document.createElement("div");
    host.dataset.translationPermissionHost = "true";
    panel.appendChild(host);
  }

  return host;
}

export default function TranslationPermissionWorkspaceBridge({
  seriesId,
  initialMode,
  isAiGenerated = false,
  isOfficialAuthor = false,
}: TranslationPermissionWorkspaceBridgeProps) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [mode, setMode] = useState<TranslationPermissionMode>(initialMode);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode, seriesId]);

  useEffect(() => {
    let currentHost: HTMLElement | null = null;

    function ensureIntegratedUi() {
      const statusButton = findSeriesStatusButton();
      if (statusButton) integrateStatusButton(statusButton);

      const panel = findPermissionPanel();
      if (!panel) {
        if (currentHost && !currentHost.isConnected) {
          currentHost = null;
          setHost(null);
        }
        return;
      }

      const nextHost = integratePermissionPanel(panel);
      if (currentHost !== nextHost) {
        currentHost = nextHost;
        setHost(nextHost);
      }
    }

    ensureIntegratedUi();

    const observer = new MutationObserver(ensureIntegratedUi);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    return () => {
      observer.disconnect();
      currentHost = null;
    };
  }, []);

  async function updateMode(nextMode: TranslationPermissionMode) {
    if (saving || nextMode === mode || isAiGenerated || isOfficialAuthor) return;

    if (!seriesId) {
      setMessage("対訳許可は作品作成後に保存できます。");
      return;
    }

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
        setMessage(payload.message || "対訳許可を更新できませんでした。");
        return;
      }

      setMode(payload.mode === "open" ? "open" : "closed");
      setMessage("保存済み");
    } catch {
      setMessage("対訳許可を更新できませんでした。");
    } finally {
      setSaving(false);
    }
  }

  if (!host) return null;

  const fixedReason = isAiGenerated
    ? "AI生成作品は対訳許可として固定されます。"
    : isOfficialAuthor
      ? "公式アカウントの投稿は対訳許可として固定されます。"
      : "";

  return createPortal(
    <div className="mt-4 border-t border-black/10 pt-4">
      <p className="text-xs tracking-[0.16em] text-neutral-500">対訳許可</p>

      {fixedReason ? (
        <div className="mt-3 rounded-2xl border border-sky-200 bg-sky-50 px-3 py-3">
          <p className="text-sm font-semibold text-black">許可（固定）</p>
          <p className="mt-1 text-xs leading-6 text-neutral-600">{fixedReason}</p>
        </div>
      ) : (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {([
            ["open", "対訳を許可", "この作品を英語対訳の生成対象にする。"],
            ["closed", "対訳を許可しない", "英語対訳を生成・表示しない。"],
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
      )}

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
    </div>,
    host
  );
}
