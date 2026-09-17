import type { UiLocale } from "../config";

const ja = {
  responseInvalid: (status: number) =>
    `対訳サーバーから正しい応答を受け取れませんでした（${status}）。もう一度お試しください。`,
  generationFailed: "対訳を生成できませんでした。",
  communicationInterrupted:
    "対訳の通信が中断されました。ページを開いたまま、もう一度お試しください。",
  statusUnavailable: "対訳の状態を取得できませんでした。",
  staleRegenerating: "原文が更新されたため、対訳を再生成します。",
  episodeFallback: (episodeNumber: number) => `第${episodeNumber}話`,
  workIndexAria: (title: string) => `${title}の作品ページ（目次）へ`,
  bilingualOn: "対訳 ON",
  disableBilingual: "OFFに戻す",
  wordExplanation: "単語解説",
  unlimitedUpgrade: "Free / Premiumの違いを見る",
  failedHelp:
    "前回の生成が完了していません。再生成できる場合は、再生成ボタンからもう一度お試しください。",
  errorHelp: "翻訳データを読み込めませんでした。もう一度お試しください。",
  generationUpgrade: "Premiumの利用枠を見る",
  footerAria: "対訳中の朗読フッター",
  bilingualHumanNarrationUnavailable: "ユーザー朗読（対訳では未対応）",
  lowerPaneReadHelp: "下段を現在位置から最後まで読み上げます。",
  narrationStopShortHelp: "停止中は再生を開始しません。",
  allEffects: "全演出",
  lowerPaneFullPlayback: "下段・全文再生",
  dividerAria: "原文と対訳の表示比率",
  swapAria: "原文と対訳の上下を入れ替える",
  swapTitle: "上下を入れ替える",
  heightAria: "対訳表示全体の高さ",
  heightTitle: "上下にドラッグして対訳表示の高さを変更",
} as const;

type BilingualReaderDictionary = {
  [K in keyof typeof ja]: (typeof ja)[K] extends (...args: infer A) => string
    ? (...args: A) => string
    : string;
};

const en = {
  responseInvalid: (status: number) =>
    `The bilingual-text server returned an invalid response (${status}). Please try again.`,
  generationFailed: "Could not generate the bilingual text.",
  communicationInterrupted:
    "The bilingual-text request was interrupted. Keep this page open and try again.",
  statusUnavailable: "Could not load the bilingual-text status.",
  staleRegenerating:
    "The original text changed, so the bilingual text will be regenerated.",
  episodeFallback: (episodeNumber: number) => `Episode ${episodeNumber}`,
  workIndexAria: (title: string) => `Open ${title} work page (contents)`,
  bilingualOn: "Bilingual ON",
  disableBilingual: "Back to original",
  wordExplanation: "Word explanations",
  unlimitedUpgrade: "Compare Free and Premium",
  failedHelp:
    "The previous generation did not complete. If regeneration is available, use the regenerate button to try again.",
  errorHelp: "The translation data could not be loaded. Please try again.",
  generationUpgrade: "View Premium allowances",
  footerAria: "Bilingual reader narration footer",
  bilingualHumanNarrationUnavailable: "User narration (not available in bilingual mode)",
  lowerPaneReadHelp: "Read the lower pane from the current position to the end.",
  narrationStopShortHelp: "Playback will not start while read-aloud is disabled.",
  allEffects: "All effects",
  lowerPaneFullPlayback: "Lower pane · play all",
  dividerAria: "Original and translation display ratio",
  swapAria: "Swap original and translation panes",
  swapTitle: "Swap panes",
  heightAria: "Bilingual reader height",
  heightTitle: "Drag vertically to change the bilingual reader height",
} satisfies BilingualReaderDictionary;

const ko = {
  responseInvalid: (status: number) =>
    `대역 서버에서 올바른 응답을 받지 못했습니다(${status}). 다시 시도해 주세요.`,
  generationFailed: "대역을 생성하지 못했습니다.",
  communicationInterrupted:
    "대역 통신이 중단되었습니다. 페이지를 연 상태에서 다시 시도해 주세요.",
  statusUnavailable: "대역 상태를 불러오지 못했습니다.",
  staleRegenerating: "원문이 변경되어 대역을 다시 생성합니다.",
  episodeFallback: (episodeNumber: number) => `${episodeNumber}화`,
  workIndexAria: (title: string) => `${title} 작품 페이지(목차)로 이동`,
  bilingualOn: "대역 ON",
  disableBilingual: "원문으로 돌아가기",
  wordExplanation: "단어 설명",
  unlimitedUpgrade: "Free와 Premium 비교",
  failedHelp:
    "이전 생성이 완료되지 않았습니다. 다시 생성할 수 있다면 다시 생성 버튼으로 재시도하세요.",
  errorHelp: "번역 데이터를 불러오지 못했습니다. 다시 시도해 주세요.",
  generationUpgrade: "Premium 이용 한도 보기",
  footerAria: "대역 읽기 낭독 푸터",
  bilingualHumanNarrationUnavailable: "사용자 낭독 (대역 모드 미지원)",
  lowerPaneReadHelp: "아래쪽 창을 현재 위치부터 끝까지 읽어줍니다.",
  narrationStopShortHelp: "읽어주기 중지 상태에서는 재생을 시작하지 않습니다.",
  allEffects: "전체 효과",
  lowerPaneFullPlayback: "아래쪽 창 · 전체 재생",
  dividerAria: "원문과 번역 표시 비율",
  swapAria: "원문과 번역의 위아래 위치 바꾸기",
  swapTitle: "위아래 바꾸기",
  heightAria: "대역 표시 전체 높이",
  heightTitle: "위아래로 드래그하여 대역 표시 높이 변경",
} satisfies BilingualReaderDictionary;

export const bilingualReaderDictionaries: Record<UiLocale, BilingualReaderDictionary> = {
  ja,
  en,
  ko,
};
