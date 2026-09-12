import type { UiLocale } from "../config";

const ja = {
  untitled: "無題",
  episode: (value: number) => `第${value}話`,
  bodyMissing: "本文がまだ登録されていません。",
  aiGenerated: "AI生成",
  editorUnset: "編集者未設定",
  readerUnset: "朗読者未設定",
  authorUnset: "作者名未設定",
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
} satisfies ReadPageDictionary;

const ko = {
  untitled: "제목 없음",
  episode: (value: number) => `${value}화`,
  bodyMissing: "아직 본문이 등록되지 않았습니다.",
  aiGenerated: "AI 생성",
  editorUnset: "편집자 미설정",
  readerUnset: "낭독자 미설정",
  authorUnset: "작가 미설정",
} satisfies ReadPageDictionary;

export const readPageDictionaries: Record<UiLocale, ReadPageDictionary> = {
  ja,
  en,
  ko,
};
