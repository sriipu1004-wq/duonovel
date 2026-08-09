export const PROMPT_TAGS = [
  "暗め",
  "女学生",
  "教室",
  "雨の夜",
  "不穏",
  "男子学生",
  "放課後",
  "無人駅",
  "切ない",
  "優しい",
  "大学生",
  "社会人",
  "幼なじみ",
  "人外",
  "子ども",
  "老人",
  "学校",
  "海辺",
  "古い洋館",
  "近未来都市",
  "異世界",
  "宇宙船",
  "幻想的",
  "緊張感",
  "明るめ",
  "コメディ調",
  "会話多め",
  "一人称",
  "どんでん返し",
  "恋愛要素",
  "怪異",
  "ハッピーエンド",
  "救いのある結末",
  "バッドエンド",
  "謎を残す",
] as const;

export type PromptTag = (typeof PROMPT_TAGS)[number];

const PROMPT_TAG_SET = new Set<string>(PROMPT_TAGS);
const HASHTAG_PATTERN = /#([^\s#、。，,.!?！？]+)/gu;

export function normalizePromptTags(value: unknown): PromptTag[] {
  if (!Array.isArray(value)) return [];

  const normalized = new Set<PromptTag>();
  for (const item of value) {
    if (typeof item !== "string" || !PROMPT_TAG_SET.has(item)) continue;
    normalized.add(item as PromptTag);
  }

  return Array.from(normalized);
}

export function getPromptTagsInText(value: string): PromptTag[] {
  const found = new Set<string>();
  for (const match of value.matchAll(HASHTAG_PATTERN)) {
    found.add(match[1]);
  }

  return PROMPT_TAGS.filter((tag) => found.has(tag));
}

export function appendPromptTag(
  value: string,
  tag: PromptTag,
  maxLength: number
): string {
  if (getPromptTagsInText(value).includes(tag)) return value;

  const trimmedEnd = value.trimEnd();
  const nextValue = `${trimmedEnd}${trimmedEnd ? " " : ""}#${tag}`;
  return nextValue.length <= maxLength ? nextValue : value;
}

export function removePromptTag(value: string, tag: PromptTag): string {
  const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `(^|\\s)#${escapedTag}(?=$|\\s|[、。，,.!?！？])`,
    "gu"
  );

  return value
    .replace(pattern, "$1")
    .replace(/ {2,}/g, " ")
    .replace(/ +\n/g, "\n")
    .trimEnd();
}
