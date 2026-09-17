import type { UiLocale } from "../config";

const ja = {
  exhausted:
    "Freeの1日の利用枠を使い切りました。PremiumではAI物語生成は1日10回、公開作品の翻訳解放は1日30回、個人本棚への取り込みは日次回数制限なしです。",
  viewSubscription: "Free / Premiumを見る",
} as const;

type BillingPromptDictionary = { [K in keyof typeof ja]: string };

const en = {
  exhausted:
    "You've used the Free included daily allowance. Premium includes up to 10 AI story generations per day, 30 public-translation unlocks per day, and no daily count limit for My Library imports.",
  viewSubscription: "Compare Free and Premium",
} satisfies BillingPromptDictionary;

const ko = {
  exhausted:
    "Free의 포함된 일일 이용 한도를 모두 사용했습니다. Premium은 AI 이야기 생성 하루 최대 10회, 공개 작품 번역 잠금 해제 하루 최대 30회, 개인 서재 가져오기 일일 횟수 제한 없음을 포함합니다.",
  viewSubscription: "Free와 Premium 비교",
} satisfies BillingPromptDictionary;

export const billingPromptDictionaries: Record<UiLocale, BillingPromptDictionary> = {
  ja,
  en,
  ko,
};
