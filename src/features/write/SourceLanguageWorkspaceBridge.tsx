"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useUiLocale } from "@/i18n/UiLocaleProvider";
import { stripUiLocalePrefix } from "@/i18n/config";
import {
  LANGUAGE_REGISTRY,
  parseSupportedLanguageTag,
  type SupportedLanguageTag,
} from "@/lib/translation/languageRegistry";

const PENDING_CREATE_SOURCE_LANGUAGE_KEY =
  "duonovel:pending-source-language-create";

const SOURCE_LANGUAGE_OPTIONS = Object.keys(
  LANGUAGE_REGISTRY
) as SupportedLanguageTag[];

const CREATE_ACTION_LABELS = new Set([
  "作品を作成して1話目へ",
  "作品を作成してワークスペースへ",
  "Create work and continue to episode 1",
  "Create work and open workspace",
  "작품을 만들고 1화로",
  "작품을 만들고 워크스페이스로",
]);

const PUBLICATION_LABELS = new Set(["公開状態", "Publication", "공개 상태"]);

const copy = {
  ja: {
    heading: "原文言語",
    help: "UIの表示言語とは別です。この作品が最初に書かれた言語を指定します。",
    placeholder: "原文言語を選択",
    confirm: "この言語を原文言語として確定",
    legacyNotice: "既存作品の推定値です。内容を確認して確定してください。",
    required: "作品を作成する前に原文言語を選択してください。",
    saved: "保存済み",
    failed: "原文言語を更新できませんでした。",
    unset: "未設定",
    change: "変更",
    close: "閉じる",
  },
  en: {
    heading: "Original language",
    help: "This is independent of the interface language. Choose the language in which the work was originally written.",
    placeholder: "Choose original language",
    confirm: "Confirm as original language",
    legacyNotice: "This is an inferred value for an existing work. Review it and confirm the language.",
    required: "Choose the original language before creating the work.",
    saved: "Saved",
    failed: "Could not update the original language.",
    unset: "Not set",
    change: "Change",
    close: "Close",
  },
  ko: {
    heading: "원문 언어",
    help: "UI 표시 언어와는 별개입니다. 이 작품이 처음 작성된 언어를 지정하세요.",
    placeholder: "원문 언어 선택",
    confirm: "이 언어를 원문 언어로 확정",
    legacyNotice: "기존 작품에서 추정한 값입니다. 내용을 확인한 뒤 확정하세요.",
    required: "작품을 만들기 전에 원문 언어를 선택하세요.",
    saved: "저장됨",
    failed: "원문 언어를 업데이트하지 못했습니다.",
    unset: "미설정",
    change: "변경",
    close: "닫기",
  },
} as const;

type Props = {
  seriesId?: string | null;
  initialLanguage?: SupportedLanguageTag | null;
  confirmed?: boolean;
  embedded?: boolean;
};

function findStatusGrid(): HTMLElement | null {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("main button"));
  const publicationButton = buttons.find((button) => {
    const first = button.querySelector<HTMLElement>(":scope > span:first-child");
    return PUBLICATION_LABELS.has(first?.textContent?.trim() ?? "");
  });
  return publicationButton?.parentElement instanceof HTMLElement
    ? publicationButton.parentElement
    : null;
}

function ensureHosts(): { statusHost: HTMLElement; panelHost: HTMLElement } | null {
  const grid = findStatusGrid();
  if (!grid) return null;

  let statusHost = grid.querySelector<HTMLElement>(
    ":scope > [data-source-language-status-host='true']"
  );
  if (!statusHost) {
    statusHost = document.createElement("div");
    statusHost.dataset.sourceLanguageStatusHost = "true";
    statusHost.style.display = "contents";
    const firstNonButton = Array.from(grid.children).find(
      (node) => node.tagName !== "BUTTON"
    );
    grid.insertBefore(statusHost, firstNonButton ?? null);
  }

  let panelHost = grid.querySelector<HTMLElement>(
    ":scope > [data-source-language-panel-host='true']"
  );
  if (!panelHost) {
    panelHost = document.createElement("div");
    panelHost.dataset.sourceLanguagePanelHost = "true";
    panelHost.style.gridColumn = "1 / -1";
    const firstNonButton = Array.from(grid.children).find(
      (node) =>
        node !== statusHost &&
        node.tagName !== "BUTTON" &&
        !(node instanceof HTMLElement && node.dataset.sourceLanguagePanelHost === "true")
    );
    grid.insertBefore(panelHost, firstNonButton ?? null);
  }

  return { statusHost, panelHost };
}

export default function SourceLanguageWorkspaceBridge({
  seriesId,
  initialLanguage = null,
  confirmed = false,
}: Props) {
  const router = useRouter();
  const dictionary = copy[useUiLocale()];
  const [statusHost, setStatusHost] = useState<HTMLElement | null>(null);
  const [panelHost, setPanelHost] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [language, setLanguage] = useState<SupportedLanguageTag | "">(
    initialLanguage ?? ""
  );
  const [savedLanguage, setSavedLanguage] = useState<SupportedLanguageTag | null>(
    confirmed ? initialLanguage : null
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!initialLanguage) return;
    setLanguage(initialLanguage);
    setSavedLanguage(confirmed ? initialLanguage : null);
  }, [confirmed, initialLanguage, seriesId]);

  useEffect(() => {
    let currentStatusHost: HTMLElement | null = null;
    let currentPanelHost: HTMLElement | null = null;

    function ensureUi() {
      const hosts = ensureHosts();
      if (!hosts) return;
      if (hosts.statusHost !== currentStatusHost) {
        currentStatusHost = hosts.statusHost;
        setStatusHost(hosts.statusHost);
      }
      if (hosts.panelHost !== currentPanelHost) {
        currentPanelHost = hosts.panelHost;
        setPanelHost(hosts.panelHost);
      }
    }

    ensureUi();
    const observer = new MutationObserver(ensureUi);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    function handleApplied(event: Event) {
      const detail = (event as CustomEvent<{ language?: unknown }>).detail;
      const applied = parseSupportedLanguageTag(detail?.language);
      if (!applied) return;
      setLanguage(applied);
      setSavedLanguage(applied);
      setMessage(dictionary.saved);
      router.refresh();
    }

    window.addEventListener("libread:source-language-applied", handleApplied);
    return () =>
      window.removeEventListener("libread:source-language-applied", handleApplied);
  }, [dictionary.saved, router]);

  useEffect(() => {
    if (seriesId) return;

    function rememberCreateSelection(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest<HTMLButtonElement>("button[type='button']");
      if (!button) return;
      const label = button.textContent?.trim() ?? "";
      if (!CREATE_ACTION_LABELS.has(label)) return;

      if (!language) {
        setMessage(dictionary.required);
        return;
      }

      window.sessionStorage.setItem(
        PENDING_CREATE_SOURCE_LANGUAGE_KEY,
        JSON.stringify({
          language,
          startedAt: Date.now(),
          sourcePath: stripUiLocalePrefix(window.location.pathname),
        })
      );
    }

    document.addEventListener("click", rememberCreateSelection, true);
    return () => document.removeEventListener("click", rememberCreateSelection, true);
  }, [dictionary.required, language, seriesId]);

  async function persistLanguage(nextLanguage: SupportedLanguageTag) {
    setLanguage(nextLanguage);
    setMessage("");
    window.dispatchEvent(
      new CustomEvent("libread:source-language-selection-changed", {
        detail: { language: nextLanguage },
      })
    );

    if (!seriesId || saving || nextLanguage === savedLanguage) return;

    setSaving(true);
    try {
      const response = await fetch(
        `/api/series/${encodeURIComponent(seriesId)}/source-language`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ language: nextLanguage }),
        }
      );
      const payload = (await response.json()) as {
        ok?: boolean;
        language?: unknown;
      };
      const saved = parseSupportedLanguageTag(payload.language);
      if (!response.ok || !payload.ok || !saved) {
        setLanguage(savedLanguage ?? nextLanguage);
        setMessage(dictionary.failed);
        return;
      }
      setLanguage(saved);
      setSavedLanguage(saved);
      setMessage(dictionary.saved);
      router.refresh();
    } catch {
      setLanguage(savedLanguage ?? nextLanguage);
      setMessage(dictionary.failed);
    } finally {
      setSaving(false);
    }
  }

  const languageLabel = language
    ? `${LANGUAGE_REGISTRY[language].nativeLabel} / ${LANGUAGE_REGISTRY[language].label}`
    : dictionary.unset;

  const status = statusHost
    ? createPortal(
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className={[
            "rounded-2xl border px-3 py-3 text-left transition",
            open
              ? "border-sky-200 bg-sky-50"
              : "border-black/10 bg-white hover:bg-neutral-50",
          ].join(" ")}
          aria-expanded={open}
        >
          <span className="block text-[11px] tracking-[0.16em] text-neutral-500">
            {dictionary.heading}
          </span>
          <span className="mt-1 block text-sm font-semibold text-black">
            {languageLabel}
          </span>
          <span className="mt-2 block text-xs text-neutral-500">
            {open ? dictionary.close : dictionary.change}
          </span>
        </button>,
        statusHost
      )
    : null;

  const panel = panelHost
    ? createPortal(
        open ? (
          <div className="mt-4 rounded-2xl border border-black/10 bg-white p-4">
            <p className="text-sm font-semibold text-black">{dictionary.heading}</p>
            <p className="mt-1 text-xs leading-6 text-neutral-500">
              {dictionary.help}
            </p>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
              <select
                id="series-source-language"
                value={language}
                disabled={saving}
                aria-invalid={message === dictionary.required}
                aria-describedby={
                  message === dictionary.required
                    ? "series-source-language-error"
                    : undefined
                }
                onChange={(event) => {
                  const next = parseSupportedLanguageTag(event.target.value);
                  if (next) void persistLanguage(next);
                }}
                className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none transition focus:border-sky-300 disabled:opacity-60 sm:max-w-sm"
              >
                {!language ? (
                  <option value="" disabled>
                    {dictionary.placeholder}
                  </option>
                ) : null}
                {SOURCE_LANGUAGE_OPTIONS.map((tag) => {
                  const item = LANGUAGE_REGISTRY[tag];
                  return (
                    <option key={tag} value={tag}>
                      {item.nativeLabel} / {item.label}
                    </option>
                  );
                })}
              </select>
              {seriesId && language && !savedLanguage ? (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void persistLanguage(language)}
                  className="rounded-full bg-black px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
                >
                  {dictionary.confirm}
                </button>
              ) : null}
            </div>
            {seriesId && language && !savedLanguage ? (
              <p className="mt-3 text-xs leading-6 text-amber-700">
                {dictionary.legacyNotice}
              </p>
            ) : null}
            {message ? (
              <p
                id={
                  message === dictionary.required
                    ? "series-source-language-error"
                    : undefined
                }
                role={message === dictionary.saved ? undefined : "alert"}
                className={[
                  "mt-3 text-xs",
                  message === dictionary.saved
                    ? "text-emerald-700"
                    : "text-red-700",
                ].join(" ")}
              >
                {message}
              </p>
            ) : null}
          </div>
        ) : null,
        panelHost
      )
    : null;

  return (
    <>
      <input
        type="hidden"
        data-source-language-select="true"
        value={language}
        readOnly
      />
      {status}
      {panel}
    </>
  );
}
