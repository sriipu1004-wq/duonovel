"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import PromptTagSuggestions from "@/features/generation/PromptTagSuggestions";
import { getPromptTagsInText } from "@/lib/generation/promptTags";
import { useAiUsage } from "@/features/usage/useAiUsage";
import SubscriptionUpgradePrompt from "@/features/billing/SubscriptionUpgradePrompt";
import {
  formatAiUsage,
  isAiUsageLimitReached,
} from "@/lib/aiUsage/aiUsage";

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

type GenerateApiRequest = GenerateRequest & {
  customRequest?: string;
  promptTags?: string[];
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
const DEFAULT_MOOD = "指定なし";

const CUSTOM_REQUEST_MAX_LENGTH = 500;

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
  const { snapshot: aiUsage, refresh: refreshAiUsage } = useAiUsage();

  const [scene, setScene] = useState<(typeof SCENE_OPTIONS)[number]>("通勤");
  const [timeMinutes, setTimeMinutes] = useState<TimeMinutes>(10);
  const [genre, setGenre] = useState<(typeof GENRE_OPTIONS)[number]>("ホラー");
  const [customRequest, setCustomRequest] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const currentRequest = useMemo<GenerateRequest>(
    () => ({
      scene,
      timeMinutes,
      genre,
      mood: DEFAULT_MOOD,
    }),
    [scene, timeMinutes, genre]
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isGenerating) {
      return;
    }

    const normalizedCustomRequest = customRequest.trim();
    const promptTags = getPromptTagsInText(normalizedCustomRequest);

    if (normalizedCustomRequest.length > CUSTOM_REQUEST_MAX_LENGTH) {
      setErrorMessage("追加の希望は500文字以内で入力してください。");
      return;
    }

    const requestBody: GenerateApiRequest = {
      ...currentRequest,
      ...(normalizedCustomRequest
        ? { customRequest: normalizedCustomRequest }
        : {}),
      ...(promptTags.length > 0
        ? { promptTags }
        : {}),
    };

    setErrorMessage("");
    setIsGenerating(true);

    try {
      const response = await fetch("/api/time-fit-stories/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      const data = (await response.json()) as GenerateResponse;
      await refreshAiUsage();

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
        時間、利用シーン、ジャンルを選ぶと、その場で読める短編を生成します。
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

        <div className="grid gap-2">
          <label
            htmlFor="custom-request"
            className="text-sm font-medium text-black"
          >
            追加の希望（任意）
          </label>
          <span
            id="custom-request-help"
            className="text-xs leading-6 text-neutral-500"
          >
            登場人物、舞台、展開、結末、文体など、物語への希望を自由に入力できます。
          </span>
          <PromptTagSuggestions
            value={customRequest}
            onChange={setCustomRequest}
            maxLength={CUSTOM_REQUEST_MAX_LENGTH}
            disabled={isGenerating}
          />
          <textarea
            id="custom-request"
            value={customRequest}
            onChange={(event) => setCustomRequest(event.target.value)}
            maxLength={CUSTOM_REQUEST_MAX_LENGTH}
            rows={5}
            disabled={isGenerating}
            aria-describedby="custom-request-help custom-request-count"
            placeholder="例：雨の夜の無人駅を舞台にして、最後は少し救いのある結末にしてください。"
            className="min-h-32 w-full box-border resize-y rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm leading-6 outline-none transition placeholder:text-neutral-400 focus:border-sky-300 disabled:opacity-60"
          />
          <span
            id="custom-request-count"
            className="text-right text-xs text-neutral-500"
          >
            {customRequest.length} / {CUSTOM_REQUEST_MAX_LENGTH}文字
          </span>
        </div>

        <button
          type="submit"
          disabled={
            isGenerating ||
            isAiUsageLimitReached(aiUsage?.actions.story_generation)
          }
          aria-busy={isGenerating}
          className="rounded-full bg-black px-5 py-3 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-400"
        >
          {isGenerating
            ? "生成中..."
            : `物語を生成する ${formatAiUsage(aiUsage?.actions.story_generation)}`}
        </button>

        {isAiUsageLimitReached(aiUsage?.actions.story_generation) &&
        !aiUsage?.isSubscriber ? (
          <SubscriptionUpgradePrompt />
        ) : null}

        <p className="text-xs leading-6 text-neutral-500">
          AI小説生成は新規と続編を合算し、毎日0時（日本時間）に回復します。公開投稿や永続保存にはログインが必要です。
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
