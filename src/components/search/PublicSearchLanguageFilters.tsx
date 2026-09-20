"use client";

import { useEffect, useMemo, useState } from "react";
import { useUiLocale } from "@/i18n/UiLocaleProvider";
import type { UiLocale } from "@/i18n/config";
import {
  LANGUAGE_REGISTRY,
  type SupportedLanguageTag,
} from "@/lib/translation/languageRegistry";
import {
  PUBLIC_SEARCH_SOURCE_LANGUAGES,
} from "@/lib/search/publicWorkLanguageFilter";

const copy: Record<UiLocale, {
  title: string;
}> = {
  ja: { title: "言語" },
  en: { title: "Language" },
  ko: { title: "언어" },
};

const koreanLanguageLabels: Partial<Record<SupportedLanguageTag, string>> = {
  ja: "일본어",
  en: "영어",
  ko: "한국어",
  fr: "프랑스어",
  de: "독일어",
  es: "스페인어",
  "zh-Hans": "중국어(간체)",
  "zh-Hant": "중국어(번체)",
};

function getLanguageLabel(tag: SupportedLanguageTag, locale: UiLocale): string {
  const language = LANGUAGE_REGISTRY[tag];
  if (locale === "en") return language.label;
  if (locale === "ko") return koreanLanguageLabels[tag] ?? language.nativeLabel;
  return language.nativeLabel;
}

type Counts = Partial<Record<SupportedLanguageTag, number>>;

type PublicSearchLanguageFiltersProps = {
  sourceLanguages: SupportedLanguageTag[];
  onSourceLanguagesChange: (languages: SupportedLanguageTag[]) => void;
};

export default function PublicSearchLanguageFilters({
  sourceLanguages,
  onSourceLanguagesChange,
}: PublicSearchLanguageFiltersProps) {
  const locale = useUiLocale();
  const [counts, setCounts] = useState<Counts>({});

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/public/work-language-counts", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload: { counts?: Counts }) => {
        if (!cancelled && payload.counts) setCounts(payload.counts);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const orderedLanguages = useMemo(() => {
    const preferred = locale as SupportedLanguageTag;
    return [...PUBLIC_SEARCH_SOURCE_LANGUAGES].sort((left, right) => {
      if (left === preferred && right !== preferred) return -1;
      if (right === preferred && left !== preferred) return 1;

      const countDiff = Number(counts[right] ?? 0) - Number(counts[left] ?? 0);
      if (countDiff !== 0) return countDiff;

      return (
        PUBLIC_SEARCH_SOURCE_LANGUAGES.indexOf(left) -
        PUBLIC_SEARCH_SOURCE_LANGUAGES.indexOf(right)
      );
    });
  }, [counts, locale]);

  function toggle(language: SupportedLanguageTag) {
    const next = sourceLanguages.includes(language)
      ? sourceLanguages.filter((item) => item !== language)
      : [...sourceLanguages, language];

    onSourceLanguagesChange(
      PUBLIC_SEARCH_SOURCE_LANGUAGES.filter((item) => next.includes(item))
    );
  }

  return (
    <div className="mt-6">
      <p className="text-[11px] tracking-[0.18em] text-neutral-500">
        {copy[locale].title}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {orderedLanguages.map((tag) => {
          const active = sourceLanguages.includes(tag);
          return (
            <button
              key={tag}
              type="button"
              aria-pressed={active}
              onClick={() => toggle(tag)}
              className={[
                "inline-flex items-center rounded-full border px-3 py-2 text-sm transition",
                active
                  ? "border-sky-300 bg-sky-50 text-black"
                  : "border-black/10 bg-white text-neutral-700 hover:border-sky-200 hover:bg-sky-50",
              ].join(" ")}
            >
              <span>{getLanguageLabel(tag, locale)}</span>
              <span className="ml-1.5 text-[10px] text-neutral-400">
                {Number(counts[tag] ?? 0)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
