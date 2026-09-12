import type { UiLocale } from "../config";

export type HomeDictionary = {
  eyebrow: string;
  title: string;
  lead: string;
  description: string;
  freeBadge: string;
  featureBadge: string;
  generate: string;
  library: string;
  explore: string;
  signup: string;
  write: string;
  narrate: string;
  toc: string;
  featuresChip: string;
  subscriptionChip: string;
  bookmarkChip: string;
  latestChip: string;
  weeklyChip: string;
  overallChip: string;
  narrationChip: string;
  subscriptionEyebrow: string;
  subscriptionTitle: string;
  subscriptionDescription: string;
  subscriptionCta: string;
  whyEyebrow: string;
  features: string;
  featuresBody: string;
  privateLibraryTitle: string;
  privateLibraryBody: string;
  bilingualTitle: string;
  bilingualBody: string;
  ttsTitle: string;
  ttsBody: string;
  aiTitle: string;
  aiBody: string;
  bookmarkTitle: string;
  bookmarkSignedIn: string;
  bookmarkSignedOut: string;
  bookmarkLoginPrompt: string;
  login: string;
  latestTitle: string;
  latestDescription: string;
  weeklyTitle: string;
  weeklyDescription: string;
  overallTitle: string;
  overallDescription: string;
  narrationTitle: string;
  narrationDescription: string;
  resultsEyebrow: string;
  resultsLatestTitle: string;
  resultsLatestDescription: string;
  resultsWeeklyTitle: string;
  resultsWeeklyDescription: string;
  resultsOverallTitle: string;
  resultsOverallDescription: string;
  resultsNarrationTitle: string;
  resultsNarrationDescription: string;
  tagResultTitle: (tag: string) => string;
  tagResultDescription: (tag: string) => string;
  showMore: string;
  noWorks: string;
  dateUnknown: string;
  discoveryEyebrow: string;
  discoveryTitle: string;
  discoveryDescription: string;
  readerGuideTitle: string;
  readerGuideDescription: string;
  learningGuideTitle: string;
  learningGuideDescription: string;
  fileGuideTitle: string;
  fileGuideDescription: string;
  pricingGuideTitle: string;
  pricingGuideDescription: string;
  serviceInfo: string;
  guide: string;
  faq: string;
  operationsInfo: string;
  status: string;
  news: string;
  legalContact: string;
  terms: string;
  privacy: string;
  commercial: string;
  contact: string;
  works: string;
  worksBody: string;
  read: string;
  subscription: string;
};

const ja: HomeDictionary = {
  eyebrow: "NOVEL / READ / LISTEN / LEARN",
  title: "読む、聴く、学ぶ。",
  lead: "外国語の長編を、自分の本棚で読み続ける。多言語対訳、読み上げ、AI物語、Web小説にも対応。",
  description: "PDF・EPUB・TXT・DOCXを作品単位で取り込み、章・話ごとの読書位置、対訳、栞を管理できます。公開作品を読む・聴く・投稿する機能と、時間に合わせたAI物語生成も同じ場所で利用できます。",
  freeBadge: "無料枠あり",
  featureBadge: "個人本棚 / 多言語対訳 / 読み上げ / AI生成",
  generate: "物語を生成する",
  library: "個人本棚を開く",
  explore: "作品を探す",
  signup: "アカウント作成",
  write: "作品を投稿する",
  narrate: "作品を朗読する",
  toc: "目次",
  featuresChip: "LIB read の特徴",
  subscriptionChip: "月額680円 Premium",
  bookmarkChip: "ブックマーク更新",
  latestChip: "新着更新",
  weeklyChip: "週間新作おすすめ",
  overallChip: "総合人気順",
  narrationChip: "朗読視聴人気順",
  subscriptionEyebrow: "PREMIUM",
  subscriptionTitle: "月額680円で、長編の対訳を止めずに読む。",
  subscriptionDescription: "FreeではAI物語生成・対訳生成・個人本棚への取り込みが合計1日3回の共通枠です。PremiumではAI物語は1日10回、対訳生成は1日30回へ拡大し、単語解説と本棚取り込みの日次回数制限がなくなります。",
  subscriptionCta: "Freeとの違いを見る",
  whyEyebrow: "WHY LIB READ",
  features: "LIB read の特徴",
  featuresBody: "長編を読む・聴く・作る・学ぶための機能を、作品単位で管理する。",
  privateLibraryTitle: "個人本棚",
  privateLibraryBody: "自分で用意したPDF・EPUB・TXT・DOCXを取り込み、長編を章・話単位で管理して続きから読める。",
  bilingualTitle: "多言語対訳",
  bilingualBody: "原文と訳文を上下で同期し、対応文や語の文脈上の意味・表現を確認できる。保存済み対訳は再利用する。",
  ttsTitle: "読み上げ・栞",
  ttsBody: "ブラウザ読み上げと投稿朗読に対応。読書位置や栞、表示・朗読設定を保持する。",
  aiTitle: "AI物語・投稿",
  aiBody: "読む時間に合わせた物語を生成し、保存後は作品ワークスペースで編集・続編生成・投稿ができる。",
  bookmarkTitle: "ブックマーク更新",
  bookmarkSignedIn: "ブックマークした作品のうち、最近更新された作品。",
  bookmarkSignedOut: "ログインすると、ブックマークした作品の更新をここで確認できる。",
  bookmarkLoginPrompt: "ブックマーク更新を表示するにはログインが必要。",
  login: "ログインする",
  latestTitle: "新着更新",
  latestDescription: "最近更新された公開作品。",
  weeklyTitle: "週間新作おすすめ",
  weeklyDescription: "新しめの公開作品から探す。",
  overallTitle: "総合人気順",
  overallDescription: "現時点の人気寄り順で公開作品を表示。",
  narrationTitle: "朗読視聴人気順",
  narrationDescription: "朗読視聴寄りの順で公開作品を表示。",
  resultsEyebrow: "RESULTS",
  resultsLatestTitle: "新着更新をもっと見る",
  resultsLatestDescription: "最近更新された公開作品を新しい順で表示。",
  resultsWeeklyTitle: "週間新作をもっと見る",
  resultsWeeklyDescription: "最近公開された作品を中心に表示。",
  resultsOverallTitle: "総合人気順をもっと見る",
  resultsOverallDescription: "公開作品を人気寄りの順で表示。",
  resultsNarrationTitle: "朗読視聴人気順をもっと見る",
  resultsNarrationDescription: "朗読視聴寄りの順で公開作品を表示。",
  tagResultTitle: (tag) => `${tag} の作品`,
  tagResultDescription: (tag) => `${tag} が付いた公開作品。`,
  showMore: "もっと見る",
  noWorks: "該当する公開作品はまだありません。",
  dateUnknown: "日付未設定",
  discoveryEyebrow: "READING GUIDES",
  discoveryTitle: "長編をどう読みたい？",
  discoveryDescription: "対訳、語学学習、ファイル取り込み、料金の詳細を目的別に確認できます。",
  readerGuideTitle: "英語小説を日本語対訳で読む",
  readerGuideDescription: "英語原文を残し、日本語訳と対応させながら長編を読む。",
  learningGuideTitle: "ネット小説で外国語を学ぶ",
  learningGuideDescription: "好きな長編を何話も読み続けながら外国語を学ぶ。",
  fileGuideTitle: "PDF・EPUBを対訳で読む",
  fileGuideDescription: "手元の長編ファイルを個人本棚で章・話ごとに読む。",
  pricingGuideTitle: "Free / Premium",
  pricingGuideDescription: "¥0のFreeと月額680円Premiumの利用枠・機能差を見る。",
  serviceInfo: "サービス案内",
  guide: "使い方",
  faq: "FAQ",
  operationsInfo: "運営情報",
  status: "運営状況",
  news: "お知らせ",
  legalContact: "規約・連絡",
  terms: "利用規約",
  privacy: "プライバシーポリシー",
  commercial: "特定商取引法に基づく表記",
  contact: "お問い合わせ",
  works: "公開作品",
  worksBody: "公開中の作品から読みたいものを選べます。",
  read: "読む",
  subscription: "サブスクを見る",
};

const en: HomeDictionary = {
  eyebrow: "NOVEL / READ / LISTEN / LEARN",
  title: "Read long-form fiction with the original text and translation together.",
  lead: "LIB read is a bilingual long-form reading platform for novels and web novels. Keep the source text visible beside a translation and continue across chapters instead of starting a new translation session every time.",
  description: "Import TXT, EPUB, DOCX, or text-based PDF books into a private library, keep reading position and bookmarks, browse public works, use read-aloud, or generate an AI story for the time you have available.",
  freeBadge: "Free plan available",
  featureBadge: "My Library / bilingual reading / read-aloud / AI stories",
  generate: "Generate a story",
  library: "Open My Library",
  explore: "Explore works",
  signup: "Create an account",
  write: "Publish a work",
  narrate: "Record narration",
  toc: "On this page",
  featuresChip: "What LIB read does",
  subscriptionChip: "¥680/month Premium",
  bookmarkChip: "Bookmark updates",
  latestChip: "Latest updates",
  weeklyChip: "New this week",
  overallChip: "Popular works",
  narrationChip: "Popular narration",
  subscriptionEyebrow: "PREMIUM",
  subscriptionTitle: "Keep reading long-form bilingual text with higher daily allowances.",
  subscriptionDescription: "On Free, AI story generation, bilingual generation, and My Library imports share a total allowance of 3 uses per day. Premium raises AI stories to 10/day and bilingual generation to 30/day, with no daily count limit for word explanations or My Library imports.",
  subscriptionCta: "Compare Free and Premium",
  whyEyebrow: "WHY LIB READ",
  features: "What you can do with LIB read",
  featuresBody: "Keep long-form reading, bilingual text, listening, creation, and language support organized around the work you are reading.",
  privateLibraryTitle: "Private My Library",
  privateLibraryBody: "Import your own TXT, EPUB, DOCX, or text-based PDF and keep a long book organized by chapter or reading unit so you can continue later.",
  bilingualTitle: "Bilingual long-form reading",
  bilingualBody: "Keep the source and translation together, follow corresponding sentences, and check contextual word and expression explanations without replacing the original text.",
  ttsTitle: "Read-aloud and bookmarks",
  ttsBody: "Use browser read-aloud, saved reading position, bookmarks, and reading settings while moving through a work.",
  aiTitle: "AI stories and public works",
  aiBody: "Generate a story for a chosen reading time, or browse, read, publish, and narrate public works on the same platform.",
  bookmarkTitle: "Bookmark updates",
  bookmarkSignedIn: "Recently updated works from your bookmarks.",
  bookmarkSignedOut: "Sign in to see recent updates from works you bookmarked.",
  bookmarkLoginPrompt: "Sign in to show updates from your bookmarked works.",
  login: "Sign in",
  latestTitle: "Latest updates",
  latestDescription: "Public works updated recently.",
  weeklyTitle: "New this week",
  weeklyDescription: "Discover recently published public works.",
  overallTitle: "Popular works",
  overallDescription: "Public works ordered toward current popularity.",
  narrationTitle: "Popular narration",
  narrationDescription: "Public works ordered toward narration listening activity.",
  resultsEyebrow: "RESULTS",
  resultsLatestTitle: "More latest updates",
  resultsLatestDescription: "Recently updated public works in recent-first order.",
  resultsWeeklyTitle: "More new works",
  resultsWeeklyDescription: "Recently published public works.",
  resultsOverallTitle: "More popular works",
  resultsOverallDescription: "Public works ordered toward current popularity.",
  resultsNarrationTitle: "More popular narration",
  resultsNarrationDescription: "Public works ordered toward narration listening activity.",
  tagResultTitle: (tag) => `Works tagged ${tag}`,
  tagResultDescription: (tag) => `Public works with the ${tag} tag.`,
  showMore: "View more",
  noWorks: "No matching public works are available yet.",
  dateUnknown: "Date unavailable",
  discoveryEyebrow: "READING GUIDES",
  discoveryTitle: "Choose how you want to read",
  discoveryDescription: "See focused guides for Japanese bilingual reading, Japanese study through fiction, file import, and current plan details.",
  readerGuideTitle: "Read Japanese novels with English translation",
  readerGuideDescription: "Keep the Japanese original visible beside English translation while continuing across chapters.",
  learningGuideTitle: "Learn Japanese with novels and web novels",
  learningGuideDescription: "Use a continuing story as Japanese reading practice instead of isolated example sentences.",
  fileGuideTitle: "PDF and EPUB bilingual reader",
  fileGuideDescription: "Import supported long-form files into a private library and read source and translation together.",
  pricingGuideTitle: "Free and Premium plans",
  pricingGuideDescription: "See the ¥0 Free plan, ¥680/month Premium plan, usage allowances, and library limits.",
  serviceInfo: "Service",
  guide: "Guide",
  faq: "FAQ",
  operationsInfo: "Updates",
  status: "Status",
  news: "News",
  legalContact: "Legal and contact",
  terms: "Terms (Japanese)",
  privacy: "Privacy Policy (Japanese)",
  commercial: "Commercial disclosures (Japanese)",
  contact: "Contact",
  works: "Public works",
  worksBody: "Choose from works currently published on LIB read.",
  read: "Read",
  subscription: "View subscription",
};

const ko: HomeDictionary = {
  eyebrow: "NOVEL / READ / LISTEN / LEARN",
  title: "장편소설을 원문과 번역이 함께 있는 상태로 이어 읽기.",
  lead: "LIB read는 장편소설과 웹소설을 위한 다국어 독서 플랫폼입니다. 원문을 지우지 않고 번역과 함께 보며 장과 화를 넘어 같은 작품을 계속 읽을 수 있습니다.",
  description: "TXT, EPUB, DOCX, 텍스트 PDF를 비공개 개인 서재에 가져와 읽던 위치와 책갈피를 유지하고, 공개 작품 탐색, 읽어주기, 읽을 시간에 맞춘 AI 이야기 생성도 같은 곳에서 이용할 수 있습니다.",
  freeBadge: "Free 플랜 제공",
  featureBadge: "개인 서재 / 다국어 대역 / 읽어주기 / AI 이야기",
  generate: "AI 이야기 만들기",
  library: "개인 서재 열기",
  explore: "작품 찾기",
  signup: "회원가입",
  write: "작품 게시하기",
  narrate: "작품 낭독하기",
  toc: "이 페이지",
  featuresChip: "LIB read 기능",
  subscriptionChip: "월 ¥680 Premium",
  bookmarkChip: "책갈피 작품 업데이트",
  latestChip: "최근 업데이트",
  weeklyChip: "이번 주 신작",
  overallChip: "인기 작품",
  narrationChip: "인기 낭독",
  subscriptionEyebrow: "PREMIUM",
  subscriptionTitle: "더 큰 일일 이용량으로 장편 대역 읽기를 이어가기.",
  subscriptionDescription: "Free에서는 AI 이야기 생성, 대역 생성, 개인 서재 가져오기가 합산 하루 3회의 공통 이용량을 공유합니다. Premium은 AI 이야기 하루 10회, 대역 생성 하루 30회로 늘어나며 단어 설명과 개인 서재 가져오기에는 일일 횟수 제한이 없습니다.",
  subscriptionCta: "Free와 Premium 비교",
  whyEyebrow: "WHY LIB READ",
  features: "LIB read에서 할 수 있는 것",
  featuresBody: "장편 읽기, 대역, 듣기, 창작, 언어 학습 기능을 읽는 작품을 중심으로 관리합니다.",
  privateLibraryTitle: "비공개 개인 서재",
  privateLibraryBody: "직접 준비한 TXT, EPUB, DOCX, 텍스트 PDF를 가져와 장·읽기 단위로 관리하고 다음에 이어 읽을 수 있습니다.",
  bilingualTitle: "장편 다국어 대역",
  bilingualBody: "원문과 번역을 함께 유지하고 대응 문장을 따라가며 원문을 지우지 않은 채 단어와 표현의 문맥 설명을 확인할 수 있습니다.",
  ttsTitle: "읽어주기와 책갈피",
  ttsBody: "브라우저 읽어주기, 읽던 위치, 책갈피와 읽기 설정을 유지하면서 작품을 계속 읽습니다.",
  aiTitle: "AI 이야기와 공개 작품",
  aiBody: "읽을 시간에 맞춘 이야기를 만들거나 같은 플랫폼에서 공개 작품을 찾고 읽고 게시하고 낭독할 수 있습니다.",
  bookmarkTitle: "책갈피 작품 업데이트",
  bookmarkSignedIn: "책갈피에 저장한 작품 중 최근 업데이트된 작품입니다.",
  bookmarkSignedOut: "로그인하면 책갈피에 저장한 작품의 최근 업데이트를 확인할 수 있습니다.",
  bookmarkLoginPrompt: "책갈피 작품 업데이트를 보려면 로그인하세요.",
  login: "로그인",
  latestTitle: "최근 업데이트",
  latestDescription: "최근 업데이트된 공개 작품입니다.",
  weeklyTitle: "이번 주 신작",
  weeklyDescription: "최근 공개된 작품을 찾아봅니다.",
  overallTitle: "인기 작품",
  overallDescription: "현재 인기도에 가까운 순서로 공개 작품을 표시합니다.",
  narrationTitle: "인기 낭독",
  narrationDescription: "낭독 청취 활동에 가까운 순서로 공개 작품을 표시합니다.",
  resultsEyebrow: "RESULTS",
  resultsLatestTitle: "최근 업데이트 더 보기",
  resultsLatestDescription: "최근 업데이트된 공개 작품을 최신순으로 표시합니다.",
  resultsWeeklyTitle: "신작 더 보기",
  resultsWeeklyDescription: "최근 공개된 작품을 중심으로 표시합니다.",
  resultsOverallTitle: "인기 작품 더 보기",
  resultsOverallDescription: "공개 작품을 현재 인기도에 가까운 순서로 표시합니다.",
  resultsNarrationTitle: "인기 낭독 더 보기",
  resultsNarrationDescription: "낭독 청취 활동에 가까운 순서로 공개 작품을 표시합니다.",
  tagResultTitle: (tag) => `${tag} 태그 작품`,
  tagResultDescription: (tag) => `${tag} 태그가 붙은 공개 작품입니다.`,
  showMore: "더 보기",
  noWorks: "조건에 맞는 공개 작품이 아직 없습니다.",
  dateUnknown: "날짜 없음",
  discoveryEyebrow: "READING GUIDES",
  discoveryTitle: "어떻게 읽고 싶은가요?",
  discoveryDescription: "일본어 대역 읽기, 소설을 통한 일본어 학습, 파일 가져오기, 현재 요금을 목적별로 확인할 수 있습니다.",
  readerGuideTitle: "일본어 소설을 한국어 대역으로 읽기",
  readerGuideDescription: "일본어 원문을 유지하고 한국어 번역과 함께 장과 화를 넘어 이어 읽습니다.",
  learningGuideTitle: "소설과 웹소설로 일본어 공부하기",
  learningGuideDescription: "짧은 예문 대신 좋아하는 장편을 계속 읽으며 일본어 독해를 연습합니다.",
  fileGuideTitle: "PDF·EPUB 대역 리더",
  fileGuideDescription: "지원하는 장편 파일을 비공개 개인 서재에 가져와 원문과 번역을 함께 읽습니다.",
  pricingGuideTitle: "Free와 Premium",
  pricingGuideDescription: "¥0 Free, 월 ¥680 Premium의 이용량과 개인 서재 한도를 확인합니다.",
  serviceInfo: "서비스 안내",
  guide: "이용 방법",
  faq: "FAQ",
  operationsInfo: "운영 정보",
  status: "운영 상태",
  news: "공지",
  legalContact: "법무·문의",
  terms: "이용약관(일본어)",
  privacy: "개인정보 처리방침(일본어)",
  commercial: "특정상거래법 표기(일본어)",
  contact: "문의",
  works: "공개 작품",
  worksBody: "LIB read에 공개된 작품에서 읽을 작품을 선택할 수 있습니다.",
  read: "읽기",
  subscription: "구독 보기",
};

export const homeDictionaries: Record<UiLocale, HomeDictionary> = { ja, en, ko };
