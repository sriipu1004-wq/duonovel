import type { UiLocale } from "../config";

const ja = {
  eyebrow: "NOVEL / READ / LISTEN / LEARN",
  title: "読む、聴く、学ぶ。",
  lead: "外国語の長編を、自分の本棚で読み続ける。多言語対訳、読み上げ、AI物語、Web小説にも対応。",
  description: "PDF・EPUB・TXT・DOCXを作品単位で取り込み、章・話ごとの読書位置、対訳、栞を管理できます。公開作品を読む・聴く・投稿する機能と、時間に合わせたAI物語生成も同じ場所で利用できます。",
  generate: "物語を生成する",
  library: "個人本棚を開く",
  explore: "作品を探す",
  signup: "アカウント作成",
  features: "LIB readでできること",
  bilingualTitle: "原文と訳文を並べて読む",
  bilingualBody: "原文を消さず、対応する訳文を同じ画面で確認できます。Readerでは文単位の対応や読み上げも利用できます。",
  libraryTitle: "長編を自分の本棚で管理",
  libraryBody: "PDF・EPUB・TXT・DOCXを取り込み、話ごとの位置・栞・対訳を作品単位で管理します。",
  aiTitle: "空き時間に合わせてAI物語を作る",
  aiBody: "読める時間、ジャンル、雰囲気などを指定して短編を生成し、そのままReaderで読めます。",
  works: "公開作品",
  worksBody: "公開中の作品から読みたいものを選べます。",
  read: "読む",
  subscription: "サブスクを見る",
  guide: "使い方を見る",
} as const;

type HomeDictionary = { [K in keyof typeof ja]: string };

const en = {
  eyebrow: "NOVEL / READ / LISTEN / LEARN",
  title: "Read. Listen. Learn.",
  lead: "Keep reading long-form stories in another language with your own library, bilingual text, read-aloud, AI stories, and web novels.",
  description: "Import PDF, EPUB, TXT, or DOCX files, keep your place by chapter, use bookmarks, and read the original text alongside a translation. You can also browse public web novels or generate an AI story for the time you have available.",
  generate: "Generate a story",
  library: "Open My Library",
  explore: "Explore works",
  signup: "Create an account",
  features: "What you can do with LIB read",
  bilingualTitle: "Read original and translation together",
  bilingualBody: "Keep the original text visible while reading the corresponding translation. The Reader also supports sentence matching and read-aloud controls.",
  libraryTitle: "Keep long-form books in your own library",
  libraryBody: "Import PDF, EPUB, TXT, and DOCX files and keep reading position, bookmarks, and bilingual text organized by work and chapter.",
  aiTitle: "Generate a story for the time you have",
  aiBody: "Choose reading time, genre, mood, and other preferences, then open the generated story directly in the Reader.",
  works: "Public works",
  worksBody: "Choose from works currently published on LIB read.",
  read: "Read",
  subscription: "View subscription",
  guide: "Read the guide",
} satisfies HomeDictionary;

const ko = {
  eyebrow: "NOVEL / READ / LISTEN / LEARN",
  title: "읽고, 듣고, 배우기.",
  lead: "개인 서재에서 장편 외국어 작품을 이어 읽고, 다국어 대역·읽어주기·AI 이야기·웹소설을 함께 이용할 수 있습니다.",
  description: "PDF, EPUB, TXT, DOCX를 작품 단위로 가져와 장·화별 읽던 위치, 대역, 책갈피를 관리할 수 있습니다. 공개 웹소설을 읽거나 원하는 독서 시간에 맞춰 AI 이야기를 만들 수도 있습니다.",
  generate: "AI 이야기 만들기",
  library: "개인 서재 열기",
  explore: "작품 찾기",
  signup: "회원가입",
  features: "LIB read에서 할 수 있는 것",
  bilingualTitle: "원문과 번역을 함께 읽기",
  bilingualBody: "원문을 유지한 채 대응하는 번역문을 같은 화면에서 확인할 수 있습니다. Reader에서는 문장 대응과 읽어주기도 이용할 수 있습니다.",
  libraryTitle: "장편을 개인 서재에서 관리",
  libraryBody: "PDF, EPUB, TXT, DOCX를 가져와 작품과 장별로 읽던 위치, 책갈피, 대역을 관리합니다.",
  aiTitle: "읽을 시간에 맞춰 AI 이야기 만들기",
  aiBody: "독서 시간, 장르, 분위기 등을 선택해 짧은 이야기를 만들고 바로 Reader에서 읽을 수 있습니다.",
  works: "공개 작품",
  worksBody: "LIB read에 공개된 작품에서 읽을 작품을 선택할 수 있습니다.",
  read: "읽기",
  subscription: "구독 보기",
  guide: "이용 방법 보기",
} satisfies HomeDictionary;

export const homeDictionaries: Record<UiLocale, HomeDictionary> = { ja, en, ko };
export type { HomeDictionary };
