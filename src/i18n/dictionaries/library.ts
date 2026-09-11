import type { UiLocale } from "../config";

const ja = {
  title: "個人本棚",
  description: "自分で取り込んだ作品を、本人だけが読める本棚です。",
  subscriberPlan: "サブスク",
  freePlan: "無料プラン",
  worksUnit: "作品",
  importWork: "作品を取り込む",
  loadFailed: "個人本棚を準備できませんでした。データベース設定を確認してください。",
  emptyTitle: "まだ作品がありません",
  emptyBody: "TXT・EPUB・DOCXなどを取り込むと、章構造を保って自動分割します。",
  privateOnly: "本人限定",
  sections: (count: number) => `${count}章・話`,
  lastViewed: (date: string) => `最終閲覧 ${date}`,
  added: (date: string) => `追加日 ${date}`,
  contents: "作品目次",
  resume: "続きから読む",
  start: "読み始める",
  resumeTitle: (chapter: number, coordinate: string) => `第${chapter}話・${coordinate}から再開`,
} as const;

type LibraryDictionary = {
  [K in keyof typeof ja]: (typeof ja)[K] extends (...args: infer A) => string
    ? (...args: A) => string
    : string;
};

const en = {
  title: "My Library",
  description: "Your private library for works you import yourself. Only you can access these works.",
  subscriberPlan: "Subscription",
  freePlan: "Free plan",
  worksUnit: "works",
  importWork: "Import a work",
  loadFailed: "Could not load My Library. Please check the database configuration.",
  emptyTitle: "Your library is empty",
  emptyBody: "Import a TXT, EPUB, DOCX, or supported file and LIB read will split it into chapters while preserving its structure.",
  privateOnly: "Private",
  sections: (count: number) => `${count} sections`,
  lastViewed: (date: string) => `Last read ${date}`,
  added: (date: string) => `Added ${date}`,
  contents: "Contents",
  resume: "Continue reading",
  start: "Start reading",
  resumeTitle: (chapter: number, coordinate: string) => `Resume chapter ${chapter} at ${coordinate}`,
} satisfies LibraryDictionary;

const ko = {
  title: "개인 서재",
  description: "직접 가져온 작품을 본인만 읽을 수 있는 개인 서재입니다.",
  subscriberPlan: "구독",
  freePlan: "무료 플랜",
  worksUnit: "작품",
  importWork: "작품 가져오기",
  loadFailed: "개인 서재를 불러오지 못했습니다. 데이터베이스 설정을 확인하세요.",
  emptyTitle: "아직 작품이 없습니다",
  emptyBody: "TXT, EPUB, DOCX 등의 파일을 가져오면 장 구조를 유지하면서 자동으로 나눕니다.",
  privateOnly: "본인 전용",
  sections: (count: number) => `${count}개 장·화`,
  lastViewed: (date: string) => `마지막 열람 ${date}`,
  added: (date: string) => `추가일 ${date}`,
  contents: "작품 목차",
  resume: "이어 읽기",
  start: "읽기 시작",
  resumeTitle: (chapter: number, coordinate: string) => `${chapter}화 ${coordinate}부터 이어 읽기`,
} satisfies LibraryDictionary;

export const libraryDictionaries: Record<UiLocale, LibraryDictionary> = { ja, en, ko };
