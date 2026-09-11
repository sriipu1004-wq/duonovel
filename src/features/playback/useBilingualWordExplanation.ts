"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  BilingualWordInsight,
  BilingualWordSelection,
} from "@/features/playback/BilingualPane";
import type { SupportedLanguageTag } from "@/lib/translation/languageRegistry";

type WordExplanationResponse = {
  ok?: boolean;
  expression?: string;
  contextualMeaning?: string;
  oppositeText?: string;
  partOfSpeech?: string;
  usageType?: string;
  note?: string;
  message?: string;
};

const instantWordInsightCache = new Map<string, BilingualWordInsight>();
const MAX_INSTANT_CACHE_ENTRIES = 200;

function rememberInstantInsight(key: string, value: BilingualWordInsight) {
  instantWordInsightCache.delete(key);
  instantWordInsightCache.set(key, value);
  if (instantWordInsightCache.size <= MAX_INSTANT_CACHE_ENTRIES) return;
  const oldestKey = instantWordInsightCache.keys().next().value;
  if (typeof oldestKey === "string") instantWordInsightCache.delete(oldestKey);
}

type UseBilingualWordExplanationArgs = {
  contentType: "private_library" | "episode" | "generated_story";
  contentId: string;
  sourceHash: string | null;
  sourceLanguage: SupportedLanguageTag;
  targetLanguage: SupportedLanguageTag;
  refreshAiUsage: () => Promise<void>;
};

export function useBilingualWordExplanation({
  contentType,
  contentId,
  sourceHash,
  sourceLanguage,
  targetLanguage,
  refreshAiUsage,
}: UseBilingualWordExplanationArgs) {
  const [wordInsight, setWordInsight] =
    useState<BilingualWordInsight | null>(null);
  const selectionVersionRef = useRef(0);
  const pendingRef = useRef(new Map<string, Promise<BilingualWordInsight>>());

  const clearWordInsight = useCallback(() => {
    selectionVersionRef.current += 1;
    setWordInsight(null);
  }, []);

  useEffect(() => {
    selectionVersionRef.current += 1;
    return () => { selectionVersionRef.current += 1; };
  }, [contentId, sourceHash, sourceLanguage, targetLanguage]);

  const selectWord = useCallback(
    async (selection: BilingualWordSelection) => {
      const version = ++selectionVersionRef.current;
      if (!sourceHash) {
        setWordInsight({ ...selection, status: "error", message: "対訳を確認できませんでした。" });
        return;
      }
      const requestKey = JSON.stringify([
        contentType, contentId, sourceHash, sourceLanguage, targetLanguage,
        selection.segmentId, selection.side, selection.text, selection.startOffset,
      ]);
      const instant = instantWordInsightCache.get(requestKey);
      if (instant) {
        setWordInsight(instant);
        return;
      }
      setWordInsight({ ...selection, status: "loading" });
      let pending = pendingRef.current.get(requestKey);
      if (!pending) {
        pending = (async (): Promise<BilingualWordInsight> => {
          try {
            const response = await fetch("/api/word-explanations", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contentType, contentId, sourceHash,
                segmentId: selection.segmentId,
                selectedSide: selection.side,
                selectedText: selection.text,
                selectedOffset: selection.startOffset,
                sourceLanguage, targetLanguage,
              }),
            });
            const payload = (await response.json()) as WordExplanationResponse;
            if (!response.ok || !payload.ok || !(payload.contextualMeaning || payload.oppositeText) || !payload.partOfSpeech) {
              return { ...selection, status: "error", message: payload.message || "文中での意味を確認できませんでした。" };
            }
            const insight: BilingualWordInsight = {
              ...selection, status: "ready",
              expression: payload.expression || selection.text,
              contextualMeaning: payload.contextualMeaning || payload.oppositeText,
              oppositeText: payload.oppositeText,
              partOfSpeech: payload.partOfSpeech,
              usageType: payload.usageType,
              note: payload.note,
            };
            rememberInstantInsight(requestKey, insight);
            return insight;
          } catch {
            return { ...selection, status: "error", message: "文中での意味を確認できませんでした。" };
          } finally {
            void refreshAiUsage();
          }
        })();
        pendingRef.current.set(requestKey, pending);
      }
      const insight = await pending;
      pendingRef.current.delete(requestKey);
      // A previous response must not replace a newer tap or reopen a closed tip.
      if (selectionVersionRef.current === version) setWordInsight(insight);
    },
    [
      contentId,
      contentType,
      refreshAiUsage,
      sourceHash,
      sourceLanguage,
      targetLanguage,
    ]
  );

  return { wordInsight, clearWordInsight, selectWord };
}
