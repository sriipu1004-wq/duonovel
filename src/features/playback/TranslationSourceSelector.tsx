"use client";

import { useUiLocale } from "@/i18n/UiLocaleProvider";
import type { SupportedLanguageTag } from "@/lib/translation/languageRegistry";

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
  episodeId: string;
  targetLanguage: SupportedLanguageTag;
  onChange: (value: string) => void;
};

const COPY = {
  ja: {
    label: "翻訳を選択",
    ai: "AI翻訳",
    human: (name: string) => "Human — " + name,
    author: "作者による翻訳",
    report: "翻訳を報告",
  },
  en: {
    label: "Translation source",
    ai: "AI translation",
    human: (name: string) => "Human — " + name,
    author: "Author translation",
    report: "Report translation",
  },
  ko: {
    label: "번역 선택",
    ai: "AI 번역",
    human: (name: string) => "Human — " + name,
    author: "작가 번역",
    report: "번역 신고",
  },
} as const;

export default function TranslationSourceSelector({
  value,
  humanTranslations,
  showAi,
  episodeId,
  targetLanguage,
  onChange,
}: Props) {
  const copy = COPY[useUiLocale()];
  if (humanTranslations.length === 0) return null;
  const selectedHuman = value.startsWith("human:")
    ? humanTranslations.find((option) => "human:" + option.id === value) ?? null
    : null;
  const reportHref = selectedHuman
    ? "mailto:libread08@gmail.com?subject=" +
      encodeURIComponent("LIB read Human translation report") +
      "&body=" +
      encodeURIComponent(
        [
          "Human translation ID: " + selectedHuman.id,
          "Translator ID: " + selectedHuman.translatorId,
          "Episode ID: " + episodeId,
          "Target language: " + targetLanguage,
          "",
          "Please describe the spam, abuse, copyright, or other issue below:",
        ].join("\n")
      )
    : null;

  return (
    <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
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
      {reportHref ? (
        <a
          href={reportHref}
          className="text-xs text-neutral-500 underline underline-offset-2 hover:text-black"
        >
          {copy.report}
        </a>
      ) : null}
    </div>
  );
}
