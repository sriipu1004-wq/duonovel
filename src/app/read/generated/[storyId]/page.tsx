import type { Metadata } from "next";
import GeneratedStoryBilingualBridge from "@/features/playback/GeneratedStoryBilingualBridge";
import ReaderSettingsTopBridge from "@/features/playback/ReaderSettingsTopBridge";
import GeneratedStoryReaderClient from "./GeneratedStoryReaderClient";

type PageProps = {
  params: Promise<{
    storyId: string;
  }>;
};

export const metadata: Metadata = {
  title: "一時生成の物語 | LIB read",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function GeneratedStoryReadPage({ params }: PageProps) {
  const { storyId } = await params;

  return (
    <>
      <ReaderSettingsTopBridge />
      <GeneratedStoryBilingualBridge storyId={storyId} />
      <GeneratedStoryReaderClient storyId={storyId} />
    </>
  );
}
