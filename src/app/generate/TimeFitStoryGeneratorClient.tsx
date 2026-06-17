"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type TimeMinutes = 5 | 10 | 15 | 20;

type TimeFitStory = {
  title: string;
  synopsis: string;
  body: string;
  estimatedReadingMinutes: number;
  tags: string[];
  aiGenerated: true;
};

type GenerateRequest = {
  scene: string;
  timeMinutes: TimeMinutes;
  genre: string;
  mood: string;
};

type GeneratedStoryPayload = {
  id: string;
  createdAt: string;
  request: GenerateRequest;
  story: TimeFitStory;
};

type GenerateResponse =
  | {
      ok: true;
      story: TimeFitStory;
      request: GenerateRequest;
    }
  | {
      ok: false;
      error: string;
      message?: string;
      limitType?: string;
    };

const TIME_OPTIONS = [5, 10, 15, 20] as const;
const SCENE_OPTIONS = ["通勤", "休憩", "睡眠導入", "作業前", "その他"] as const;
const GENRE_OPTIONS = [
  "ホラー",
  "コメディ",
  "恋愛",
  "SF",
  "ミステリー",
  "ファンタジー",
  "癒し",
] as const;
const MOOD_OPTIONS = [
  "静か",
  "少し怖い",
  "泣ける",
  "優しい",
  "不穏",
  "明るい",
] as const;

function generateStoryId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function buildGeneratedStoryStorageKey(storyId: string): string {
  return `libread.generatedStory.${storyId}`;
}

function readGenerateErrorMessage(data: GenerateResponse): string {
  if (data.ok) {
    return "";
  }

  return data.message?.trim() || data.error || "AI短編の生成に失敗しました。";
}

export default function TimeFitStoryGeneratorClient() {
  const router = useRouter();

  const [scene, setScene] = useState<(typeof SCENE_OPTIONS)[number]>("通勤");
  const [timeMinutes, setTimeMinutes] = useState<TimeMinutes>(10);
  const [genre, setGenre] = useState<(typeof GENRE_OPTIONS)[number]>("ホラー");
  const [mood, setMood] = useState<(typeof MOOD_OPTIONS)[number]>("静か");
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const currentRequest = useMemo<GenerateRequest>(
    () => ({
      scene,
      timeMinutes,
      genre,
      mood,
    }),
    [scene, timeMinutes, genre, mood]
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isGenerating) {
      return;
    }

    setErrorMessage("");
    setIsGenerating(true);

    try {
      const response = await fetch("/api/time-fit-stories/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(currentRequest),
      });

      const data = (await response.json()) as GenerateResponse;

      if (!response.ok || !data.ok) {
        setErrorMessage(readGenerateErrorMessage(data));
        return;
      }

      const storyId = generateStoryId();
      const payload: GeneratedStoryPayload = {
        id: storyId,
        createdAt: new Date().toISOString(),
        request: data.request,
        story: data.story,
      };

      window.sessionStorage.setItem(
        buildGeneratedStoryStorageKey(storyId),
        JSON.stringify(payload)
      );

      router.push(`/read/generated/${encodeURIComponent(storyId)}`);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "AI短編の生成中にエラーが発生しました。"
      );
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <section className="rounded-[28px] border border-black/10 bg-white p-5 shadow-sm sm:p-7">
      <p className="text-[11px] tracking-[0.24em] text-neutral-500">
        TIME FIT AI STORY
      </p>

      <h1 className="mt-3 text-2xl font-bold leading-tight text-black sm:text-3xl">
        空き時間に合わせて物語を生成する
      </h1>

      <p className="mt-3 text-sm leading-7 text-neutral-600">
        時間、利用シーン、ジャンル、雰囲気を選ぶと、その場で読める短編を生成します。
        生成後は読むページへ移動します。保存しない限り、生成結果はこのブラウザ内の一時データとして扱われます。
      </p>

      <form onSubmit={handleSubmit} className="mt-7 grid gap-5">
        <label className="grid gap-2">
          <span className="text-sm font-medium text-black">時間</span>
          <select
            value={timeMinutes}
            onChange={(event) =>
              setTimeMinutes(Number(event.target.value) as TimeMinutes)
            }
            className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm outline-none transition focus:border-sky-300"
          >
            {TIME_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}分
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-2">
          <span className="text-sm font-medium text-black">利用シーン</span>
          <select
            value={scene}
            onChange={(event) => setScene(event.target.value as typeof scene)}
            className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm outline-none transition focus:border-sky-300"
          >
            {SCENE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-2">
          <span className="text-sm font-medium text-black">ジャンル</span>
          <select
            value={genre}
            onChange={(event) => setGenre(event.target.value as typeof genre)}
            className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm outline-none transition focus:border-sky-300"
          >
            {GENRE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-2">
          <span className="text-sm font-medium text-black">雰囲気</span>
          <select
            value={mood}
            onChange={(event) => setMood(event.target.value as typeof mood)}
            className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm outline-none transition focus:border-sky-300"
          >
            {MOOD_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <button
          type="submit"
          disabled={isGenerating}
          aria-busy={isGenerating}
          className="rounded-full bg-black px-5 py-3 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-400"
        >
          {isGenerating ? "生成中..." : "物語を生成する"}
        </button>

        <p className="text-xs leading-6 text-neutral-500">
          生成コスト防衛のため、未ログイン生成は直近24時間で3回までです。
          20分の物語生成はログイン後に利用できます。公開投稿や永続保存にはログインが必要です。
        </p>
      </form>

      {errorMessage ? (
        <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-7 text-red-700">
          {errorMessage}
        </div>
      ) : null}
    </section>
  );
}
