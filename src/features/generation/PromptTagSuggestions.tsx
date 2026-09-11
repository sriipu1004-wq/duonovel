"use client";

import { useEffect, useMemo, useState } from "react";
import {
  PROMPT_TAGS,
  appendPromptTag,
  getPromptTagsInText,
  removePromptTag,
  type PromptTag,
} from "@/lib/generation/promptTags";
import { useUiLocale } from "@/i18n/UiLocaleProvider";
import type { UiLocale } from "@/i18n/config";

type PromptTagSuggestionsProps = {
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  disabled?: boolean;
};

type PromptTagResponse = {
  ok?: boolean;
  tags?: Array<{
    label?: unknown;
    useCount?: unknown;
  }>;
};

type RankedPromptTag = {
  label: PromptTag;
  useCount: number;
  defaultIndex: number;
};

const DEFAULT_RANKED_TAGS: RankedPromptTag[] = PROMPT_TAGS.map(
  (label, defaultIndex) => ({ label, useCount: 0, defaultIndex })
);

const PROMPT_TAG_LABELS: Record<UiLocale, Record<PromptTag, string>> = {
  ja: Object.fromEntries(PROMPT_TAGS.map((tag) => [tag, tag])) as Record<
    PromptTag,
    string
  >,
  en: {
    暗め: "Dark",
    女学生: "Female student",
    教室: "Classroom",
    雨の夜: "Rainy night",
    不穏: "Ominous",
    男子学生: "Male student",
    放課後: "After school",
    無人駅: "Empty station",
    切ない: "Bittersweet",
    優しい: "Gentle",
    大学生: "University student",
    社会人: "Working adult",
    幼なじみ: "Childhood friends",
    人外: "Non-human",
    子ども: "Child",
    老人: "Elderly person",
    学校: "School",
    海辺: "Seaside",
    古い洋館: "Old mansion",
    近未来都市: "Near-future city",
    異世界: "Isekai",
    宇宙船: "Spaceship",
    幻想的: "Dreamlike",
    緊張感: "Tense",
    明るめ: "Light",
    コメディ調: "Comedic",
    会話多め: "Dialogue-heavy",
    一人称: "First person",
    どんでん返し: "Plot twist",
    恋愛要素: "Romance elements",
    怪異: "Supernatural",
    ハッピーエンド: "Happy ending",
    救いのある結末: "Hopeful ending",
    バッドエンド: "Bad ending",
    謎を残す: "Unresolved mystery",
  },
  ko: {
    暗め: "어두운 분위기",
    女学生: "여학생",
    教室: "교실",
    雨の夜: "비 오는 밤",
    不穏: "불안한 분위기",
    男子学生: "남학생",
    放課後: "방과 후",
    無人駅: "무인역",
    切ない: "애절함",
    優しい: "따뜻한 분위기",
    大学生: "대학생",
    社会人: "직장인",
    幼なじみ: "소꿉친구",
    人外: "인외",
    子ども: "어린이",
    老人: "노인",
    学校: "학교",
    海辺: "해변",
    古い洋館: "오래된 서양식 저택",
    近未来都市: "근미래 도시",
    異世界: "이세계",
    宇宙船: "우주선",
    幻想的: "환상적",
    緊張感: "긴장감",
    明るめ: "밝은 분위기",
    コメディ調: "코미디풍",
    会話多め: "대화 많음",
    一人称: "1인칭",
    どんでん返し: "반전",
    恋愛要素: "로맨스 요소",
    怪異: "괴이",
    ハッピーエンド: "해피 엔딩",
    救いのある結末: "구원이 있는 결말",
    バッドエンド: "배드 엔딩",
    謎を残す: "수수께끼를 남김",
  },
};

const UI_COPY: Record<UiLocale, { aria: string; more: string; less: string }> = {
  ja: { aria: "追加の希望タグ", more: "さらに表示", less: "表示を減らす" },
  en: { aria: "Story preference tags", more: "Show more", less: "Show less" },
  ko: { aria: "추가 희망 태그", more: "더 보기", less: "접기" },
};

function parseRankedTags(data: PromptTagResponse): RankedPromptTag[] {
  const counts = new Map<string, number>();

  for (const item of data.tags ?? []) {
    if (typeof item.label !== "string") continue;
    const useCount = Number(item.useCount);
    counts.set(
      item.label,
      Number.isFinite(useCount) && useCount >= 0 ? useCount : 0
    );
  }

  return DEFAULT_RANKED_TAGS.map((item) => ({
    ...item,
    useCount: counts.get(item.label) ?? 0,
  })).sort(
    (a, b) => b.useCount - a.useCount || a.defaultIndex - b.defaultIndex
  );
}

export default function PromptTagSuggestions({
  value,
  onChange,
  maxLength,
  disabled = false,
}: PromptTagSuggestionsProps) {
  const locale = useUiLocale();
  const [rankedTags, setRankedTags] = useState(DEFAULT_RANKED_TAGS);
  const [isExpanded, setIsExpanded] = useState(false);
  const selectedTags = useMemo(
    () => new Set(getPromptTagsInText(value)),
    [value]
  );

  useEffect(() => {
    let isCancelled = false;

    async function loadPromptTags() {
      try {
        const response = await fetch("/api/time-fit-stories/prompt-tags");
        const data = (await response.json()) as PromptTagResponse;
        if (!isCancelled && response.ok && data.ok) {
          setRankedTags(parseRankedTags(data));
        }
      } catch {
        // The built-in order remains available when popularity cannot load.
      }
    }

    void loadPromptTags();
    return () => {
      isCancelled = true;
    };
  }, []);

  function toggleTag(tag: PromptTag) {
    if (disabled) return;

    onChange(
      selectedTags.has(tag)
        ? removePromptTag(value, tag)
        : appendPromptTag(value, tag, maxLength)
    );
  }

  const copy = UI_COPY[locale];

  return (
    <div className="grid gap-2" aria-label={copy.aria}>
      <div
        className={[
          "flex flex-wrap gap-2",
          isExpanded ? "" : "max-h-20 overflow-hidden",
        ].join(" ")}
      >
        {rankedTags.map(({ label }) => {
          const isSelected = selectedTags.has(label);
          return (
            <button
              key={label}
              type="button"
              onClick={() => toggleTag(label)}
              disabled={disabled}
              aria-pressed={isSelected}
              className={[
                "min-h-9 rounded-full border px-3 py-2 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
                isSelected
                  ? "border-sky-300 bg-sky-50 text-black"
                  : "border-black/10 bg-white text-neutral-600 hover:border-black/20 hover:bg-neutral-50",
              ].join(" ")}
            >
              #{PROMPT_TAG_LABELS[locale][label]}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => setIsExpanded((current) => !current)}
        disabled={disabled}
        aria-expanded={isExpanded}
        className="w-fit text-xs font-medium text-neutral-600 underline decoration-neutral-300 underline-offset-4 transition hover:text-black disabled:opacity-50"
      >
        {isExpanded ? copy.less : copy.more}
      </button>
    </div>
  );
}
