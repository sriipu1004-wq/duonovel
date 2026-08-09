"use client";

import { useEffect, useMemo, useState } from "react";
import {
  PROMPT_TAGS,
  appendPromptTag,
  getPromptTagsInText,
  removePromptTag,
  type PromptTag,
} from "@/lib/generation/promptTags";

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

  return (
    <div className="grid gap-2" aria-label="追加の希望タグ">
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
              #{label}
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
        {isExpanded ? "表示を減らす" : "さらに表示"}
      </button>
    </div>
  );
}
