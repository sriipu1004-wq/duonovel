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
  { canonical: "ホラー", labels: { ja: "ホラー", en: "Horror", ko: "공포" } },
  { canonical: "コメディ", labels: { ja: "コメディ", en: "Comedy", ko: "코미디" } },
  { canonical: "恋愛", labels: { ja: "恋愛", en: "Romance", ko: "로맨스" } },
  { canonical: "SF", labels: { ja: "SF", en: "SF", ko: "SF" } },
  { canonical: "ミステリー", labels: { ja: "ミステリー", en: "Mystery", ko: "미스터리" } },
  { canonical: "ファンタジー", labels: { ja: "ファンタジー", en: "Fantasy", ko: "판타지" } },
  { canonical: "ダークファンタジー", labels: { ja: "ダークファンタジー", en: "Dark fantasy", ko: "다크 판타지" } },
  { canonical: "癒し", labels: { ja: "癒し", en: "Comfort", ko: "힐링" } },
  { canonical: "通勤", labels: { ja: "通勤", en: "Commute", ko: "출퇴근" } },
  { canonical: "休憩", labels: { ja: "休憩", en: "Break", ko: "휴식" } },
  { canonical: "睡眠導入", labels: { ja: "睡眠導入", en: "Bedtime", ko: "수면 유도" } },
  { canonical: "作業前", labels: { ja: "作業前", en: "Before work", ko: "작업 전" } },
  { canonical: "その他", labels: { ja: "その他", en: "Other", ko: "기타" } },
  { canonical: "静か", labels: { ja: "静か", en: "Quiet", ko: "조용함" } },
  { canonical: "少し怖い", labels: { ja: "少し怖い", en: "Slightly scary", ko: "조금 무서운" } },
  { canonical: "泣ける", labels: { ja: "泣ける", en: "Emotional", ko: "눈물 나는" } },
  { canonical: "優しい", labels: { ja: "優しい", en: "Gentle", ko: "따뜻한 분위기" } },
  { canonical: "不穏", labels: { ja: "不穏", en: "Ominous", ko: "불안한 분위기" } },
  { canonical: "明るい", labels: { ja: "明るい", en: "Bright", ko: "밝은" } },
  {
    canonical: "静かな雰囲気",
    labels: { ja: "静かな雰囲気", en: "Quiet atmosphere", ko: "조용한 분위기" },
  },
  { canonical: "通勤向け", labels: { ja: "通勤向け", en: "For commuting", ko: "출퇴근용" } },
  { canonical: "暗め", labels: { ja: "暗め", en: "Dark", ko: "어두운 분위기" } },
  { canonical: "女学生", labels: { ja: "女学生", en: "Female student", ko: "여학생" } },
  { canonical: "教室", labels: { ja: "教室", en: "Classroom", ko: "교실" } },
  { canonical: "雨の夜", labels: { ja: "雨の夜", en: "Rainy night", ko: "비 오는 밤" } },
  { canonical: "男子学生", labels: { ja: "男子学生", en: "Male student", ko: "남학생" } },
  { canonical: "放課後", labels: { ja: "放課後", en: "After school", ko: "방과 후" } },
  { canonical: "無人駅", labels: { ja: "無人駅", en: "Empty station", ko: "무인역" } },
  { canonical: "切ない", labels: { ja: "切ない", en: "Bittersweet", ko: "애절함" } },
  { canonical: "大学生", labels: { ja: "大学生", en: "University student", ko: "대학생" } },
  { canonical: "社会人", labels: { ja: "社会人", en: "Working adult", ko: "직장인" } },
  { canonical: "幼なじみ", labels: { ja: "幼なじみ", en: "Childhood friends", ko: "소꿉친구" } },
  { canonical: "人外", labels: { ja: "人外", en: "Non-human", ko: "인외" } },
  { canonical: "子ども", labels: { ja: "子ども", en: "Child", ko: "어린이" } },
  { canonical: "老人", labels: { ja: "老人", en: "Elderly person", ko: "노인" } },
  { canonical: "学校", labels: { ja: "学校", en: "School", ko: "학교" } },
  { canonical: "海辺", labels: { ja: "海辺", en: "Seaside", ko: "해변" } },
  { canonical: "古い洋館", labels: { ja: "古い洋館", en: "Old mansion", ko: "오래된 서양식 저택" } },
  { canonical: "近未来都市", labels: { ja: "近未来都市", en: "Near-future city", ko: "근미래 도시" } },
  { canonical: "異世界", labels: { ja: "異世界", en: "Isekai", ko: "이세계" } },
  { canonical: "宇宙船", labels: { ja: "宇宙船", en: "Spaceship", ko: "우주선" } },
  { canonical: "幻想的", labels: { ja: "幻想的", en: "Dreamlike", ko: "환상적" } },
  { canonical: "緊張感", labels: { ja: "緊張感", en: "Tense", ko: "긴장감" } },
  { canonical: "明るめ", labels: { ja: "明るめ", en: "Light", ko: "밝은 분위기" } },
  { canonical: "コメディ調", labels: { ja: "コメディ調", en: "Comedic", ko: "코미디풍" } },
  { canonical: "会話多め", labels: { ja: "会話多め", en: "Dialogue-heavy", ko: "대화 많음" } },
  { canonical: "一人称", labels: { ja: "一人称", en: "First person", ko: "1인칭" } },
  { canonical: "どんでん返し", labels: { ja: "どんでん返し", en: "Plot twist", ko: "반전" } },
  { canonical: "恋愛要素", labels: { ja: "恋愛要素", en: "Romance elements", ko: "로맨스 요소" } },
  { canonical: "怪異", labels: { ja: "怪異", en: "Supernatural", ko: "괴이" } },
  { canonical: "ハッピーエンド", labels: { ja: "ハッピーエンド", en: "Happy ending", ko: "해피 엔딩" } },
  {
    canonical: "救いのある結末",
    labels: { ja: "救いのある結末", en: "Hopeful ending", ko: "구원이 있는 결말" },
  },
  { canonical: "バッドエンド", labels: { ja: "バッドエンド", en: "Bad ending", ko: "배드 엔딩" } },
  {
    canonical: "謎を残す",
    labels: { ja: "謎を残す", en: "Unresolved mystery", ko: "수수께끼를 남김" },
  },
  {
    canonical: "暴力描写あり",
    labels: { ja: "暴力描写あり", en: "Violence", ko: "폭력 묘사 있음" },
  },
  { canonical: "短編", labels: { ja: "短編", en: "Short stories", ko: "단편" } },
  { canonical: "心理", labels: { ja: "心理", en: "Psychological", ko: "심리" } },
  { canonical: "風刺", labels: { ja: "風刺", en: "Satire", ko: "풍자" } },
  { canonical: "欲望", labels: { ja: "欲望", en: "Desire", ko: "욕망" } },
  { canonical: "歴史", labels: { ja: "歴史", en: "Historical", ko: "역사" } },
  { canonical: "芸術", labels: { ja: "芸術", en: "Art", ko: "예술" } },
  { canonical: "狂気", labels: { ja: "狂気", en: "Madness", ko: "광기" } },
  { canonical: "自伝", labels: { ja: "自伝", en: "Autobiographical", ko: "자전적" } },
  { canonical: "青春", labels: { ja: "青春", en: "Coming of age", ko: "청춘" } },
  { canonical: "幻覚", labels: { ja: "幻覚", en: "Hallucination", ko: "환각" } },
  { canonical: "思索", labels: { ja: "思索", en: "Reflection", ko: "사색" } },
  { canonical: "箴言", labels: { ja: "箴言", en: "Aphorisms", ko: "잠언" } },
  { canonical: "社会批評", labels: { ja: "社会批評", en: "Social criticism", ko: "사회 비평" } },
  { canonical: "日常", labels: { ja: "日常", en: "Everyday life", ko: "일상" } },
  { canonical: "動物", labels: { ja: "動物", en: "Animals", ko: "동물" } },
  { canonical: "喪失", labels: { ja: "喪失", en: "Loss", ko: "상실" } },
  { canonical: "人間関係", labels: { ja: "人間関係", en: "Relationships", ko: "인간관계" } },
  { canonical: "罪悪感", labels: { ja: "罪悪感", en: "Guilt", ko: "죄책감" } },
  { canonical: "旅", labels: { ja: "旅", en: "Travel", ko: "여행" } },
  { canonical: "夫婦", labels: { ja: "夫婦", en: "Marriage", ko: "부부" } },
  { canonical: "家族", labels: { ja: "家族", en: "Family", ko: "가족" } },
  { canonical: "戦後", labels: { ja: "戦後", en: "Postwar", ko: "전후" } },
  { canonical: "没落", labels: { ja: "没落", en: "Decline", ko: "몰락" } },
  { canonical: "郷土", labels: { ja: "郷土", en: "Homeland", ko: "향토" } },
  { canonical: "鎌倉", labels: { ja: "鎌倉", en: "Kamakura period", ko: "가마쿠라" } },
  { canonical: "人物", labels: { ja: "人物", en: "Biographical", ko: "인물" } },
  { canonical: "友情", labels: { ja: "友情", en: "Friendship", ko: "우정" } },
  { canonical: "死", labels: { ja: "死", en: "Death", ko: "죽음" } },
  { canonical: "自然", labels: { ja: "自然", en: "Nature", ko: "자연" } },
  { canonical: "科学", labels: { ja: "科学", en: "Science", ko: "과학" } },
  { canonical: "農業", labels: { ja: "農業", en: "Agriculture", ko: "농업" } },
  { canonical: "自己犠牲", labels: { ja: "自己犠牲", en: "Self-sacrifice", ko: "자기희생" } },
  { canonical: "詩", labels: { ja: "詩", en: "Poetry", ko: "시" } },
  { canonical: "不思議", labels: { ja: "不思議", en: "Wonder", ko: "신비" } },
  { canonical: "探偵", labels: { ja: "探偵", en: "Detective", ko: "탐정" } },
  { canonical: "冒険", labels: { ja: "冒険", en: "Adventure", ko: "모험" } },
  { canonical: "サスペンス", labels: { ja: "サスペンス", en: "Suspense", ko: "서스펜스" } },
  { canonical: "怪奇", labels: { ja: "怪奇", en: "Macabre", ko: "괴기" } },
  { canonical: "孤独", labels: { ja: "孤独", en: "Isolation", ko: "고독" } },
  { canonical: "夢", labels: { ja: "夢", en: "Dreams", ko: "꿈" } },
  { canonical: "猫", labels: { ja: "猫", en: "Cats", ko: "고양이" } },
  { canonical: "個人主義", labels: { ja: "個人主義", en: "Individualism", ko: "개인주의" } },
  { canonical: "回想", labels: { ja: "回想", en: "Memoir", ko: "회상" } },
  { canonical: "貧困", labels: { ja: "貧困", en: "Poverty", ko: "빈곤" } },
  { canonical: "結婚", labels: { ja: "結婚", en: "Marriage", ko: "결혼" } },
  { canonical: "抑圧", labels: { ja: "抑圧", en: "Oppression", ko: "억압" } },
  { canonical: "社会", labels: { ja: "社会", en: "Society", ko: "사회" } },
  { canonical: "童話", labels: { ja: "童話", en: "Fairy tale", ko: "동화" } },
  { canonical: "対話", labels: { ja: "対話", en: "Dialogue", ko: "대화" } },
  { canonical: "少女", labels: { ja: "少女", en: "Girl", ko: "소녀" } },
  { canonical: "少年", labels: { ja: "少年", en: "Boy", ko: "소년" } },
  { canonical: "悲劇", labels: { ja: "悲劇", en: "Tragedy", ko: "비극" } },
  { canonical: "都市", labels: { ja: "都市", en: "Urban life", ko: "도시" } },
    { canonical: "R18", labels: { ja: "R18", en: "R18", ko: "R18" } },
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
