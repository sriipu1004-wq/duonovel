import type { UiLocale } from "../config";

const ja = {
  exhausted:
    "無料分を使い切りました。月額680円で生成上限を増やし、単語解説を無制限にできます。",
  viewSubscription: "サブスクを見る",
} as const;

type BillingPromptDictionary = { [K in keyof typeof ja]: string };

const en = {
  exhausted:
    "You have used the free allowance. The ¥680/month subscription increases generation limits and removes the daily word-explanation limit.",
  viewSubscription: "View subscription",
} satisfies BillingPromptDictionary;

const ko = {
  exhausted:
    "무료 이용분을 모두 사용했습니다. 월 680엔 구독으로 생성 한도를 늘리고 단어 설명의 일일 횟수 제한을 없앨 수 있습니다.",
  viewSubscription: "구독 보기",
} satisfies BillingPromptDictionary;

export const billingPromptDictionaries: Record<UiLocale, BillingPromptDictionary> = {
  ja,
  en,
  ko,
};
