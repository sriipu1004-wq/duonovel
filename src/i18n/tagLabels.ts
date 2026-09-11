import type { UiLocale } from "./config";

type TagEntry = {
  canonical: string;
  labels: Record<UiLocale, string>;
  aliases?: string[];
};

const TAG_CATALOG: TagEntry[] = [
  {
    canonical: "AI生成",
    labels: { ja: "AI生成", en: "AI generated", ko: "AI 생성" },
    aliases: ["AI-generated", "AI generated", "AI 생성"],
  },
  {
    canonical: "時間指定AI短編",
    labels: {
      ja: "時間指定AI短編",
      en: "Timed AI short story",
      ko: "시간 지정 AI 단편",
    },
    aliases: ["Timed-AI-short", "Timed AI short", "시간 지정 AI 단편"],
  },
  {
    canonical: "ホラー",
    labels: { ja: "ホラー", en: "Horror", ko: "공포" },
  },
  {
    canonical: "静か",
    labels: { ja: "静か", en: "Quiet", ko: "조용함" },
  },
  {
    canonical: "通勤",
    labels: { ja: "通勤", en: "Commute", ko: "출퇴근" },
  },
  {
    canonical: "静かな雰囲気",
    labels: {
      ja: "静かな雰囲気",
      en: "Quiet atmosphere",
      ko: "조용한 분위기",
    },
  },
  {
    canonical: "通勤向け",
    labels: { ja: "通勤向け", en: "For commuting", ko: "출퇴근용" },
  },
  {
    canonical: "暴力描写あり",
    labels: {
      ja: "暴力描写あり",
      en: "Violence",
      ko: "폭력 묘사 있음",
    },
  },
  {
    canonical: "R18",
    labels: { ja: "R18", en: "R18", ko: "R18" },
  },
];

function stripHash(value: string): string {
  return value.trim().replace(/^#+/u, "").trim();
}

function normalized(value: string): string {
  return stripHash(value).replace(/\s+/gu, " ").toLocaleLowerCase("en-US");
}

const aliasToCanonical = new Map<string, string>();
for (const entry of TAG_CATALOG) {
  const candidates = [
    entry.canonical,
    ...Object.values(entry.labels),
    ...(entry.aliases ?? []),
  ];
  for (const candidate of candidates) {
    aliasToCanonical.set(normalized(candidate), entry.canonical);
  }
}

function canonicalMinuteTag(value: string): string | null {
  const raw = stripHash(value);
  const ja = raw.match(/^(\d+)分$/u);
  if (ja) return `${ja[1]}分`;
  const en = raw.match(/^(\d+)\s*(?:min|mins|minute|minutes)$/iu);
  if (en) return `${en[1]}分`;
  const ko = raw.match(/^(\d+)분$/u);
  if (ko) return `${ko[1]}分`;
  return null;
}

export function canonicalizeTagLabel(value: string): string {
  const minute = canonicalMinuteTag(value);
  if (minute) return minute;
  return aliasToCanonical.get(normalized(value)) ?? stripHash(value);
}

export function localizeTagLabel(value: string, locale: UiLocale): string {
  const hadHash = value.trim().startsWith("#");
  const canonical = canonicalizeTagLabel(value);
  const minute = canonical.match(/^(\d+)分$/u);

  let label = canonical;
  if (minute) {
    label =
      locale === "ja"
        ? `${minute[1]}分`
        : locale === "en"
          ? `${minute[1]} min`
          : `${minute[1]}분`;
  } else {
    const entry = TAG_CATALOG.find((item) => item.canonical === canonical);
    if (entry) label = entry.labels[locale];
  }

  return hadHash ? `#${label}` : label;
}

export function localizeTagList(values: string[], locale: UiLocale): string[] {
  return values.map((value) => localizeTagLabel(value, locale));
}

export function canonicalizeTagList(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const canonical = canonicalizeTagLabel(value);
    if (!canonical) continue;
    const key = normalized(canonical);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(canonical);
  }
  return result;
}

export function getKnownTagOptions(locale: UiLocale): Array<{
  canonical: string;
  label: string;
}> {
  return TAG_CATALOG.filter((entry) => entry.canonical !== "R18").map((entry) => ({
    canonical: entry.canonical,
    label: entry.labels[locale],
  }));
}
