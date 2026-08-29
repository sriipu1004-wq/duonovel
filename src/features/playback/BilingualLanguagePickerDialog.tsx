"use client";

import TranslationLanguageSelect from "@/features/playback/TranslationLanguageSelect";
import SubscriptionUpgradePrompt from "@/features/billing/SubscriptionUpgradePrompt";
import type { AiActionUsage } from "@/lib/aiUsage/aiUsage";
import {
  formatAiUsage,
  isAiUsageLimitReached,
} from "@/lib/aiUsage/aiUsage";
import type {
  PublicTranslationTargetLanguage,
  SupportedLanguageTag,
} from "@/lib/translation/languageRegistry";

export type BilingualTranslationAvailability =
  | "checking"
  | "ready"
  | "missing"
  | "stale"
  | "failed"
  | "translating"
  | "error";

type BilingualLanguagePickerDialogProps = {
  sourceLanguage: SupportedLanguageTag;
  targetLanguage: PublicTranslationTargetLanguage;
  availability: BilingualTranslationAvailability;
  rememberForTab: boolean;
  showRememberForTab: boolean;
  translationUsage?: AiActionUsage | null;
  isSubscriber?: boolean;
  onTargetLanguageChange: (
    language: PublicTranslationTargetLanguage
  ) => void;
  onRememberForTabChange: (checked: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
  onRetry: () => void;
};

function actionLabel(
  availability: BilingualTranslationAvailability,
  translationUsage?: AiActionUsage | null
): string {
  if (availability === "ready") return "対訳を開く";
  if (availability === "checking") return "対訳を確認中…";
  if (availability === "translating") return "対訳を準備中…";
  if (availability === "error") return "状態をもう一度確認";
  return `${availability === "missing" ? "対訳を生成" : "対訳を再生成"} ${formatAiUsage(translationUsage)}`;
}

export default function BilingualLanguagePickerDialog({
  sourceLanguage,
  targetLanguage,
  availability,
  rememberForTab,
  showRememberForTab,
  translationUsage,
  isSubscriber = false,
  onTargetLanguageChange,
  onRememberForTabChange,
  onCancel,
  onConfirm,
  onRetry,
}: BilingualLanguagePickerDialogProps) {
  const requiresGeneration =
    availability === "missing" ||
    availability === "stale" ||
    availability === "failed";
  const generationLimitReached =
    requiresGeneration && isAiUsageLimitReached(translationUsage);
  const actionDisabled =
    availability === "checking" ||
    availability === "translating" ||
    generationLimitReached;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 px-4 py-8">
      <section
        className="w-full max-w-md rounded-[28px] border border-black/10 bg-white p-6 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bilingual-language-picker-title"
      >
        <h2
          id="bilingual-language-picker-title"
          className="text-xl font-semibold text-black"
        >
          対訳する言語を選択
        </h2>
        <p className="mt-2 text-sm leading-7 text-neutral-600">
          保存済み対訳がある場合はそのまま開き、ない場合だけ生成します。
        </p>

        <div className="mt-5">
          <TranslationLanguageSelect
            value={targetLanguage}
            sourceLanguage={sourceLanguage}
            onChange={onTargetLanguageChange}
          />
        </div>

        {showRememberForTab ? (
          <label className="mt-5 flex cursor-pointer items-center gap-3 text-sm font-medium text-black">
            <input
              type="checkbox"
              checked={rememberForTab}
              onChange={(event) => onRememberForTabChange(event.target.checked)}
              className="h-4 w-4 accent-violet-500"
            />
            <span>次からはこの作品で表示せず対訳する</span>
          </label>
        ) : null}

        {availability === "ready" ? (
          <p className="mt-4 text-xs text-emerald-700">保存済み対訳があります。</p>
        ) : null}
        {availability === "error" ? (
          <p className="mt-4 text-xs text-red-700">
            対訳の保存状況を確認できませんでした。
          </p>
        ) : null}
        {generationLimitReached ? (
          isSubscriber ? (
            <p className="mt-4 text-xs text-red-700">
              現在のサブスク生成上限に達しています。
            </p>
          ) : (
            <SubscriptionUpgradePrompt compact className="mt-4" />
          )
        ) : null}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-black/10 px-5 py-2.5 text-sm text-neutral-700"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={availability === "error" ? onRetry : onConfirm}
            disabled={actionDisabled}
            className="rounded-full bg-black px-5 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {actionLabel(availability, translationUsage)}
          </button>
        </div>
      </section>
    </div>
  );
}
