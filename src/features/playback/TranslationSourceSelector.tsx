"use client";

import { useUiLocale } from "@/i18n/UiLocaleProvider";

export type HumanTranslationSourceOption = {
  id: string;
  translatorId: string;
  translatorDisplayName: string;
  isAuthor: boolean;
  publishedAt?: string | null;
  updatedAt?: string | null;
};

type Props = {
  value: string;
  humanTranslations: HumanTranslationSourceOption[];
  showAi: boolean;
  onChange: (value: string) => void;
};

const COPY = {
  ja: {
    label: "翻訳を選択",
    ai: "AI翻訳",
    human: (name: string) => "Human — " + name,
    author: "作者による翻訳",
  },
  en: {
    label: "Translation source",
    ai: "AI translation",
    human: (name: string) => "Human — " + name,
    author: "Author translation",
  },
  ko: {
    label: "번역 선택",
    ai: "AI 번역",
    human: (name: string) => "Human — " + name,
    author: "작가 번역",
  },
} as const;

export default function TranslationSourceSelector({
  value,
  humanTranslations,
  showAi,
  onChange,
}: Props) {
  const copy = COPY[useUiLocale()];
  if (humanTranslations.length === 0) return null;

  return (
    <label className="flex min-w-0 items-center gap-2 rounded-full border border-black/10 bg-white px-3 py-2 text-xs text-neutral-700">
      <span className="shrink-0">{copy.label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-w-0 max-w-[16rem] bg-transparent font-medium text-black outline-none"
      >
        {showAi ? <option value="ai">{copy.ai}</option> : null}
        {humanTranslations.map((option) => (
          <option key={option.id} value={"human:" + option.id}>
            {copy.human(option.translatorDisplayName)}
            {option.isAuthor ? " · " + copy.author : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
