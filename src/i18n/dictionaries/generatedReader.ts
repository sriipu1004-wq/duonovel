import type { UiLocale } from "../config";

const ja = {
  loading: "読み込み中...",
  missingTitle: "生成された物語が見つかりません",
  missingHelp:
    "保存していない生成結果は、このブラウザの一時データが消えると開けなくなります。もう一度生成してください。",
  generateStory: "物語を生成する",
  timeFitStory: "時間フィットAI短編",
  aiGenerated: "AI生成",
  approxMinutes: (minutes: number) => `約${minutes}分`,
  displaySettings: "表示設定",
  speechVoice: "読み上げ音声",
  speechVoiceHelp: (language: string) =>
    `ブラウザと端末に入っている${language}向けの音声から選びます。`,
  saveFailed: "保存に失敗しました。",
  saveCommunicationFailed: "保存通信に失敗しました。",
  publishFailed: "投稿に失敗しました。",
  publishCommunicationFailed: "投稿通信に失敗しました。",
  savedPositionUpdated: "保存済み作品の現在位置を更新しました",
  savedToMyPage: "マイページに保存しました",
  mediaTitle: "AI生成物語",
  mediaAlbum: "LIB read AI生成物語",
  saving: "保存中...",
  saved: "保存済み",
  save: "保存する",
  editAndPublish: "編集して投稿する",
  publishing: "投稿中...",
  publish: "投稿する",
  savePanelTitle: "この物語を保存",
  savePanelHelp:
    "保存するとマイページのブックマーク作品に追加されます。保存は直近24時間で5回まで、公開投稿は直近24時間で1回までです。",
  close: "閉じる",
  updateSavePosition: "保存位置を更新",
  current: "現在",
  saveOpen: "保存 OPEN",
} as const;

type GeneratedReaderDictionary = {
  [K in keyof typeof ja]: (typeof ja)[K] extends (...args: infer A) => string
    ? (...args: A) => string
    : string;
};

const en = {
  loading: "Loading...",
  missingTitle: "Generated story not found",
  missingHelp:
    "Unsaved generated stories are temporary browser data and cannot be reopened after that data is cleared. Generate the story again.",
  generateStory: "Generate a story",
  timeFitStory: "Timed AI short story",
  aiGenerated: "AI generated",
  approxMinutes: (minutes: number) => `About ${minutes} min`,
  displaySettings: "Display settings",
  speechVoice: "Read-aloud voice",
  speechVoiceHelp: (language: string) =>
    `Choose from ${language} voices available in your browser and device.`,
  saveFailed: "Could not save the story.",
  saveCommunicationFailed: "The save request failed.",
  publishFailed: "Could not publish the story.",
  publishCommunicationFailed: "The publish request failed.",
  savedPositionUpdated: "Updated the saved reading position",
  savedToMyPage: "Saved to My Page",
  mediaTitle: "AI-generated story",
  mediaAlbum: "LIB read AI-generated story",
  saving: "Saving...",
  saved: "Saved",
  save: "Save",
  editAndPublish: "Edit before publishing",
  publishing: "Publishing...",
  publish: "Publish",
  savePanelTitle: "Save this story",
  savePanelHelp:
    "Saving adds this story to your bookmarked works on My Page. You can save up to 5 times in a rolling 24-hour period and publish once in a rolling 24-hour period.",
  close: "Close",
  updateSavePosition: "Update saved position",
  current: "Current",
  saveOpen: "Save OPEN",
} satisfies GeneratedReaderDictionary;

const ko = {
  loading: "불러오는 중...",
  missingTitle: "생성한 이야기를 찾을 수 없습니다",
  missingHelp:
    "저장하지 않은 생성 결과는 브라우저의 임시 데이터입니다. 해당 데이터가 삭제되면 다시 열 수 없으므로 이야기를 다시 생성하세요.",
  generateStory: "이야기 만들기",
  timeFitStory: "시간 맞춤 AI 단편",
  aiGenerated: "AI 생성",
  approxMinutes: (minutes: number) => `약 ${minutes}분`,
  displaySettings: "표시 설정",
  speechVoice: "읽어주기 음성",
  speechVoiceHelp: (language: string) =>
    `브라우저와 기기에 설치된 ${language} 음성 중에서 선택합니다.`,
  saveFailed: "이야기를 저장하지 못했습니다.",
  saveCommunicationFailed: "저장 요청에 실패했습니다.",
  publishFailed: "이야기를 공개하지 못했습니다.",
  publishCommunicationFailed: "공개 요청에 실패했습니다.",
  savedPositionUpdated: "저장된 읽기 위치를 업데이트했습니다",
  savedToMyPage: "마이페이지에 저장했습니다",
  mediaTitle: "AI 생성 이야기",
  mediaAlbum: "LIB read AI 생성 이야기",
  saving: "저장 중...",
  saved: "저장됨",
  save: "저장",
  editAndPublish: "편집 후 공개",
  publishing: "공개 중...",
  publish: "공개",
  savePanelTitle: "이 이야기 저장",
  savePanelHelp:
    "저장하면 마이페이지의 북마크 작품에 추가됩니다. 저장은 최근 24시간 동안 최대 5회, 공개 게시는 최근 24시간 동안 최대 1회 가능합니다.",
  close: "닫기",
  updateSavePosition: "저장 위치 업데이트",
  current: "현재",
  saveOpen: "저장 OPEN",
} satisfies GeneratedReaderDictionary;

export const generatedReaderDictionaries: Record<UiLocale, GeneratedReaderDictionary> = {
  ja,
  en,
  ko,
};
