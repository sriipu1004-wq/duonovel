import type { UiLocale } from "../config";

const ja = {
  translationLanguage: "対訳言語",
  sourceLanguageSuffix: "（原文言語）",
  chooseTranslationLanguage: "対訳する言語を選択",
  chooseTranslationHelp: "保存済み対訳がある場合はそのまま開き、ない場合だけ生成します。",
  rememberForWork: "次からはこの作品で表示せず対訳する",
  savedTranslationReady: "保存済み対訳があります。",
  translationStatusFailed: "対訳の保存状況を確認できませんでした。",
  subscriberLimitReached: "現在のサブスク生成上限に達しています。",
  cancel: "キャンセル",
  openBilingual: "対訳を開く",
  checkingBilingual: "対訳を確認中…",
  preparingBilingual: "対訳を準備中…",
  retryStatus: "状態をもう一度確認",
  generateBilingual: "対訳を生成",
  regenerateBilingual: "対訳を再生成",
  narrationStopped: "朗読停止中",
  playSentence: "▶ 1文再生",
  speechUnavailable: "このブラウザでは対訳文の読み上げを利用できません。",
  meaningLoading: (text: string) => `${text} の文中での意味を確認中…`,
  meaningFailed: "文中での意味を確認できませんでした",
  slower: "朗読速度を下げる",
  faster: "朗読速度を上げる",
} as const;

type ReaderDictionary = {
  [K in keyof typeof ja]: (typeof ja)[K] extends (...args: infer A) => string
    ? (...args: A) => string
    : string;
};

const en = {
  translationLanguage: "Translation",
  sourceLanguageSuffix: " (original)",
  chooseTranslationLanguage: "Choose translation language",
  chooseTranslationHelp: "If a saved translation exists, it opens immediately. A new translation is generated only when needed.",
  rememberForWork: "Use this language for this work without asking again",
  savedTranslationReady: "A saved translation is available.",
  translationStatusFailed: "Could not check whether a saved translation is available.",
  subscriberLimitReached: "You have reached the current subscription generation limit.",
  cancel: "Cancel",
  openBilingual: "Open bilingual text",
  checkingBilingual: "Checking bilingual text…",
  preparingBilingual: "Preparing bilingual text…",
  retryStatus: "Check again",
  generateBilingual: "Generate bilingual text",
  regenerateBilingual: "Regenerate bilingual text",
  narrationStopped: "Read-aloud stopped",
  playSentence: "▶ Play sentence",
  speechUnavailable: "Read-aloud for translated text is not available in this browser.",
  meaningLoading: (text: string) => `Checking ${text} in context…`,
  meaningFailed: "Could not check the meaning in context.",
  slower: "Decrease read-aloud speed",
  faster: "Increase read-aloud speed",
} satisfies ReaderDictionary;

const ko = {
  translationLanguage: "대역 언어",
  sourceLanguageSuffix: " (원문 언어)",
  chooseTranslationLanguage: "대역 언어 선택",
  chooseTranslationHelp: "저장된 대역이 있으면 바로 열고, 없을 때만 새로 생성합니다.",
  rememberForWork: "다음부터 이 작품에서는 묻지 않고 이 언어로 대역 보기",
  savedTranslationReady: "저장된 대역이 있습니다.",
  translationStatusFailed: "저장된 대역 상태를 확인하지 못했습니다.",
  subscriberLimitReached: "현재 구독 생성 한도에 도달했습니다.",
  cancel: "취소",
  openBilingual: "대역 열기",
  checkingBilingual: "대역 확인 중…",
  preparingBilingual: "대역 준비 중…",
  retryStatus: "다시 확인",
  generateBilingual: "대역 생성",
  regenerateBilingual: "대역 다시 생성",
  narrationStopped: "읽어주기 중지됨",
  playSentence: "▶ 문장 재생",
  speechUnavailable: "이 브라우저에서는 번역문 읽어주기를 이용할 수 없습니다.",
  meaningLoading: (text: string) => `${text}의 문맥상 의미 확인 중…`,
  meaningFailed: "문맥상 의미를 확인하지 못했습니다.",
  slower: "읽어주기 속도 낮추기",
  faster: "읽어주기 속도 높이기",
} satisfies ReaderDictionary;

export const readerDictionaries: Record<UiLocale, ReaderDictionary> = { ja, en, ko };
