"use client";

import { useEffect, useState } from "react";
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

const copy = {
  ja: {
    heading: "作品の原文言語",
    help: "UIの表示言語とは別です。この作品が最初に書かれた言語を指定します。",
    placeholder: "原文言語を選択",
    confirm: "この言語を原文言語として確定",
    legacyNotice: "既存作品の推定値です。内容を確認して確定してください。",
    required: "作品を作成する前に原文言語を選択してください。",
    saved: "保存済み",
    failed: "原文言語を更新できませんでした。",
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
  },
  ko: {
    heading: "작품 원문 언어",
    help: "UI 표시 언어와는 별개입니다. 이 작품이 처음 작성된 언어를 지정하세요.",
    placeholder: "원문 언어 선택",
    confirm: "이 언어를 원문 언어로 확정",
    legacyNotice: "기존 작품에서 추정한 값입니다. 내용을 확인한 뒤 확정하세요.",
    required: "작품을 만들기 전에 원문 언어를 선택하세요.",
    saved: "저장됨",
    failed: "원문 언어를 업데이트하지 못했습니다.",
  },
} as const;

type Props = {
  seriesId?: string | null;
  initialLanguage?: SupportedLanguageTag | null;
  confirmed?: boolean;
};

export default function SourceLanguageWorkspaceBridge({
  seriesId,
  initialLanguage = null,
  confirmed = false,
}: Props) {
  const router = useRouter();
  const dictionary = copy[useUiLocale()];
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
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
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
    if (!seriesId || saving) return;
    if (nextLanguage === savedLanguage) return;

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
        message?: string;
      };
      const saved = parseSupportedLanguageTag(payload.language);
      if (!response.ok || !payload.ok || !saved) {
        setLanguage(savedLanguage ?? nextLanguage);
        setMessage(payload.message || dictionary.failed);
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

  return (
    <section className="mx-auto mb-6 w-full max-w-5xl px-4 sm:px-6">
      <div className="rounded-[28px] border border-black/10 bg-white p-5 shadow-sm">
        <p className="text-xs tracking-[0.18em] text-neutral-500">
          SOURCE LANGUAGE
        </p>
        <h2 className="mt-2 text-lg font-semibold text-black">
          {dictionary.heading}
        </h2>
        <p className="mt-2 text-sm leading-7 text-neutral-600">
          {dictionary.help}
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <select
            value={language}
            disabled={saving}
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
            className={`mt-3 text-xs ${
              message === dictionary.saved ? "text-emerald-700" : "text-red-700"
            }`}
          >
            {message}
          </p>
        ) : null}
      </div>
    </section>
  );
}
