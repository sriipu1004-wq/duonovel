import type { UiLocale } from "../config";

const ja = {
  requestTooLong: "続きへの希望は500文字以内で入力してください。",
  generationFailed: "続編の生成に失敗しました。",
  savedAsDraft: "続きが下書きとして保存されました。",
  openAction: "この物語の続きを作る",
  title: "続きを作る",
  description:
    "これまでの物語を引き継いで、次の話を生成します。生成した話は下書きとして保存され、編集してから公開できます。",
  shortStoryNotice:
    "この作品は現在、短編として保存されています。続きを生成すると長編作品へ変更され、第2話が下書きとして追加されます。",
  readingTime: "読む時間",
  minutes: (value: number) => `${value}分`,
  requestLabel: "続きへの希望（任意）",
  requestHelp:
    "登場人物、展開、視点、雰囲気、次に起きてほしいことなどを自由に入力できます。",
  requestPlaceholder:
    "例：主人公が扉の向こうへ入り、前回の謎の一部が明らかになる展開にしてください。",
  characters: "文字",
  generatingHelp: "続きを生成しています。画面を閉じずにお待ちください。",
  back: "戻る",
  generating: "生成中…",
  convertAndContinue: "長編にして続きを作る",
  continueStory: "続きを作る",
  conversionTitle: "短編から長編へ変更します",
  conversionItems: [
    "元の第1話はそのまま残ります。",
    "作品タイトルと公開状態は変わりません。",
    "新しい第2話は下書きで、自動公開されません。",
  ],
} as const;

type ContinuationDictionary = {
  [K in keyof typeof ja]: (typeof ja)[K] extends (...args: infer A) => string
    ? (...args: A) => string
    : (typeof ja)[K] extends readonly string[]
      ? readonly string[]
      : string;
};

const en = {
  requestTooLong: "Keep continuation preferences within 500 characters.",
  generationFailed: "Could not generate the next episode.",
  savedAsDraft: "The continuation was saved as a draft.",
  openAction: "Continue this story",
  title: "Continue the story",
  description:
    "Generate the next episode while preserving the story so far. The new episode is saved as a draft so you can edit it before publishing.",
  shortStoryNotice:
    "This work is currently saved as a short story. Continuing it will convert it to a series and add episode 2 as a draft.",
  readingTime: "Reading time",
  minutes: (value: number) => `${value} min`,
  requestLabel: "Continuation preferences (optional)",
  requestHelp:
    "Add characters, plot direction, point of view, mood, or anything you want to happen next.",
  requestPlaceholder:
    "Example: Have the protagonist enter the door and reveal part of the mystery from the previous episode.",
  characters: "characters",
  generatingHelp: "Generating the continuation. Keep this page open until it finishes.",
  back: "Back",
  generating: "Generating…",
  convertAndContinue: "Convert to a series and continue",
  continueStory: "Continue the story",
  conversionTitle: "Convert this short story to a series",
  conversionItems: [
    "The original episode 1 stays unchanged.",
    "The work title and publication status stay unchanged.",
    "The new episode 2 is saved as a draft and is not published automatically.",
  ],
} satisfies ContinuationDictionary;

const ko = {
  requestTooLong: "이어 쓰기 요청은 500자 이내로 입력하세요.",
  generationFailed: "다음 화를 생성하지 못했습니다.",
  savedAsDraft: "이어 쓴 내용이 초안으로 저장되었습니다.",
  openAction: "이 이야기 이어 쓰기",
  title: "이어 쓰기",
  description:
    "지금까지의 이야기를 이어서 다음 화를 생성합니다. 생성한 화는 초안으로 저장되며 편집한 뒤 공개할 수 있습니다.",
  shortStoryNotice:
    "현재 단편으로 저장된 작품입니다. 이어 쓰면 장편 작품으로 전환되고 2화가 초안으로 추가됩니다.",
  readingTime: "읽을 시간",
  minutes: (value: number) => `${value}분`,
  requestLabel: "이어 쓰기 요청 (선택)",
  requestHelp:
    "등장인물, 전개, 시점, 분위기, 다음에 일어났으면 하는 일 등을 자유롭게 입력할 수 있습니다.",
  requestPlaceholder:
    "예: 주인공이 문 너머로 들어가고 이전 화의 수수께끼 일부가 밝혀지게 해 주세요.",
  characters: "자",
  generatingHelp: "다음 화를 생성하고 있습니다. 완료될 때까지 이 화면을 열어 두세요.",
  back: "뒤로",
  generating: "생성 중…",
  convertAndContinue: "장편으로 전환하고 이어 쓰기",
  continueStory: "이어 쓰기",
  conversionTitle: "단편을 장편으로 전환합니다",
  conversionItems: [
    "기존 1화는 그대로 유지됩니다.",
    "작품 제목과 공개 상태는 바뀌지 않습니다.",
    "새 2화는 초안으로 저장되며 자동 공개되지 않습니다.",
  ],
} satisfies ContinuationDictionary;

export const continuationDictionaries: Record<UiLocale, ContinuationDictionary> = {
  ja,
  en,
  ko,
};
