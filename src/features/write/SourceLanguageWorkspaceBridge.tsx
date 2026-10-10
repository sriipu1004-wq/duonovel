"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useUiLocale } from "@/i18n/UiLocaleProvider";
import {
  LANGUAGE_REGISTRY,
  parseSupportedLanguageTag,
  type SupportedLanguageTag,
} from "@/lib/translation/languageRegistry";

const SOURCE_LANGUAGE_OPTIONS = Object.keys(
  LANGUAGE_REGISTRY
) as SupportedLanguageTag[];

const copy = {
  ja: {
    heading: "作品の原文言語",
    help: "UIの表示言語とは別です。この作品が最初に書かれた言語を指定します。",
    placeholder: "原文言語を選択",
    confirm: "この言語を原文言語として確定",
    legacyNotice: "既存作品の推定値です。内容を確認して確定してください。",
    required: "作品を作成する前に原文言語を選択してください。",
    saved: "保存済み",
    cacheWarning: "原文言語は保存されたが、公開一覧のキャッシュ更新に失敗した。表示がしばらく古い可能性がある。",
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
    cacheWarning: "The original language was saved, but the public listing cache could not be refreshed. The listing may be temporarily outdated.",
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
    cacheWarning: "원문 언어는 저장되었지만 공개 목록 캐시를 갱신하지 못했습니다. 목록에 이전 정보가 잠시 표시될 수 있습니다.",
    failed: "원문 언어를 업데이트하지 못했습니다.",
  },
} as const;

type Props = {
  seriesId?: string | null;
  initialLanguage?: SupportedLanguageTag | null;
  confirmed?: boolean;
  embedded?: boolean;
};

export default function SourceLanguageWorkspaceBridge({
  seriesId,
  initialLanguage = null,
  confirmed = false,
  embedded = false,
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
      const detail = (event as CustomEvent<{ language?: unknown; cacheInvalidationFailed?: boolean }>).detail;
      const applied = parseSupportedLanguageTag(detail?.language);
      if (!applied) return;
      setLanguage(applied);
      setSavedLanguage(applied);
      setMessage(detail?.cacheInvalidationFailed
        ? dictionary.cacheWarning
        : dictionary.saved);
      router.refresh();
    }

    window.addEventListener("libread:source-language-applied", handleApplied);
    return () =>
      window.removeEventListener("libread:source-language-applied", handleApplied);
  }, [dictionary.saved, dictionary.cacheWarning, router]);

  async function persistLanguage(nextLanguage: SupportedLanguageTag) {
    setLanguage(nextLanguage);
    setMessage("");
    window.dispatchEvent(
      new CustomEvent("libread:source-language-selection-changed", {
        detail: { language: nextLanguage },
      })
    );
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
        persisted?: boolean;
        language?: unknown;
        message?: string;
      };
      const saved = parseSupportedLanguageTag(payload.language);
      if (payload.persisted === true && saved) {
        setLanguage(saved);
        setSavedLanguage(saved);
        setMessage(dictionary.cacheWarning);
        router.refresh();
        return;
      }
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

  return (
    <section
      className={
        embedded
          ? "w-full"
          : "mx-auto mb-6 w-full max-w-5xl px-4 sm:px-6"
      }
    >
      <div
        className={
          embedded
            ? "rounded-2xl border border-black/10 bg-white p-4"
            : "rounded-[28px] border border-black/10 bg-white p-5 shadow-sm"
        }
      >
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
            id="series-source-language"
            data-source-language-select="true"
            value={language}
            disabled={saving}
            aria-invalid={message === dictionary.required}
            aria-describedby={
              message === dictionary.required ? "series-source-language-error" : undefined
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
              message === dictionary.required ? "series-source-language-error" : undefined
            }
            role={message === dictionary.saved ? undefined : "alert"}
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
