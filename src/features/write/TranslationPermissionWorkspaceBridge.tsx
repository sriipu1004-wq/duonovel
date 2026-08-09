"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type TranslationPermissionMode = "open" | "closed";

type TranslationPermissionWorkspaceBridgeProps = {
  seriesId?: string | null;
  initialMode: TranslationPermissionMode | null;
  isAiGenerated?: boolean;
  isOfficialAuthor?: boolean;
};

const PENDING_CREATE_PERMISSION_KEY =
  "duonovel:pending-translation-permission-create";

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

function normalizeRecordingStatus(
  value: string | null | undefined,
  isAiGenerated: boolean
): string {
  if (isAiGenerated) return "朗読許可";

  const text = value?.trim() ?? "";
  if (text.includes("朗読不可") || text.includes("朗読不許可")) {
    return "朗読不許可";
  }
  if (text.includes("朗読許可")) {
    return "朗読許可";
  }
  return "朗読未設定";
}

function translationStatusLabel(
  mode: TranslationPermissionMode | null,
  isAiGenerated: boolean
): string {
  if (isAiGenerated || mode === "open") return "対訳許可";
  if (mode === "closed") return "対訳不許可";
  return "対訳未設定";
}

function integrateStatusButton(
  button: HTMLButtonElement,
  mode: TranslationPermissionMode | null,
  isAiGenerated: boolean
): void {
  button.dataset.permissionStatusIntegrated = "true";

  const spans = Array.from(button.querySelectorAll<HTMLElement>(":scope > span"));
  const label = spans[0] ?? null;
  const value = spans[1] ?? null;

  if (label && label.textContent?.trim() !== "許可") {
    label.textContent = "許可";
  }

  if (!value) return;

  const currentText = value.textContent?.trim() ?? "";
  const looksLikeCombinedValue = currentText.includes("対訳");

  if (!looksLikeCombinedValue) {
    button.dataset.recordingPermissionStatus = normalizeRecordingStatus(
      currentText,
      isAiGenerated
    );
  }

  const recordingStatus =
    button.dataset.recordingPermissionStatus ||
    normalizeRecordingStatus(currentText, isAiGenerated);
  const translationStatus = translationStatusLabel(mode, isAiGenerated);

  value.textContent = `・${recordingStatus}　・${translationStatus}`;
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

  const restoreButton = Array.from(
    panel.querySelectorAll<HTMLButtonElement>(":scope > button")
  ).find((button) => button.textContent?.includes("保存済みに戻す"));

  if (restoreButton && restoreButton.previousElementSibling !== host) {
    panel.insertBefore(restoreButton, host.nextSibling);
    restoreButton.classList.remove("mt-3");
    restoreButton.classList.add("mt-4");
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
  const [mode, setMode] = useState<TranslationPermissionMode | null>(initialMode);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode, seriesId]);

  useEffect(() => {
    function handleAppliedPermission(event: Event) {
      const detail = (event as CustomEvent<{ mode?: unknown }>).detail;
      if (detail?.mode === "open" || detail?.mode === "closed") {
        setMode(detail.mode);
        setMessage("保存済み");
      }
    }

    window.addEventListener(
      "libread:translation-permission-applied",
      handleAppliedPermission
    );

    return () => {
      window.removeEventListener(
        "libread:translation-permission-applied",
        handleAppliedPermission
      );
    };
  }, []);

  useEffect(() => {
    if (seriesId || isAiGenerated) return;

    function rememberCreateSelection(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const button = target.closest<HTMLButtonElement>("button");
      if (!button || !button.textContent?.includes("作品を作成して")) return;
      if (mode !== "open" && mode !== "closed") {
        window.sessionStorage.removeItem(PENDING_CREATE_PERMISSION_KEY);
        return;
      }

      window.sessionStorage.setItem(
        PENDING_CREATE_PERMISSION_KEY,
        JSON.stringify({
          mode,
          startedAt: Date.now(),
          sourcePath: window.location.pathname,
        })
      );
    }

    document.addEventListener("click", rememberCreateSelection, true);
    return () => document.removeEventListener("click", rememberCreateSelection, true);
  }, [isAiGenerated, mode, seriesId]);

  useEffect(() => {
    let currentHost: HTMLElement | null = null;

    function ensureIntegratedUi() {
      const statusButton = findSeriesStatusButton();
      if (statusButton) {
        integrateStatusButton(statusButton, mode, isAiGenerated);
      }

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
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => {
      observer.disconnect();
      currentHost = null;
    };
  }, [isAiGenerated, mode]);

  async function updateMode(nextMode: TranslationPermissionMode) {
    if (saving || nextMode === mode || isAiGenerated) return;

    if (!seriesId) {
      setMode(nextMode);
      setMessage("作品作成時にこの設定を保存します。");
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

  return createPortal(
    <div className="mt-4 border-t border-black/10 pt-4">
      <p className="text-xs tracking-[0.16em] text-neutral-500">対訳許可</p>

      {isAiGenerated ? (
        <div className="mt-3 rounded-2xl border border-sky-200 bg-sky-50 px-3 py-3">
          <p className="text-sm font-semibold text-black">対訳許可（固定）</p>
          <p className="mt-1 text-xs leading-6 text-neutral-600">
            AI生成作品は対訳生成の対象として固定されます。
          </p>
        </div>
      ) : (
        <>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {([
              ["open", "対訳を許可", "この作品を英語対訳の生成対象にする。"],
              ["closed", "対訳を許可しない", "通常作品では英語対訳を生成・表示しない。"],
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

          {mode === null ? (
            <p className="mt-3 text-xs leading-6 text-neutral-500">
              対訳許可は未設定です。作品作成前でもここで選択できます。
            </p>
          ) : null}

          {isOfficialAuthor ? (
            <p className="mt-3 text-xs leading-6 text-neutral-500">
              公式アカウントの投稿は、保存した設定に関係なく実際の対訳生成判定では対象になります。
            </p>
          ) : null}
        </>
      )}

      {message ? (
        <p
          className={[
            "mt-3 text-xs",
            message === "保存済み" || message.includes("作品作成時")
              ? "text-emerald-700"
              : "text-red-700",
          ].join(" ")}
        >
          {message}
        </p>
      ) : null}
    </div>,
    host
  );
}
