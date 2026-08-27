import type { ParsedBookImport } from "@/lib/library/bookImport";
import type { SupportedLanguageTag } from "@/lib/translation/languageRegistry";

const MAX_SAMPLE_CHARS = 24_000;

const LATIN_LANGUAGE_WORDS: Record<"en" | "fr" | "de" | "es", Set<string>> = {
  en: new Set([
    "the", "and", "that", "with", "from", "this", "were", "have", "not",
    "for", "you", "his", "her", "she", "was", "but", "they", "said",
  ]),
  fr: new Set([
    "le", "la", "les", "des", "une", "un", "et", "que", "qui", "dans",
    "pour", "pas", "sur", "avec", "elle", "il", "était", "mais", "son",
  ]),
  de: new Set([
    "der", "die", "das", "den", "dem", "ein", "eine", "und", "ist", "war",
    "nicht", "mit", "auf", "für", "sie", "er", "aber", "von", "zu",
  ]),
  es: new Set([
    "el", "la", "los", "las", "una", "un", "y", "que", "de", "en", "por",
    "para", "con", "no", "ella", "él", "era", "pero", "su",
  ]),
};

const TRADITIONAL_CHINESE_MARKERS = /[體國學會發後裡這們為說時對個來還過開關無萬與專業東書車門風雲龍臺灣]/gu;
const SIMPLIFIED_CHINESE_MARKERS = /[体国学会发后里这们为说时对个来还过开关无万与专业东书车门风云龙台湾]/gu;

function countMatches(value: string, pattern: RegExp): number {
  return value.match(pattern)?.length ?? 0;
}

function buildSample(parsed: ParsedBookImport): string {
  let sample = "";

  for (const unit of parsed.units) {
    if (sample.length >= MAX_SAMPLE_CHARS) break;
    sample += `\n${unit.title}\n${unit.body}`;
  }

  return sample.slice(0, MAX_SAMPLE_CHARS);
}

function detectLatinLanguage(value: string): SupportedLanguageTag {
  const words = value
    .toLocaleLowerCase()
    .match(/[a-zà-öø-ÿß]+/gu) ?? [];
  const scores = Object.entries(LATIN_LANGUAGE_WORDS).map(([language, markers]) => ({
    language: language as "en" | "fr" | "de" | "es",
    score: words.reduce((total, word) => total + (markers.has(word) ? 1 : 0), 0),
  }));

  scores.find((item) => item.language === "fr")!.score +=
    countMatches(value, /[àâçéèêëîïôùûüÿœæ]/giu) * 0.75;
  scores.find((item) => item.language === "de")!.score +=
    countMatches(value, /[äöüß]/giu) * 0.9;
  scores.find((item) => item.language === "es")!.score +=
    countMatches(value, /[áéíóúüñ¿¡]/giu) * 0.75;

  scores.sort((left, right) => right.score - left.score);
  return scores[0]?.score > 0 ? scores[0].language : "en";
}

export function detectSourceLanguageFromText(
  value: string
): SupportedLanguageTag {
  const sample = value.slice(0, MAX_SAMPLE_CHARS);
  const hiraganaKatakana = countMatches(sample, /[ぁ-ゖァ-ヺー]/gu);
  const hangul = countMatches(sample, /[가-힣ㄱ-ㅎㅏ-ㅣ]/gu);
  const han = countMatches(sample, /[一-龯㐀-䶿]/gu);
  const latin = countMatches(sample, /[A-Za-zÀ-ÖØ-öø-ÿß]/gu);

  if (hangul > Math.max(4, hiraganaKatakana * 2)) return "ko";
  if (hiraganaKatakana > 3 && hiraganaKatakana >= han * 0.08) return "ja";

  if (han > Math.max(8, latin * 0.35)) {
    const traditional = countMatches(sample, TRADITIONAL_CHINESE_MARKERS);
    const simplified = countMatches(sample, SIMPLIFIED_CHINESE_MARKERS);
    return traditional > simplified ? "zh-Hant" : "zh-Hans";
  }

  return detectLatinLanguage(sample);
}

export function detectBookSourceLanguage(
  parsed: ParsedBookImport,
  metadataLanguage?: SupportedLanguageTag | null
): SupportedLanguageTag {
  return metadataLanguage ?? detectSourceLanguageFromText(buildSample(parsed));
}
