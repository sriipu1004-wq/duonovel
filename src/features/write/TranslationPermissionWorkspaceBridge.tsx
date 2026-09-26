"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useUiLocale } from "@/i18n/UiLocaleProvider";

type TranslationPermissionMode = "open" | "closed";

type TranslationPermissionWorkspaceBridgeProps = {
  seriesId?: string | null;
  initialMode: TranslationPermissionMode | null;
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

const AI_TRANSLATION_PERMISSION_COPY = {
  ja: {
    heading: "AI翻訳（対訳生成）",
    allow: "AI翻訳を許可",
    deny: "AI翻訳を許可しない",
    description:
      "許可すると、読者が未生成の対訳を利用するとき、対象話の本文と、用語・翻訳方針・直前の公開話など翻訳の一貫性に必要な限定情報をOpenAI APIへ送信することがあります。許可しない場合、新規AI翻訳と新規AI単語解説は実行しません。生成済み翻訳はLIB read内で保存・再利用されます。",
    saved: "保存済み",
    updateFailed: "AI翻訳の許可設定を更新できませんでした。",
    restore: "保存済みに戻す",
  },
  en: {
    heading: "AI translation (bilingual generation)",
    allow: "Allow AI translation",
    deny: "Do not allow AI translation",
    description:
      "If allowed, when a reader requests a translation that has not been generated yet, LIB read may send the relevant episode text and limited consistency context—such as glossary terms, translation guidance, and the immediately preceding published episode—to the OpenAI API. If not allowed, no new AI translation or AI word explanation is generated. Existing translations may be stored and reused within LIB read.",
    saved: "Saved",
    updateFailed: "Could not update the AI translation permission.",
    restore: "Restore saved value",
  },
  ko: {
    heading: "AI 번역(대역 생성)",
    allow: "AI 번역 허용",
    deny: "AI 번역 허용 안 함",
    description:
      "허용하면 독자가 아직 생성되지 않은 번역을 요청할 때 해당 회차의 본문과 용어집, 번역 지침, 바로 앞의 공개 회차 등 번역 일관성에 필요한 제한된 문맥이 OpenAI API로 전송될 수 있습니다. 허용하지 않으면 새로운 AI 번역과 새로운 AI 단어 설명을 생성하지 않습니다. 이미 생성된 번역은 LIB read 안에서 저장·재사용될 수 있습니다.",
    saved: "저장됨",
    updateFailed: "AI 번역 허용 설정을 업데이트하지 못했습니다.",
    restore: "저장된 값으로 되돌리기",
  },
} as const;

function findSeriesStatusButton(): HTMLButtonElement | null {
  const existing = document.querySelector<HTMLButtonElement>(
    "button[data-permission-status-integrated='true']"
  );
  if (existing) return existing;

  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("button"));

  return (
    buttons.find((button) => {
      const directLabel = button.querySelector<HTMLElement>(":scope > span:first-child");
      return NARRATION_PERMISSION_LABELS.has(
        directLabel?.textContent?.trim() ?? ""
      );
    }) ?? null
  );
}

function normalizeRecordingStatus(
  value: string | null | undefined
): string {

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

function translationStatusLabel(
  mode: TranslationPermissionMode | null
): string {
  if (mode === "open") return "対訳許可";
  if (mode === "closed") return "対訳不許可";
  return "対訳未設定";
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
  const looksLikeCombinedValue = currentText.includes("対訳");

  if (!looksLikeCombinedValue) {
    button.dataset.recordingPermissionStatus = normalizeRecordingStatus(
      currentText,
    );
  }

  const recordingStatus =
    button.dataset.recordingPermissionStatus ||
    normalizeRecordingStatus(currentText);
  const translationStatus = translationStatusLabel(mode);
  const combinedValue = `${recordingStatus}・${translationStatus}`;

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
  ).find((button) =>
    RESTORE_SAVED_LABELS.has(button.textContent?.trim() ?? "")
  );

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
  const locale = useUiLocale();
  const copy = AI_TRANSLATION_PERMISSION_COPY[locale];
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
        setMessage(copy.saved);
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
  }, [copy.saved]);

  useEffect(() => {
    if (seriesId) return;

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
  }, [mode, seriesId]);

  useEffect(() => {
    let currentHost: HTMLElement | null = null;

    function ensureIntegratedUi() {
      const statusButton = findSeriesStatusButton();
      if (statusButton) {
        integrateStatusButton(statusButton, mode);
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
  }, [mode]);

  async function updateMode(nextMode: TranslationPermissionMode) {
    if (saving || nextMode === mode) return;

    if (!seriesId) {
      setMode(nextMode);
      setMessage("");
      window.dispatchEvent(
        new CustomEvent("libread:translation-permission-selection-changed", {
          detail: { mode: nextMode },
        })
      );
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
        setMessage(copy.updateFailed);
        return;
      }

      const saved = payload.mode === "open" ? "open" : "closed";
      setMode(saved);
      setSavedMode(saved);
      setMessage(copy.saved);
      window.dispatchEvent(
        new CustomEvent("libread:translation-permission-selection-changed", {
          detail: { mode: saved },
        })
      );
    } catch {
      setMessage(copy.updateFailed);
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
      <p className="text-xs tracking-[0.16em] text-neutral-500">{copy.heading}</p>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {([
          ["open", copy.allow],
          ["closed", copy.deny],
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
      <p className="mt-3 text-xs leading-6 text-neutral-600">
        {copy.description}
      </p>

      {message ? (
        <p
          className={[
            "mt-3 text-xs",
            message === copy.saved ? "text-emerald-700" : "text-red-700",
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
          {copy.restore}
        </button>
    </div>,
    host
  );
}
