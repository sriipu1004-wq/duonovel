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

const NARRATION_PERMISSION_LABELS = new Set([
  "朗読許可",
  "Narration permission",
  "낭독 허용",
]);

const RESTORE_SAVED_LABELS = new Set([
  "保存済みに戻す",
  "Restore saved value",
  "저장된 값으로 되돌리기",
]);

function findSeriesStatusButton(): HTMLButtonElement | null {
  const existing = document.querySelector<HTMLButtonElement>(
    "button[data-permission-status-integrated='true']"
  );
  if (existing) return existing;

  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("button"));
  return (
    buttons.find((button) => {
      const directLabel = button.querySelector<HTMLElement>(":scope > span:first-child");
      return NARRATION_PERMISSION_LABELS.has(directLabel?.textContent?.trim() ?? "");
    }) ?? null
  );
}

function normalizeRecordingStatus(value: string | null | undefined): string {
  const text = value?.trim() ?? "";
  if (
    text.includes("朗読不可") ||
    text.includes("朗読不許可") ||
    text.includes("Narration unavailable") ||
    text.includes("Narration not allowed") ||
    text.includes("낭독 불가") ||
    text.includes("낭독 불허")
  ) {
    return "朗読不許可";
  }
  if (
    text.includes("朗読許可") ||
    text.includes("Narration permission") ||
    text.includes("Narration allowed") ||
    text.includes("낭독 허용")
  ) {
    return "朗読許可";
  }
  return "朗読未設定";
}

function translationStatusLabel(mode: TranslationPermissionMode | null): string {
  if (mode === "open") return "翻訳許可";
  if (mode === "closed") return "翻訳不許可";
  return "翻訳未設定";
}

function integrateStatusButton(
  button: HTMLButtonElement,
  mode: TranslationPermissionMode | null
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
  if (!currentText.includes("翻訳") && !currentText.includes("対訳")) {
    button.dataset.recordingPermissionStatus = normalizeRecordingStatus(currentText);
  }

  const recordingStatus =
    button.dataset.recordingPermissionStatus || normalizeRecordingStatus(currentText);
  const combinedValue = `${recordingStatus}・${translationStatusLabel(mode)}`;

  if (value.textContent !== combinedValue) {
    value.textContent = combinedValue;
  }
}

function findPermissionPanel(): HTMLElement | null {
  const existing = document.querySelector<HTMLElement>(
    "[data-permission-panel-integrated='true']"
  );
  if (existing) return existing;

  const headings = Array.from(document.querySelectorAll<HTMLElement>("main p"));
  const heading = headings.find((node) =>
    NARRATION_PERMISSION_LABELS.has(node.textContent?.trim() ?? "")
  );
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

  const restoreButton = Array.from(
    panel.querySelectorAll<HTMLButtonElement>(":scope > button")
  ).find((button) => RESTORE_SAVED_LABELS.has(button.textContent?.trim() ?? ""));

  if (restoreButton) {
    restoreButton.dataset.permissionRestoreSource = "true";
    restoreButton.style.display = "none";
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

function triggerOriginalRestoreButton() {
  document
    .querySelector<HTMLButtonElement>("button[data-permission-restore-source='true']")
    ?.click();
}

export default function TranslationPermissionWorkspaceBridge({
  seriesId,
  initialMode,
}: TranslationPermissionWorkspaceBridgeProps) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [mode, setMode] = useState<TranslationPermissionMode | null>(initialMode);
  const [savedMode, setSavedMode] =
    useState<TranslationPermissionMode | null>(initialMode);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setMode(initialMode);
    setSavedMode(initialMode);
  }, [initialMode, seriesId]);

  useEffect(() => {
    function handleAppliedPermission(event: Event) {
      const detail = (event as CustomEvent<{ mode?: unknown }>).detail;
      if (detail?.mode === "open" || detail?.mode === "closed") {
        setMode(detail.mode);
        setSavedMode(detail.mode);
        setMessage("保存済み");
      }
    }

    window.addEventListener(
      "libread:translation-permission-applied",
      handleAppliedPermission
    );
    return () =>
      window.removeEventListener(
        "libread:translation-permission-applied",
        handleAppliedPermission
      );
  }, []);

  useEffect(() => {
    if (seriesId) return;

    function rememberCreateSelection(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest<HTMLButtonElement>("button");
      if (!button || !button.textContent?.includes("作品を作成して")) return;
      if (mode !== "open" && mode !== "closed") return;

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
  }, [mode, seriesId]);

  useEffect(() => {
    let currentHost: HTMLElement | null = null;

    function ensureIntegratedUi() {
      const statusButton = findSeriesStatusButton();
      if (statusButton) integrateStatusButton(statusButton, mode);

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
  }, [mode]);

  async function updateMode(nextMode: TranslationPermissionMode) {
    if (saving || nextMode === mode) return;

    if (!seriesId) {
      setMode(nextMode);
      setMessage("");
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
      };

      if (!response.ok || !payload.ok) {
        setMessage("翻訳許可を更新できませんでした。");
        return;
      }

      const saved = payload.mode === "open" ? "open" : "closed";
      setMode(saved);
      setSavedMode(saved);
      setMessage("保存済み");
    } catch {
      setMessage("翻訳許可を更新できませんでした。");
    } finally {
      setSaving(false);
    }
  }

  function restoreSavedPermissions() {
    triggerOriginalRestoreButton();
    setMode(savedMode);
    setMessage("");
  }

  if (!host) return null;

  return createPortal(
    <div className="mt-4 border-t border-black/10 pt-4">
      <p className="text-xs tracking-[0.16em] text-neutral-500">翻訳・対訳許可</p>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {([
          ["open", "翻訳・対訳を許可"],
          ["closed", "翻訳・対訳を許可しない"],
        ] as const).map(([value, label]) => {
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
            </button>
          );
        })}
      </div>

      <div className="mt-3 rounded-2xl border border-black/10 bg-neutral-50 px-3 py-3 text-xs leading-6 text-neutral-600">
        <p className="font-semibold text-neutral-800">
          翻訳許可は、作品をAIの学習用データとして提供する同意ではありません。
        </p>
        <p className="mt-1">
          許可した場合、読者がAI翻訳を利用するときに本文が翻訳生成の入力として処理されます。
          また、読者は自分用の人力翻訳を作成できます。
        </p>
        <p className="mt-1">
          不許可にすると、Readerの対訳・翻訳のみ機能、新規AI翻訳、人力翻訳作成を利用できません。
        </p>
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

      <button
        type="button"
        onClick={restoreSavedPermissions}
        className="mt-4 rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs text-neutral-700 transition hover:bg-neutral-50"
      >
        保存済みに戻す
      </button>
    </div>,
    host
  );
}
