import type { UiLocale } from "../config";

const ja = {
  navGenerate: "AI生成",
  navLibrary: "個人本棚",
  navSearch: "探す",
  navNarration: "朗読",
  navWrite: "投稿",
  topAria: "LIB read トップへ",
  symbolAlt: "LIB read シンボル",
  language: "表示言語",
  guide: "使い方",
  faq: "よくある質問",
  englishNovel: "英語小説の対訳",
  languageLearning: "小説で語学学習",
  pdfBilingual: "PDF・EPUB対訳",
  status: "運営状況",
  news: "お知らせ",
  subscription: "サブスク",
  terms: "利用規約",
  privacy: "プライバシーポリシー",
  commercial: "特定商取引法に基づく表記",
  contact: "お問い合わせ",
  footerDescription: "外国語の長編を個人本棚で読み続け、多言語対訳・読み上げ・AI物語・Web小説を作品単位で楽しめる読書サービスです。",
} as const;

type CommonDictionary = { [K in keyof typeof ja]: string };

const en = {
  navGenerate: "AI Stories",
  navLibrary: "My Library",
  navSearch: "Explore",
  navNarration: "Narration",
  navWrite: "Publish",
  topAria: "Go to LIB read home",
  symbolAlt: "LIB read symbol",
  language: "Language",
  guide: "Guide",
  faq: "FAQ",
  englishNovel: "Bilingual English novels",
  languageLearning: "Learn with stories",
  pdfBilingual: "PDF & EPUB bilingual reader",
  status: "Service status",
  news: "News",
  subscription: "Subscription",
  terms: "Terms",
  privacy: "Privacy Policy",
  commercial: "Commercial disclosures",
  contact: "Contact",
  footerDescription: "A reading service for long-form books in your own library, bilingual text, read-aloud, AI stories, and web novels.",
} satisfies CommonDictionary;

const ko = {
  navGenerate: "AI 이야기",
  navLibrary: "개인 서재",
  navSearch: "작품 찾기",
  navNarration: "낭독",
  navWrite: "작품 올리기",
  topAria: "LIB read 홈으로",
  symbolAlt: "LIB read 심볼",
  language: "표시 언어",
  guide: "이용 방법",
  faq: "자주 묻는 질문",
  englishNovel: "영어 소설 대역",
  languageLearning: "소설로 언어 학습",
  pdfBilingual: "PDF·EPUB 대역 읽기",
  status: "운영 상태",
  news: "공지사항",
  subscription: "구독",
  terms: "이용약관",
  privacy: "개인정보 처리방침",
  commercial: "특정상거래법 표기",
  contact: "문의하기",
  footerDescription: "개인 서재에서 장편 외국어 작품을 이어 읽고, 다국어 대역·읽어주기·AI 이야기·웹소설을 함께 이용하는 독서 서비스입니다.",
} satisfies CommonDictionary;

export const commonDictionaries: Record<UiLocale, CommonDictionary> = { ja, en, ko };
export type { CommonDictionary };
