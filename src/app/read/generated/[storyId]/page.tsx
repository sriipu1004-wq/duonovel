import type { Metadata } from "next";
import GeneratedStoryBilingualBridge from "@/features/playback/GeneratedStoryBilingualBridge";
import GeneratedStoryBilingualPlayback from "@/features/playback/GeneratedStoryBilingualPlayback";
import ReaderSettingsTopBridge from "@/features/playback/ReaderSettingsTopBridge";
import GeneratedStoryReaderClient from "./GeneratedStoryReaderClient";
import {
  isPublicTranslationTargetLanguage,
  parseSupportedLanguageTag,
} from "@/lib/translation/languageRegistry";

type PageProps = {
  params: Promise<{
    storyId: string;
  }>;
  searchParams?: Promise<{
    bilingual?: string;
    sourceLanguage?: string;
    targetLanguage?: string;
    autoGenerate?: string;
  }>;
};

export const metadata: Metadata = {
  title: "一時生成の物語 | LIB read",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function GeneratedStoryReadPage({
  params,
  searchParams,
}: PageProps) {
  const { storyId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const bilingual = resolvedSearchParams?.bilingual === "1";

  if (bilingual) {
    const sourceLanguage =
      parseSupportedLanguageTag(resolvedSearchParams?.sourceLanguage) ?? "ja";
    const parsedTarget = parseSupportedLanguageTag(resolvedSearchParams?.targetLanguage);
    const targetLanguage =
      parsedTarget &&
      parsedTarget !== sourceLanguage &&
      isPublicTranslationTargetLanguage(parsedTarget)
        ? parsedTarget
        : sourceLanguage === "ja" ? "en" : "ja";
    return (
      <GeneratedStoryBilingualPlayback
        storyId={storyId}
        sourceLanguage={sourceLanguage}
        initialTargetLanguage={targetLanguage}
        autoGenerateMissingTranslation={resolvedSearchParams?.autoGenerate === "1"}
        targetLanguageLocked={resolvedSearchParams?.autoGenerate === "1"}
      />
    );
  }

  return (
    <>
      <ReaderSettingsTopBridge />
      <GeneratedStoryBilingualBridge storyId={storyId} />
      <GeneratedStoryReaderClient storyId={storyId} />
    </>
  );
}
