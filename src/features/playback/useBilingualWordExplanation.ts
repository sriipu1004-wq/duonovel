"use client";

import { useCallback, useRef, useState } from "react";
import type {
  BilingualWordInsight,
  BilingualWordSelection,
} from "@/features/playback/BilingualPane";
import type { SupportedLanguageTag } from "@/lib/translation/languageRegistry";

type WordExplanationResponse = {
  ok?: boolean;
  oppositeText?: string;
  partOfSpeech?: string;
  note?: string;
  message?: string;
};

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
  const inFlightKeyRef = useRef<string | null>(null);

  const clearWordInsight = useCallback(() => setWordInsight(null), []);

  const selectWord = useCallback(
    async (selection: BilingualWordSelection) => {
      if (!sourceHash) {
        setWordInsight({
          ...selection,
          status: "error",
          message: "対訳cacheを確認できませんでした。",
        });
        return;
      }

      const requestKey = [
        contentType,
        contentId,
        sourceHash,
        sourceLanguage,
        targetLanguage,
        selection.segmentId,
        selection.side,
        selection.text,
      ].join(":");
      if (inFlightKeyRef.current === requestKey) return;
      inFlightKeyRef.current = requestKey;

      setWordInsight((current) => {
        if (
          current?.status === "loading" &&
          current.segmentId === selection.segmentId &&
          current.side === selection.side &&
          current.text === selection.text
        ) {
          return current;
        }
        return { ...selection, status: "loading" };
      });

      try {
        const response = await fetch("/api/word-explanations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contentType,
            contentId,
            sourceHash,
            segmentId: selection.segmentId,
            selectedSide: selection.side,
            selectedText: selection.text,
            sourceLanguage,
            targetLanguage,
          }),
        });
        const payload = (await response.json()) as WordExplanationResponse;
        if (
          !response.ok ||
          !payload.ok ||
          !payload.oppositeText ||
          !payload.partOfSpeech
        ) {
          setWordInsight({
            ...selection,
            status: "error",
            message: payload.message || "単語の対応を確認できませんでした。",
          });
          void refreshAiUsage();
          return;
        }

        setWordInsight({
          ...selection,
          status: "ready",
          oppositeText: payload.oppositeText,
          partOfSpeech: payload.partOfSpeech,
          note: payload.note,
        });
        void refreshAiUsage();
      } catch {
        setWordInsight({
          ...selection,
          status: "error",
          message: "単語の対応を確認できませんでした。",
        });
      } finally {
        if (inFlightKeyRef.current === requestKey) {
          inFlightKeyRef.current = null;
        }
      }
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
