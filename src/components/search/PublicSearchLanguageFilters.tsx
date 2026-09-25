"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  showMore: string;
  close: string;
}> = {
  ja: { title: "言語", showMore: "続きを表示", close: "閉じる" },
  en: { title: "Language", showMore: "Show more", close: "Close" },
  ko: { title: "언어", showMore: "더 보기", close: "닫기" },
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
  countsOverride?: Counts;
};

export default function PublicSearchLanguageFilters({
  sourceLanguages,
  onSourceLanguagesChange,
  countsOverride,
}: PublicSearchLanguageFiltersProps) {
  const locale = useUiLocale();
  const languageChipListRef = useRef<HTMLDivElement | null>(null);
  const [fetchedCounts, setFetchedCounts] = useState<Counts>({});
  const [showAllLanguages, setShowAllLanguages] = useState(false);
  const [hasHiddenLanguages, setHasHiddenLanguages] = useState(false);

  useEffect(() => {
    if (countsOverride) return;

    let cancelled = false;
    void fetch("/api/public/work-language-counts", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload: { counts?: Counts }) => {
        if (!cancelled && payload.counts) setFetchedCounts(payload.counts);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [countsOverride]);

  const counts = countsOverride ?? fetchedCounts;

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

  useEffect(() => {
    if (showAllLanguages) {
      setHasHiddenLanguages(false);
      return;
    }

    const container = languageChipListRef.current;
    if (!container) return;

    const updateOverflow = () => {
      setHasHiddenLanguages(container.scrollHeight > container.clientHeight + 1);
    };

    updateOverflow();
    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(updateOverflow);
    observer.observe(container);
    return () => observer.disconnect();
  }, [orderedLanguages, showAllLanguages]);

  function toggle(language: SupportedLanguageTag) {
    const next = sourceLanguages.includes(language)
      ? sourceLanguages.filter((item) => item !== language)
      : [...sourceLanguages, language];

    onSourceLanguagesChange(
      PUBLIC_SEARCH_SOURCE_LANGUAGES.filter((item) => next.includes(item))
    );
  }

  return (
    <div>
      <p className="text-[11px] tracking-[0.18em] text-neutral-500">
        {copy[locale].title}
      </p>
      <div className="relative mt-2 max-w-full">
        <div
          ref={languageChipListRef}
          className={
            showAllLanguages
              ? "flex flex-wrap gap-2"
              : "flex max-h-[64px] flex-wrap gap-2 overflow-hidden pr-[88px]"
          }
        >
          {orderedLanguages.map((tag) => {
            const active = sourceLanguages.includes(tag);
            const count = Number(counts[tag] ?? 0);
            const disabled = !active && count === 0;
            return (
              <button
                key={tag}
                type="button"
                aria-pressed={active}
                disabled={disabled}
                title={getLanguageLabel(tag, locale)}
                onClick={() => toggle(tag)}
                className={[
                  "inline-flex max-w-full items-center overflow-hidden rounded-full border px-2.5 py-1.5 text-xs leading-tight transition",
                  active
                    ? "border-sky-200 bg-sky-50 text-black"
                    : disabled
                      ? "cursor-not-allowed border-black/5 bg-neutral-50 text-neutral-300"
                      : "border-black/10 bg-white text-neutral-700 hover:border-sky-200 hover:bg-sky-50 hover:text-black",
                ].join(" ")}
              >
                <span className="truncate">{getLanguageLabel(tag, locale)}</span>
                <span className="ml-1.5 shrink-0 text-[10px] text-neutral-400">
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {showAllLanguages ? (
          <div className="mt-2">
            <button
              type="button"
              onClick={() => setShowAllLanguages(false)}
              className="rounded-full border border-black/10 bg-white px-2.5 py-1.5 text-xs text-neutral-600 transition hover:bg-neutral-50"
            >
              {copy[locale].close}
            </button>
          </div>
        ) : hasHiddenLanguages ? (
          <button
            type="button"
            onClick={() => setShowAllLanguages(true)}
            className="absolute bottom-0 right-0 rounded-full border border-black/10 bg-white px-2.5 py-1.5 text-xs text-neutral-600 shadow-[0_0_0_4px_white] transition hover:bg-neutral-50"
          >
            {copy[locale].showMore}
          </button>
        ) : null}
      </div>
    </div>
  );
}
