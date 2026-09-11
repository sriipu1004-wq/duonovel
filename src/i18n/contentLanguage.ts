import type { UiLocale } from "./config";

export const CONTENT_LANGUAGE_FILTER_COOKIE = "libread-content-languages";
export const CONTENT_LANGUAGE_FILTER_HEADER = "x-libread-content-languages";

export const CONTENT_LANGUAGES = ["ja", "en", "ko", "other"] as const;
export type ContentLanguage = (typeof CONTENT_LANGUAGES)[number];

export function isContentLanguage(value: string): value is ContentLanguage {
  return CONTENT_LANGUAGES.includes(value as ContentLanguage);
}

export function parseContentLanguageList(value: string | null | undefined): ContentLanguage[] {
  if (!value) return [];
  return Array.from(
    new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter(isContentLanguage)
    )
  );
}

export function detectContentLanguage(...values: Array<string | null | undefined>): ContentLanguage {
  const text = values.filter(Boolean).join(" ");
  if (!text.trim()) return "other";

  const hangul = (text.match(/[\uac00-\ud7af\u1100-\u11ff\u3130-\u318f]/g) ?? []).length;
  const kana = (text.match(/[\u3040-\u30ff]/g) ?? []).length;
  const cjk = (text.match(/[\u3400-\u9fff]/g) ?? []).length;
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;

  if (hangul > 0 && hangul >= kana * 2) return "ko";
  if (kana > 0 || (cjk > 0 && hangul === 0)) return "ja";
  if (latin >= 4 && latin > hangul + kana + cjk) return "en";
  if (hangul > 0) return "ko";
  if (latin > 0) return "en";
  return "other";
}

export function preferredContentLanguageForUi(locale: UiLocale): ContentLanguage {
  return locale;
}

export function contentLanguageLabel(language: ContentLanguage, locale: UiLocale): string {
  const table: Record<UiLocale, Record<ContentLanguage, string>> = {
    ja: { ja: "日本語", en: "英語", ko: "韓国語", other: "その他" },
    en: { ja: "Japanese", en: "English", ko: "Korean", other: "Other" },
    ko: { ja: "일본어", en: "영어", ko: "한국어", other: "기타" },
  };
  return table[locale][language];
}
