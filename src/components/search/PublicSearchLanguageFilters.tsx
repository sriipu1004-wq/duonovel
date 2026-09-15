"use client";

import { useUiLocale } from "@/i18n/UiLocaleProvider";
import type { UiLocale } from "@/i18n/config";
import {
  LANGUAGE_REGISTRY,
  type PublicTranslationTargetLanguage,
  type SupportedLanguageTag,
} from "@/lib/translation/languageRegistry";
import {
  PUBLIC_SEARCH_READ_LANGUAGES,
  PUBLIC_SEARCH_SOURCE_LANGUAGES,
} from "@/lib/search/publicWorkLanguageFilter";

const copy: Record<UiLocale, {
  source: string;
  read: string;
  all: string;
  hint: string;
}> = {
  ja: {
    source: "原文言語",
    read: "読む言語",
    all: "すべて",
    hint: "原文の言語と、読みたい言語は別々に選べます。",
  },
  en: {
    source: "Original language",
    read: "Read in",
    all: "All",
    hint: "Filter original language and reading language independently.",
  },
  ko: {
    source: "원문 언어",
    read: "읽을 언어",
    all: "전체",
    hint: "원문 언어와 읽을 언어를 각각 선택할 수 있습니다.",
  },
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

type PublicSearchLanguageFiltersProps = {
  sourceLanguage: SupportedLanguageTag | null;
  readLanguage: PublicTranslationTargetLanguage | null;
  onSourceLanguageChange: (language: SupportedLanguageTag | null) => void;
  onReadLanguageChange: (
    language: PublicTranslationTargetLanguage | null
  ) => void;
};

export default function PublicSearchLanguageFilters({
  sourceLanguage,
  readLanguage,
  onSourceLanguageChange,
  onReadLanguageChange,
}: PublicSearchLanguageFiltersProps) {
  const locale = useUiLocale();
  const labels = copy[locale];

  return (
    <div className="mt-6 rounded-[20px] border border-black/10 bg-neutral-50 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium text-black">
          <span>{labels.source}</span>
          <select
            value={sourceLanguage ?? ""}
            onChange={(event) =>
              onSourceLanguageChange(
                (event.target.value as SupportedLanguageTag) || null
              )
            }
            className="h-11 w-full rounded-2xl border border-black/10 bg-white px-3 text-sm text-black outline-none focus:border-sky-200"
          >
            <option value="">{labels.all}</option>
            {PUBLIC_SEARCH_SOURCE_LANGUAGES.map((tag) => (
              <option key={tag} value={tag}>
                {getLanguageLabel(tag, locale)}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-2 text-sm font-medium text-black">
          <span>{labels.read}</span>
          <select
            value={readLanguage ?? ""}
            onChange={(event) =>
              onReadLanguageChange(
                (event.target.value as PublicTranslationTargetLanguage) || null
              )
            }
            className="h-11 w-full rounded-2xl border border-black/10 bg-white px-3 text-sm text-black outline-none focus:border-sky-200"
          >
            <option value="">{labels.all}</option>
            {PUBLIC_SEARCH_READ_LANGUAGES.map((tag) => (
              <option key={tag} value={tag}>
                {getLanguageLabel(tag, locale)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="mt-3 text-xs leading-6 text-neutral-500">{labels.hint}</p>
    </div>
  );
}
