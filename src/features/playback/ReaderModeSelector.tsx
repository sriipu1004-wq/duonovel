"use client";

import { useUiLocale } from "@/i18n/UiLocaleProvider";
import { readerDictionaries } from "@/i18n/dictionaries/reader";
import type { ReadingMode } from "@/lib/playback/readingBookmark";

type Props = {
  mode: ReadingMode;
  translationEnabled: boolean;
  onChange: (mode: ReadingMode) => void;
};

export default function ReaderModeSelector({
  mode,
  translationEnabled,
  onChange,
}: Props) {
  const locale = useUiLocale();
  const dictionary = readerDictionaries[locale];
  const readerModeAriaLabel =
    locale === "ja" ? "Readerモード" : locale === "ko" ? "리더 모드" : "Reader mode";
  const options: Array<{ mode: ReadingMode; label: string; disabled?: boolean }> = [
    { mode: "standard", label: dictionary.originalMode },
    {
      mode: "bilingual",
      label: dictionary.bilingualMode,
      disabled: !translationEnabled,
    },
    {
      mode: "translation",
      label: dictionary.translationOnlyMode,
      disabled: !translationEnabled,
    },
  ];

  return (
    <div className="mx-auto w-full max-w-4xl px-3 pt-3 sm:px-6">
      <div
        role="tablist"
        aria-label={readerModeAriaLabel}
        className="grid grid-cols-3 rounded-2xl border border-black/10 bg-white p-1 shadow-sm"
      >
        {options.map((option) => {
          const active = mode === option.mode;
          return (
            <button
              key={option.mode}
              type="button"
              role="tab"
              aria-selected={active}
              disabled={option.disabled}
              onClick={() => onChange(option.mode)}
              className={[
                "min-w-0 rounded-xl px-2 py-2 text-xs font-medium transition sm:text-sm",
                active
                  ? "bg-black text-white"
                  : "text-neutral-700 hover:bg-neutral-50",
                option.disabled ? "cursor-not-allowed opacity-40" : "",
              ].join(" ")}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
