"use client";

import {
  getSupportedLanguage,
  isPublicTranslationTargetLanguage,
  parseSupportedLanguageTag,
  PUBLIC_TRANSLATION_TARGET_LANGUAGES,
  type PublicTranslationTargetLanguage,
} from "@/lib/translation/languageRegistry";

type TranslationLanguageSelectProps = {
  value: PublicTranslationTargetLanguage;
  onChange: (language: PublicTranslationTargetLanguage) => void;
  disabled?: boolean;
};

export default function TranslationLanguageSelect({
  value,
  onChange,
  disabled = false,
}: TranslationLanguageSelectProps) {
  return (
    <label className="flex items-center gap-2 rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs text-neutral-600">
      <span className="shrink-0">対訳言語</span>
      <select
        aria-label="対訳言語"
        value={value}
        disabled={disabled}
        onChange={(event) => {
          const language = parseSupportedLanguageTag(event.target.value);
          if (language && isPublicTranslationTargetLanguage(language)) {
            onChange(language);
          }
        }}
        className="min-w-0 max-w-28 bg-transparent font-medium text-black outline-none disabled:cursor-not-allowed disabled:opacity-50 sm:max-w-none"
      >
        {PUBLIC_TRANSLATION_TARGET_LANGUAGES.map((language) => (
          <option key={language} value={language}>
            {getSupportedLanguage(language).nativeLabel}
          </option>
        ))}
      </select>
    </label>
  );
}
