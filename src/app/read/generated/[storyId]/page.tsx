import GeneratedStoryReaderClient from "./GeneratedStoryReaderClient";

type PageProps = {
  params: Promise<{
    storyId: string;
  }>;
};

export const metadata = {
  title: "生成された物語を読む | LIB read",
  description: "時間フィットAI物語生成で作成された短編を読みます。",
};

export default async function GeneratedStoryReadPage({ params }: PageProps) {
  const { storyId } = await params;

  return (
    <GeneratedStoryReaderClient storyId={storyId} />
  );
}