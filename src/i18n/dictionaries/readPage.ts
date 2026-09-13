import type { UiLocale } from "../config";

const ja = {
  untitled: "無題",
  episode: (value: number) => `第${value}話`,
  bodyMissing: "本文がまだ登録されていません。",
  aiGenerated: "AI生成",
  editorUnset: "編集者未設定",
  readerUnset: "朗読者未設定",
  authorUnset: "作者名未設定",
  sexualR18Warning: "R18・性的コンテンツ",
  violenceWarning: "暴力描写あり",
  r18AdultWork: "成人向け作品",
  r18GateTitle: "この作品はR18に設定されています",
  r18GateHelp:
    "R18作品は初期状態では表示されません。18歳以上の場合は、設定の「性的コンテンツを表示する」を有効にすると閲覧できます。",
  openDisplaySettings: "表示設定を開く",
  loginAndConfigure: "ログインして設定する",
  backTop: "TOPへ戻る",
} as const;

type ReadPageDictionary = {
  [K in keyof typeof ja]: (typeof ja)[K] extends (...args: infer A) => string
    ? (...args: A) => string
    : string;
};

const en = {
  untitled: "Untitled",
  episode: (value: number) => `Episode ${value}`,
  bodyMissing: "The episode text has not been added yet.",
  aiGenerated: "AI generated",
  editorUnset: "Editor not set",
  readerUnset: "Narrator not set",
  authorUnset: "Author not set",
  sexualR18Warning: "R18 · sexual content",
  violenceWarning: "Contains violence",
  r18AdultWork: "Adults-only work",
  r18GateTitle: "This work is marked R18",
  r18GateHelp:
    "R18 works are hidden by default. If you are 18 or older, enable sexual content in your display settings to view this work.",
  openDisplaySettings: "Open display settings",
  loginAndConfigure: "Sign in to configure",
  backTop: "Back to home",
} satisfies ReadPageDictionary;

const ko = {
  untitled: "제목 없음",
  episode: (value: number) => `${value}화`,
  bodyMissing: "아직 본문이 등록되지 않았습니다.",
  aiGenerated: "AI 생성",
  editorUnset: "편집자 미설정",
  readerUnset: "낭독자 미설정",
  authorUnset: "작가 미설정",
  sexualR18Warning: "R18 · 성적 콘텐츠",
  violenceWarning: "폭력 묘사 있음",
  r18AdultWork: "성인용 작품",
  r18GateTitle: "이 작품은 R18로 설정되어 있습니다",
  r18GateHelp:
    "R18 작품은 기본적으로 표시되지 않습니다. 만 18세 이상인 경우 표시 설정에서 성적 콘텐츠 표시를 활성화하면 열람할 수 있습니다.",
  openDisplaySettings: "표시 설정 열기",
  loginAndConfigure: "로그인하고 설정하기",
  backTop: "홈으로 돌아가기",
} satisfies ReadPageDictionary;

export const readPageDictionaries: Record<UiLocale, ReadPageDictionary> = {
  ja,
  en,
  ko,
};

export type { ReadPageDictionary };
