"use client";

import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import type {
  PublicTranslationTargetLanguage,
  SupportedLanguageTag,
} from "@/lib/translation/languageRegistry";

type WorkLanguageMetadata = {
  seriesId: string;
  sourceLanguage: SupportedLanguageTag | null;
  translationEligible: boolean;
};

type PublicSearchReadIntentContextValue = {
  sourceLanguage: SupportedLanguageTag | null;
  readLanguage: PublicTranslationTargetLanguage | null;
  workMetadata: ReadonlyMap<string, WorkLanguageMetadata>;
};

const PublicSearchReadIntentContext =
  createContext<PublicSearchReadIntentContextValue | null>(null);

export default function PublicSearchReadIntentProvider({
  sourceLanguage,
  readLanguage,
  workMetadata,
  children,
}: {
  sourceLanguage: SupportedLanguageTag | null;
  readLanguage: PublicTranslationTargetLanguage | null;
  workMetadata: WorkLanguageMetadata[];
  children: ReactNode;
}) {
  const metadataMap = useMemo(
    () => new Map(workMetadata.map((item) => [item.seriesId, item] as const)),
    [workMetadata]
  );

  const value = useMemo<PublicSearchReadIntentContextValue>(
    () => ({ sourceLanguage, readLanguage, workMetadata: metadataMap }),
    [sourceLanguage, readLanguage, metadataMap]
  );

  return (
    <PublicSearchReadIntentContext.Provider value={value}>
      {children}
    </PublicSearchReadIntentContext.Provider>
  );
}

export function usePublicSearchReadIntent() {
  return useContext(PublicSearchReadIntentContext);
}
