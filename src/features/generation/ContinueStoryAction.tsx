"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import PromptTagSuggestions from "@/features/generation/PromptTagSuggestions";
import type { PromptTag } from "@/lib/generation/promptTags";
import { useAiUsage } from "@/features/usage/useAiUsage";
import SubscriptionUpgradePrompt from "@/features/billing/SubscriptionUpgradePrompt";
import {
  formatAiUsage,
  isAiUsageLimitReached,
} from "@/lib/aiUsage/aiUsage";
import { useUiLocale } from "@/i18n/UiLocaleProvider";
import { continuationDictionaries } from "@/i18n/dictionaries/continuation";
import { localizePath } from "@/i18n/navigation";

type TimeMinutes = 5 | 10 | 15 | 20;

type ContinueStoryActionProps = {
  seriesId: string;
  isShortStory: boolean;
};

type ContinueResponse = {
  ok?: boolean;
  message?: string;
  editUrl?: string;
};

const TIME_OPTIONS: TimeMinutes[] = [5, 10, 15, 20];
const CONTINUATION_REQUEST_MAX_LENGTH = 500;

export default function ContinueStoryAction({
  seriesId,
  isShortStory,
}: ContinueStoryActionProps) {
  const router = useRouter();
  const locale = useUiLocale();
  const dictionary = continuationDictionaries[locale];
  const { snapshot: aiUsage, refresh: refreshAiUsage } = useAiUsage();
  const [isOpen, setIsOpen] = useState(false);
  const [requestedMinutes, setRequestedMinutes] = useState<TimeMinutes>(10);
  const [continuationRequest, setContinuationRequest] = useState("");
  const [promptTags, setPromptTags] = useState<PromptTag[]>([]);
  const [isConfirmingConversion, setIsConfirmingConversion] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  async function generateContinuation() {
    if (isGenerating) return;

    const normalizedRequest = continuationRequest.trim();
    if (normalizedRequest.length > CONTINUATION_REQUEST_MAX_LENGTH) {
      setErrorMessage(dictionary.requestTooLong);
      return;
    }

    setIsConfirmingConversion(false);
    setIsGenerating(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const response = await fetch("/api/time-fit-stories/continue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seriesId,
          requestedMinutes,
          ...(normalizedRequest
            ? { continuationRequest: normalizedRequest }
            : {}),
          ...(promptTags.length > 0 ? { promptTags } : {}),
        }),
      });

      const data = (await response.json()) as ContinueResponse;
      await refreshAiUsage();
      if (!response.ok || !data.ok || !data.editUrl) {
        throw new Error(locale === "ja" && data.message ? data.message : dictionary.generationFailed);
      }

      setSuccessMessage(
        locale === "ja" && data.message ? data.message : dictionary.savedAsDraft
      );
      router.push(localizePath(data.editUrl, locale));
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : dictionary.generationFailed
      );
      setIsGenerating(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");

    if (isShortStory) {
      setIsConfirmingConversion(true);
      return;
    }

    void generateContinuation();
  }

  if (!isOpen) {
    return (
      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="inline-flex min-h-11 items-center justify-center rounded-full bg-black px-5 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800"
        >
          {dictionary.openAction}
        </button>
      </div>
    );
  }

  return (
    <>
      <section className="mt-6 rounded-[28px] border border-sky-200 bg-sky-50 p-5 sm:p-6">
        <p className="text-xs tracking-[0.16em] text-neutral-500">CONTINUE</p>
        <h2 className="mt-2 text-xl font-semibold text-black">{dictionary.title}</h2>
        <p className="mt-3 text-sm leading-7 text-neutral-700">
          {dictionary.description}
        </p>

        {isShortStory ? (
          <div className="mt-4 rounded-2xl border border-sky-200 bg-white px-4 py-3 text-sm leading-7 text-neutral-700">
            {dictionary.shortStoryNotice}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="mt-5 grid gap-5">
          <fieldset disabled={isGenerating} className="grid gap-3">
            <legend className="text-sm font-medium text-black">{dictionary.readingTime}</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {TIME_OPTIONS.map((minutes) => {
                const active = requestedMinutes === minutes;
                return (
                  <label
                    key={minutes}
                    className={[
                      "cursor-pointer rounded-2xl border px-3 py-3 text-center text-sm font-medium transition",
                      active
                        ? "border-sky-300 bg-white text-black"
                        : "border-black/10 bg-white/70 text-neutral-600 hover:bg-white",
                    ].join(" ")}
                  >
                    <input
                      type="radio"
                      name="continuation-time"
                      value={minutes}
                      checked={active}
                      onChange={() => setRequestedMinutes(minutes)}
                      className="sr-only"
                    />
                    {dictionary.minutes(minutes)}
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div className="grid min-w-0 gap-2">
            <label
              htmlFor="continuation-request"
              className="text-sm font-medium text-black"
            >
              {dictionary.requestLabel}
            </label>
            <span id="continuation-request-help" className="text-xs leading-6 text-neutral-600">
              {dictionary.requestHelp}
            </span>
            <PromptTagSuggestions
              selectedTags={promptTags}
              onSelectedTagsChange={setPromptTags}
              disabled={isGenerating}
            />
            <textarea
              id="continuation-request"
              value={continuationRequest}
              onChange={(event) => setContinuationRequest(event.target.value)}
              maxLength={CONTINUATION_REQUEST_MAX_LENGTH}
              rows={5}
              disabled={isGenerating}
              aria-describedby="continuation-request-help continuation-request-count"
              placeholder={dictionary.requestPlaceholder}
              className="min-h-32 w-full min-w-0 box-border resize-y rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm leading-6 outline-none transition placeholder:text-neutral-400 focus:border-sky-300 disabled:opacity-60"
            />
            <span id="continuation-request-count" className="text-right text-xs text-neutral-500">
              {continuationRequest.length} / {CONTINUATION_REQUEST_MAX_LENGTH} {dictionary.characters}
            </span>
          </div>

          {errorMessage ? (
            <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">
              {errorMessage}
            </p>
          ) : null}

          {successMessage ? (
            <p aria-live="polite" className="rounded-2xl border border-sky-200 bg-white px-4 py-3 text-sm leading-6 text-neutral-700">
              {successMessage}
            </p>
          ) : null}

          {isGenerating ? (
            <p aria-live="polite" className="rounded-2xl border border-sky-200 bg-white px-4 py-3 text-sm leading-6 text-neutral-700">
              {dictionary.generatingHelp}
            </p>
          ) : null}

          {isAiUsageLimitReached(aiUsage?.actions.story_generation) &&
          !aiUsage?.isSubscriber ? (
            <SubscriptionUpgradePrompt />
          ) : null}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              disabled={isGenerating}
              className="min-h-11 rounded-full border border-black/10 bg-white px-5 py-3 text-sm text-neutral-700 transition hover:bg-neutral-50 disabled:opacity-50"
            >
              {dictionary.back}
            </button>
            <button
              type="submit"
              disabled={
                isGenerating ||
                isAiUsageLimitReached(aiUsage?.actions.story_generation)
              }
              className="min-h-11 rounded-full bg-black px-5 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isGenerating
                ? dictionary.generating
                : isShortStory
                  ? `${dictionary.convertAndContinue} ${formatAiUsage(aiUsage?.actions.story_generation)}`
                  : `${dictionary.continueStory} ${formatAiUsage(aiUsage?.actions.story_generation)}`}
            </button>
          </div>
        </form>
      </section>

      {isConfirmingConversion ? (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/45 p-4 sm:items-center"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target && !isGenerating) {
              setIsConfirmingConversion(false);
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="continuation-conversion-title"
            className="max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-[28px] bg-white p-5 shadow-2xl sm:p-6"
          >
            <h2 id="continuation-conversion-title" className="text-xl font-semibold text-black">
              {dictionary.conversionTitle}
            </h2>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-7 text-neutral-700">
              {dictionary.conversionItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setIsConfirmingConversion(false)}
                disabled={isGenerating}
                className="min-h-11 rounded-full border border-black/10 bg-white px-5 py-3 text-sm text-neutral-700 transition hover:bg-neutral-50 disabled:opacity-50"
              >
                {dictionary.back}
              </button>
              <button
                type="button"
                onClick={() => void generateContinuation()}
                disabled={
                  isGenerating ||
                  isAiUsageLimitReached(aiUsage?.actions.story_generation)
                }
                className="min-h-11 rounded-full bg-black px-5 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:opacity-50"
              >
                {dictionary.convertAndContinue} {formatAiUsage(aiUsage?.actions.story_generation)}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
