import type { Metadata } from "next";
import GeneratedStoryBilingualBridge from "@/features/playback/GeneratedStoryBilingualBridge";
import GeneratedStoryBilingualPlayback from "@/features/playback/GeneratedStoryBilingualPlayback";
import ReaderSettingsTopBridge from "@/features/playback/ReaderSettingsTopBridge";
import GeneratedStoryReaderClient from "./GeneratedStoryReaderClient";

type PageProps = {
  params: Promise<{
    storyId: string;
  }>;
  searchParams?: Promise<{
    bilingual?: string;
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
    return <GeneratedStoryBilingualPlayback storyId={storyId} />;
  }

  return (
    <>
      <ReaderSettingsTopBridge />
      <GeneratedStoryBilingualBridge storyId={storyId} />
      <GeneratedStoryReaderClient storyId={storyId} />
    </>
  );
}
