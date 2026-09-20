import type { Metadata } from "next";
import ReaderSettingsTopBridge from "@/features/playback/ReaderSettingsTopBridge";
import GeneratedStoryReaderShell from "@/features/playback/GeneratedStoryReaderShell";
import GeneratedStoryReaderClient from "./GeneratedStoryReaderClient";
import { getUiLocale } from "@/i18n/server";
import { generatedReaderDictionaries } from "@/i18n/dictionaries/generatedReader";

type PageProps = {
  params: Promise<{
    storyId: string;
  }>;
};

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getUiLocale();
  const dictionary = generatedReaderDictionaries[locale];

  return {
    title: `${dictionary.metadataTitle} | LIB read`,
    robots: {
      index: false,
      follow: false,
    },
  };
}

export default async function GeneratedStoryReadPage({ params }: PageProps) {
  const { storyId } = await params;

  return (
    <>
      <ReaderSettingsTopBridge />
      <GeneratedStoryReaderShell storyId={storyId}>
        <GeneratedStoryReaderClient storyId={storyId} />
      </GeneratedStoryReaderShell>
    </>
  );
}
