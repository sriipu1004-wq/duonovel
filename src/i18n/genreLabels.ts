import type { UiLocale } from "./config";

type GenreEntry = {
  canonical: string;
  labels: Record<UiLocale, string>;
  aliases?: string[];
};

const GENRE_CATALOG: GenreEntry[] = [
  { canonical: "文芸", labels: { ja: "文芸", en: "Literary fiction", ko: "문예" }, aliases: ["Literary", "Literary fiction", "문학", "문예"] },
  { canonical: "恋愛", labels: { ja: "恋愛", en: "Romance", ko: "로맨스" } },
  { canonical: "ミステリー", labels: { ja: "ミステリー", en: "Mystery", ko: "미스터리" } },
  { canonical: "ファンタジー", labels: { ja: "ファンタジー", en: "Fantasy", ko: "판타지" } },
  { canonical: "ダークファンタジー", labels: { ja: "ダークファンタジー", en: "Dark fantasy", ko: "다크 판타지" } },
  { canonical: "SF", labels: { ja: "SF", en: "SF", ko: "SF" } },
  { canonical: "ホラー", labels: { ja: "ホラー", en: "Horror", ko: "공포" } },
  { canonical: "歴史", labels: { ja: "歴史", en: "Historical", ko: "역사" }, aliases: ["Historical", "History", "역사"] },
  { canonical: "児童文学", labels: { ja: "児童文学", en: "Children's literature", ko: "아동문학" }, aliases: ["Children's literature", "Children literature", "아동 문학"] },
  { canonical: "冒険", labels: { ja: "冒険", en: "Adventure", ko: "모험" } },
  { canonical: "青春", labels: { ja: "青春", en: "Coming of age", ko: "청춘" } },
  { canonical: "コメディ", labels: { ja: "コメディ", en: "Comedy", ko: "코미디" } },
  { canonical: "随筆・評論", labels: { ja: "随筆・評論", en: "Essays & criticism", ko: "수필·평론" }, aliases: ["Essays", "Essay", "Criticism", "수필", "평론"] },
  { canonical: "詩歌", labels: { ja: "詩歌", en: "Poetry", ko: "시" }, aliases: ["Poetry", "시가", "시"] },
  { canonical: "その他", labels: { ja: "その他", en: "Other", ko: "기타" } },
];

function clean(value: string): string {
  return value.trim().replace(/\s+/gu, " ");
}

function normalized(value: string): string {
  return clean(value).toLocaleLowerCase("en-US");
}

const aliasToCanonical = new Map<string, string>();
for (const entry of GENRE_CATALOG) {
  const candidates = [
    entry.canonical,
    ...Object.values(entry.labels),
    ...(entry.aliases ?? []),
  ];
  for (const candidate of candidates) {
    aliasToCanonical.set(normalized(candidate), entry.canonical);
  }
}

export function canonicalizeGenreLabel(value: string): string {
  const raw = clean(value);
  return aliasToCanonical.get(normalized(raw)) ?? raw;
}

export function localizeGenreLabel(value: string, locale: UiLocale): string {
  const canonical = canonicalizeGenreLabel(value);
  return GENRE_CATALOG.find((item) => item.canonical === canonical)?.labels[locale] ?? canonical;
}

export function canonicalizeGenreList(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const canonical = canonicalizeGenreLabel(value);
    if (!canonical) continue;
    const key = normalized(canonical);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(canonical);
  }
  return result;
}

export function localizeGenreList(values: string[], locale: UiLocale): string[] {
  return values.map((value) => localizeGenreLabel(value, locale));
}

export function getKnownGenreOptions(locale: UiLocale): Array<{ canonical: string; label: string }> {
  return GENRE_CATALOG.map((entry) => ({
    canonical: entry.canonical,
    label: entry.labels[locale],
  }));
}
