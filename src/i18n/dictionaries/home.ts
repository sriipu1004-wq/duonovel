import type { UiLocale } from "../config";

export type HomeDictionary = {
  eyebrow: string;
  title: string;
  lead: string;
  description: string;
  freeBadge: string;
  featureBadge: string;
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
  eyebrow: "LONG-FORM / WEB NOVELS / MULTILINGUAL",
  title: "長編・Web小説を、原文を残したまま多言語で読む。",
  lead: "投稿された一つの作品を、Original・Bilingual・Translation onlyで読み分ける。AI翻訳とHuman translationは別の翻訳ソースとして扱い、作者がそれぞれを別々に許可できます。",
  description: "AI翻訳では作品単位の用語集と限定された前話コンテキストを使い、生成済み翻訳を同じ話・原文版・翻訳言語で再利用します。公開済みのHuman translationがある作品ではHumanを選択できます。PDF・EPUB・TXT・DOCXを扱う個人本棚、読み上げ、作品投稿も利用できます。",
  freeBadge: "無料枠あり",
  featureBadge: "長編 / AI・Human翻訳 / 原文付き読書 / 多言語公開",
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
  subscriptionTitle: "月額680円で、公開作品のAI翻訳利用枠を広げる。",
  subscriptionDescription: "Freeでは公開作品のAI翻訳解放と個人本棚への取り込みが合計1日3回の共通枠です。Premiumでは公開作品のAI翻訳解放は1日30回、個人本棚への取り込みは日次回数制限なし。個人本棚は最大20作品です。",
  subscriptionCta: "Freeとの違いを見る",
  whyEyebrow: "WHY LIB READ",
  features: "LIB read の特徴",
  featuresBody: "長編・Web小説を、作品を複製せず原文と複数の翻訳レイヤーで読み続けるための仕組み。",
  privateLibraryTitle: "個人本棚",
  privateLibraryBody: "自分で用意したPDF・EPUB・TXT・DOCXを取り込み、長編を章・話単位で管理して続きから読める。",
  bilingualTitle: "同一作品の多言語Reader",
  bilingualBody: "一つの作品を原文・対訳・翻訳のみで読み分ける。言語ごとに作品を複製せず、原文を正本として翻訳レイヤーを重ねる。",
  ttsTitle: "AI長編翻訳の一貫性",
  ttsBody: "AI翻訳では、人名・固有名詞・組織名・世界観用語の作品単位用語集と、直前の公開話から必要範囲だけを使う限定コンテキストで訳語の揺れを抑える。作者は用語集の訳語を修正・固定できるが、完全な一貫性や人間同等の品質を保証するものではない。",
  aiTitle: "AI翻訳とHuman translationを分離",
  aiBody: "作者はAI翻訳とHuman translationを別々に許可できる。Human translationはOpenAIを呼ばず、AI利用枠・クレジットを消費しない。公開済みHuman translationがある場合だけReaderで翻訳ソースとして選べる。",
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
  eyebrow: "LONG-FORM / WEB NOVELS / MULTILINGUAL",
  title: "Read long-form fiction and web novels across languages without replacing the original.",
  lead: "One published work can be read as Original, Bilingual, or Translation only. AI translation and Human translation are separate translation sources, and authors control permission for each independently.",
  description: "AI translation can use a work-level glossary plus bounded previous-episode context and reuse a saved translation for the same episode, source version, and target language. When a published Human translation exists, readers can select it separately. Private file import, read-aloud, and publishing remain available.",
  freeBadge: "Free plan available",
  featureBadge: "long-form / AI + Human translation / source-aware reading / multilingual publishing",
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
  subscriptionTitle: "Expand your public-work AI translation allowance for ¥680/month.",
  subscriptionDescription: "On Free, public-work AI translation unlocks and My Library imports share a total allowance of 3 uses per day. Premium provides up to 30 public-work AI translation unlocks/day, no daily count limit for My Library imports, and storage for up to 20 library works.",
  subscriptionCta: "Compare Free and Premium",
  whyEyebrow: "WHY LIB READ",
  features: "What you can do with LIB read",
  featuresBody: "Keep one long-form or web-novel work as the source of truth and read it through original and translation layers instead of duplicating the work by language.",
  privateLibraryTitle: "Private My Library",
  privateLibraryBody: "Import your own TXT, EPUB, DOCX, or text-based PDF and keep a long book organized by chapter or reading unit so you can continue later.",
  bilingualTitle: "Multiple reading modes on one work",
  bilingualBody: "Read the same work as Original, Bilingual, or Translation only. The source work remains canonical while target-language translation layers are attached to it.",
  ttsTitle: "Long-form AI translation consistency",
  ttsBody: "AI translation combines a work-level glossary for names, proper nouns, organizations, and world-specific terms with bounded previous-episode context to reduce translation drift. Authors can adjust and lock glossary translations, but perfect consistency or human-level quality is not guaranteed.",
  aiTitle: "AI and Human translation stay separate",
  aiBody: "Authors control AI and Human translation permissions separately. Human translation does not call OpenAI or consume AI allowance or credits, and it appears as a Reader source only when a published Human translation exists.",
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
  eyebrow: "LONG-FORM / WEB NOVELS / MULTILINGUAL",
  title: "장편소설과 웹소설을 원문을 유지한 채 여러 언어로 읽기.",
  lead: "게시된 하나의 작품을 원문·대역·번역만 보기로 읽을 수 있습니다. AI 번역과 Human translation은 서로 다른 번역 출처이며 작가는 각각을 별도로 허용할 수 있습니다.",
  description: "AI 번역은 작품 단위 용어집과 제한된 이전 회차 문맥을 사용할 수 있고 같은 회차·원문 버전·대상 언어의 저장된 번역을 재사용합니다. 공개된 Human translation이 있는 작품에서는 해당 번역을 별도로 선택할 수 있습니다. 개인 파일 가져오기, 읽어주기, 작품 게시도 이용할 수 있습니다.",
  freeBadge: "Free 플랜 제공",
  featureBadge: "장편 / AI·Human 번역 / 원문 기반 읽기 / 다국어 게시",
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
  subscriptionTitle: "월 ¥680으로 공개 작품 AI 번역 이용 한도를 늘리세요.",
  subscriptionDescription: "Free에서는 공개 작품 AI 번역 잠금 해제와 개인 서재 가져오기가 합산 하루 3회의 공통 이용량을 공유합니다. Premium은 공개 작품 AI 번역 잠금 해제 하루 30회, 개인 서재 가져오기 일일 횟수 제한 없음, 개인 서재 최대 20작품을 제공합니다.",
  subscriptionCta: "Free와 Premium 비교",
  whyEyebrow: "WHY LIB READ",
  features: "LIB read에서 할 수 있는 것",
  featuresBody: "장편·웹소설 한 작품을 원문 정본으로 유지하고 언어별 작품 복제 대신 번역 레이어를 붙여 읽습니다.",
  privateLibraryTitle: "비공개 개인 서재",
  privateLibraryBody: "직접 준비한 TXT, EPUB, DOCX, 텍스트 PDF를 가져와 장·읽기 단위로 관리하고 다음에 이어 읽을 수 있습니다.",
  bilingualTitle: "한 작품의 여러 읽기 모드",
  bilingualBody: "같은 작품을 원문·대역·번역만 보기로 읽습니다. 원문 작품을 정본으로 유지하고 대상 언어 번역 레이어를 연결합니다.",
  ttsTitle: "장편 AI 번역 일관성",
  ttsBody: "AI 번역에서는 인명·고유명사·조직명·세계관 용어를 위한 작품 단위 용어집과 제한된 이전 공개 회차 문맥으로 번역 흔들림을 줄입니다. 작가는 용어집 번역을 수정·고정할 수 있지만 완전한 일관성이나 사람 수준의 품질을 보장하지는 않습니다.",
  aiTitle: "AI 번역과 Human translation 분리",
  aiBody: "작가는 AI 번역과 Human translation 허가를 별도로 관리합니다. Human translation은 OpenAI를 호출하지 않고 AI 이용량이나 크레딧을 사용하지 않으며, 공개된 Human translation이 있을 때만 Reader의 번역 출처로 표시됩니다.",
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
