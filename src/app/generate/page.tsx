import TimeFitStoryGeneratorClient from "./TimeFitStoryGeneratorClient";

export const metadata = {
  title: "時間フィットAI物語生成 | LIB read",
  description:
    "空き時間、ジャンル、雰囲気を選ぶだけで、約5分・10分・15分・20分で聴ける短編小説を生成します。",
};

export default function GeneratePage() {
  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto w-full max-w-2xl px-4 pb-24 pt-10 sm:px-6">
        <TimeFitStoryGeneratorClient />
      </div>
    </main>
  );
}