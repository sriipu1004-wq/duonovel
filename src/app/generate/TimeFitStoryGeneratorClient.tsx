"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import PromptTagSuggestions from "@/features/generation/PromptTagSuggestions";
import { getPromptTagsInText } from "@/lib/generation/promptTags";
import { useAiUsage } from "@/features/usage/useAiUsage";
import SubscriptionUpgradePrompt from "@/features/billing/SubscriptionUpgradePrompt";
import {
  formatAiUsage,
  isAiUsageLimitReached,
} from "@/lib/aiUsage/aiUsage";
import {
  LANGUAGE_REGISTRY,
  getSupportedLanguage,
  type SupportedLanguageTag,
} from "@/lib/translation/languageRegistry";
import {
  TRANSLATION_LEARNING_LEVELS,
  type TranslationLearningLevel,
} from "@/lib/translation/translationLearningPreference";
import { useUiLocale } from "@/i18n/UiLocaleProvider";
import { generateDictionaries } from "@/i18n/dictionaries/generate";
import { localizePath } from "@/i18n/navigation";
import type { UiLocale } from "@/i18n/config";

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
  learningLanguage?: SupportedLanguageTag;
  learningLevel?: TranslationLearningLevel;
  translationLearningRequest?: string;
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
  | { ok: true; story: TimeFitStory; request: GenerateRequest }
  | { ok: false; error: string; message?: string; limitType?: string };

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
const TRANSLATION_LEARNING_REQUEST_MAX_LENGTH = 300;
const LEARNING_LANGUAGES = Object.keys(LANGUAGE_REGISTRY) as SupportedLanguageTag[];

const disclosureLabels: Record<UiLocale, { more: string; less: string; optional: string }> = {
  ja: { more: "さらに表示", less: "閉じる", optional: "未選択でも生成できます" },
  en: { more: "Show more", less: "Show less", optional: "You can leave this unselected" },
  ko: { more: "더 보기", less: "접기", optional: "선택하지 않아도 생성할 수 있습니다" },
};

function ExpandableChoiceGroup<T extends string>({
  label,
  options,
  value,
  onChange,
  getLabel,
  locale,
}: {
  label: string;
  options: readonly T[];
  value: T | "";
  onChange: (value: T | "") => void;
  getLabel: (value: T) => string;
  locale: UiLocale;
}) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [hasOverflow, setHasOverflow] = useState(false);
  const copy = disclosureLabels[locale];

  useEffect(() => {
    const element = listRef.current;
    if (!element) return;

    const measure = () => {
      if (expanded) return;
      setHasOverflow(element.scrollHeight > element.clientHeight + 2);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [expanded, options.length]);

  return (
    <fieldset className="grid gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <legend className="text-sm font-medium text-black">{label}</legend>
        <span className="text-xs text-neutral-500">{copy.optional}</span>
      </div>
      <div
        ref={listRef}
        className={[
          "flex flex-wrap gap-2",
          expanded ? "" : "max-h-[76px] overflow-hidden",
        ].join(" ")}
      >
        {options.map((option) => {
          const active = value === option;
          return (
            <button
              key={option}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(active ? "" : option)}
              className={[
                "rounded-full border px-4 py-2 text-sm transition",
                active
                  ? "border-black bg-black text-white"
                  : "border-black/10 bg-white text-neutral-700 hover:border-sky-200 hover:bg-sky-50 hover:text-black",
              ].join(" ")}
            >
              {getLabel(option)}
            </button>
          );
        })}
      </div>
      {hasOverflow || expanded ? (
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          className="w-fit text-xs text-neutral-500 underline decoration-black/20 underline-offset-4 transition hover:text-black"
        >
          {expanded ? copy.less : copy.more}
        </button>
      ) : null}
    </fieldset>
  );
}

function generateStoryId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function buildGeneratedStoryStorageKey(storyId: string): string {
  return `libread.generatedStory.${storyId}`;
}

function readGenerateErrorMessage(data: GenerateResponse, fallback: string): string {
  if (data.ok) return "";
  return data.message?.trim() || data.error || fallback;
}

export default function TimeFitStoryGeneratorClient() {
  const router = useRouter();
  const locale = useUiLocale();
  const dictionary = generateDictionaries[locale];
  const { snapshot: aiUsage, refresh: refreshAiUsage } = useAiUsage();

  const [scene, setScene] = useState<(typeof SCENE_OPTIONS)[number] | "">("");
  const [timeMinutes, setTimeMinutes] = useState<TimeMinutes>(10);
  const [genre, setGenre] = useState<(typeof GENRE_OPTIONS)[number] | "">("");
  const [customRequest, setCustomRequest] = useState("");
  const [learningLanguage, setLearningLanguage] = useState<SupportedLanguageTag | "">("");
  const [learningLevel, setLearningLevel] = useState<TranslationLearningLevel>("beginner");
  const [translationLearningRequest, setTranslationLearningRequest] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const currentRequest = useMemo<GenerateRequest>(
    () => ({
      scene,
      timeMinutes,
      genre,
      mood: DEFAULT_MOOD,
      ...(learningLanguage
        ? {
            learningLanguage,
            learningLevel,
            ...(translationLearningRequest.trim()
              ? { translationLearningRequest: translationLearningRequest.trim() }
              : {}),
          }
        : {}),
    }),
    [scene, timeMinutes, genre, learningLanguage, learningLevel, translationLearningRequest]
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isGenerating) return;

    const normalizedCustomRequest = customRequest.trim();
    const promptTags = getPromptTagsInText(normalizedCustomRequest);

    if (normalizedCustomRequest.length > CUSTOM_REQUEST_MAX_LENGTH) {
      setErrorMessage(dictionary.customTooLong);
      return;
    }
    if (translationLearningRequest.trim().length > TRANSLATION_LEARNING_REQUEST_MAX_LENGTH) {
      setErrorMessage(dictionary.translationTooLong);
      return;
    }

    const requestBody: GenerateApiRequest = {
      ...currentRequest,
      ...(normalizedCustomRequest ? { customRequest: normalizedCustomRequest } : {}),
      ...(promptTags.length > 0 ? { promptTags } : {}),
    };

    setErrorMessage("");
    setIsGenerating(true);

    try {
      const response = await fetch("/api/time-fit-stories/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      const data = (await response.json()) as GenerateResponse;
      await refreshAiUsage();

      if (!response.ok || !data.ok) {
        setErrorMessage(readGenerateErrorMessage(data, dictionary.generationFailed));
        return;
      }

      const storyId = generateStoryId();
      const payload: GeneratedStoryPayload = {
        id: storyId,
        createdAt: new Date().toISOString(),
        request: data.request,
        story: data.story,
      };
      window.sessionStorage.setItem(buildGeneratedStoryStorageKey(storyId), JSON.stringify(payload));
      router.push(localizePath(`/read/generated/${encodeURIComponent(storyId)}`, locale));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : dictionary.generationError);
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <section className="rounded-[28px] border border-black/10 bg-white p-5 shadow-sm sm:p-7">
      <p className="text-[11px] tracking-[0.24em] text-neutral-500">TIME FIT AI STORY</p>
      <h1 className="mt-3 text-2xl font-bold leading-tight text-black sm:text-3xl">{dictionary.title}</h1>
      <p className="mt-3 text-sm leading-7 text-neutral-600">{dictionary.description}</p>

      <form onSubmit={handleSubmit} className="mt-7 grid gap-5">
        <label className="grid gap-2">
          <span className="text-sm font-medium text-black">{dictionary.time}</span>
          <select
            value={timeMinutes}
            onChange={(event) => setTimeMinutes(Number(event.target.value) as TimeMinutes)}
            className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm outline-none transition focus:border-sky-300"
          >
            {TIME_OPTIONS.map((option) => (
              <option key={option} value={option}>{dictionary.minutes(option)}</option>
            ))}
          </select>
        </label>

        <ExpandableChoiceGroup
          label={dictionary.scene}
          options={SCENE_OPTIONS}
          value={scene}
          onChange={setScene}
          getLabel={(option) => dictionary.scenes[option]}
          locale={locale}
        />

        <ExpandableChoiceGroup
          label={dictionary.genre}
          options={GENRE_OPTIONS}
          value={genre}
          onChange={setGenre}
          getLabel={(option) => dictionary.genres[option]}
          locale={locale}
        />

        <fieldset className="grid gap-4 rounded-[24px] border border-black/10 bg-neutral-50 p-4 sm:grid-cols-2">
          <legend className="px-2 text-sm font-medium text-black">{dictionary.learningTitle}</legend>
          <label className="grid gap-2">
            <span className="text-sm text-neutral-700">{dictionary.learningLanguage}</span>
            <select
              value={learningLanguage}
              onChange={(event) => setLearningLanguage(event.target.value as SupportedLanguageTag | "")}
              className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm outline-none transition focus:border-sky-300"
            >
              <option value="">{dictionary.none}</option>
              {LEARNING_LANGUAGES.filter((language) => language !== "ja").map((language) => (
                <option key={language} value={language}>{getSupportedLanguage(language).nativeLabel}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-2">
            <span className="text-sm text-neutral-700">{dictionary.difficulty}</span>
            <select
              value={learningLevel}
              disabled={!learningLanguage}
              onChange={(event) => setLearningLevel(event.target.value as TranslationLearningLevel)}
              className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm outline-none transition focus:border-sky-300 disabled:opacity-50"
            >
              {TRANSLATION_LEARNING_LEVELS.map((level) => (
                <option key={level} value={level}>{dictionary.levels[level]}</option>
              ))}
            </select>
          </label>
          <p className="text-xs leading-6 text-neutral-500 sm:col-span-2">{dictionary.learningHelp}</p>
          {learningLanguage ? (
            <label className="grid gap-2 sm:col-span-2">
              <span className="text-sm text-neutral-700">{dictionary.translationRequest}</span>
              <textarea
                value={translationLearningRequest}
                onChange={(event) => setTranslationLearningRequest(event.target.value)}
                maxLength={TRANSLATION_LEARNING_REQUEST_MAX_LENGTH}
                rows={3}
                disabled={isGenerating}
                placeholder={dictionary.translationPlaceholder}
                className="w-full resize-y rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm leading-6 outline-none transition placeholder:text-neutral-400 focus:border-sky-300 disabled:opacity-60"
              />
              <span className="text-right text-xs text-neutral-500">
                {translationLearningRequest.length} / {TRANSLATION_LEARNING_REQUEST_MAX_LENGTH} {dictionary.chars}
              </span>
            </label>
          ) : null}
        </fieldset>

        <div className="grid gap-2">
          <label htmlFor="custom-request" className="text-sm font-medium text-black">{dictionary.customRequest}</label>
          <span id="custom-request-help" className="text-xs leading-6 text-neutral-500">{dictionary.customHelp}</span>
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
            placeholder={dictionary.customPlaceholder}
            className="min-h-32 w-full box-border resize-y rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm leading-6 outline-none transition placeholder:text-neutral-400 focus:border-sky-300 disabled:opacity-60"
          />
          <span id="custom-request-count" className="text-right text-xs text-neutral-500">
            {customRequest.length} / {CUSTOM_REQUEST_MAX_LENGTH} {dictionary.chars}
          </span>
        </div>

        <button
          type="submit"
          disabled={isGenerating || isAiUsageLimitReached(aiUsage?.actions.story_generation)}
          aria-busy={isGenerating}
          className="rounded-full bg-black px-5 py-3 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-400"
        >
          {isGenerating ? dictionary.generating : `${dictionary.generate} ${formatAiUsage(aiUsage?.actions.story_generation)}`}
        </button>

        {isAiUsageLimitReached(aiUsage?.actions.story_generation) && !aiUsage?.isSubscriber ? (
          <SubscriptionUpgradePrompt />
        ) : null}

        <p className="text-xs leading-6 text-neutral-500">{dictionary.limitHelp}</p>
      </form>

      {errorMessage ? (
        <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-7 text-red-700">
          {errorMessage}
        </div>
      ) : null}
    </section>
  );
}
