import type { UiLocale } from "../config";

type HelpItem = { title: string; body: string };

type HelpDictionary = {
  guideTitle: string;
  guideLead: string;
  guideSteps: readonly HelpItem[];
  faqTitle: string;
  faqLead: string;
  faqItems: readonly HelpItem[];
  home: string;
  library: string;
  search: string;
  subscription: string;
};

const ja: HelpDictionary = {
  guideTitle: "使い方",
  guideLead: "LIB readで作品を探す、読む、対訳する、個人本棚へ取り込む基本的な流れです。",
  guideSteps: [
    { title: "1. 作品を探す", body: "公開作品から読みたい作品を選びます。" },
    { title: "2. Readerで読む", body: "作品を開くとReaderで本文を読み、読み上げや栞を利用できます。" },
    { title: "3. 対訳を使う", body: "対訳を開き、原文とは独立して翻訳先の言語を選びます。" },
    { title: "4. 個人本棚を使う", body: "ログイン後、対応ファイルを取り込んで非公開の本棚で読み続けられます。" },
  ],
  faqTitle: "よくある質問",
  faqLead: "海外利用を含む主要機能についての基本的な回答です。",
  faqItems: [
    { title: "UIの言語を変えると対訳言語も変わる？", body: "変わりません。表示言語、作品の原文言語、対訳先言語、学習言語は別の設定です。" },
    { title: "個人本棚の作品は公開される？", body: "公開されません。個人本棚は所有者本人だけが利用する非公開機能です。" },
    { title: "英語・韓国語UIでも料金は同じ？", body: "現在の決済通貨は日本円（JPY）です。月額料金は680円です。" },
    { title: "法務ページの英語・韓国語版は正式版？", body: "現時点では日本語版を正式な規約・ポリシーとして案内しています。" },
  ],
  home: "トップ", library: "個人本棚", search: "作品を探す", subscription: "サブスク",
};

const en: HelpDictionary = {
  guideTitle: "Guide",
  guideLead: "The basic flow for finding a work, reading it, using bilingual text, and importing your own books into LIB read.",
  guideSteps: [
    { title: "1. Find a work", body: "Choose a public work you want to read." },
    { title: "2. Read in the Reader", body: "Open an episode to read the text, use read-aloud controls, and keep your place." },
    { title: "3. Show bilingual text", body: "Open bilingual mode and choose a translation language independently from the original language and UI language." },
    { title: "4. Use My Library", body: "After signing in, import a supported file and keep reading it privately by chapter." },
  ],
  faqTitle: "FAQ",
  faqLead: "Answers to the main questions about using LIB read in Japanese, English, or Korean.",
  faqItems: [
    { title: "Does changing the UI language change my translation language?", body: "No. UI language, source language, translation language, and learning language are separate settings." },
    { title: "Are works in My Library public?", body: "No. My Library is private and accessible only to the owner." },
    { title: "What currency is used for subscriptions?", body: "Subscriptions are currently charged in Japanese yen (JPY) at ¥680 per month." },
    { title: "Are the English legal labels official translations?", body: "No. The Japanese Terms and Privacy Policy are currently the controlling versions." },
  ],
  home: "Home", library: "My Library", search: "Explore works", subscription: "Subscription",
};

const ko: HelpDictionary = {
  guideTitle: "이용 방법",
  guideLead: "작품 찾기, 읽기, 대역 사용, 개인 서재 가져오기의 기본 흐름입니다.",
  guideSteps: [
    { title: "1. 작품 찾기", body: "읽고 싶은 공개 작품을 선택합니다." },
    { title: "2. Reader에서 읽기", body: "화를 열어 본문을 읽고 읽어주기와 읽던 위치 저장 기능을 이용합니다." },
    { title: "3. 대역 보기", body: "대역 모드를 열고 원문 언어와 UI 언어와는 별도로 번역 언어를 선택합니다." },
    { title: "4. 개인 서재 사용", body: "로그인 후 지원 파일을 가져와 장별로 비공개 상태에서 이어 읽을 수 있습니다." },
  ],
  faqTitle: "자주 묻는 질문",
  faqLead: "일본어·영어·한국어 UI에서 LIB read를 사용할 때의 주요 질문입니다.",
  faqItems: [
    { title: "UI 언어를 바꾸면 대역 언어도 바뀌나요?", body: "아니요. UI 언어, 원문 언어, 대역 언어, 학습 언어는 서로 독립된 설정입니다." },
    { title: "개인 서재 작품이 공개되나요?", body: "아니요. 개인 서재는 소유자 본인만 접근할 수 있는 비공개 기능입니다." },
    { title: "구독 결제 통화는 무엇인가요?", body: "현재 구독은 일본 엔(JPY)으로 결제되며 월 680엔입니다." },
    { title: "한국어 법무 문구가 공식 번역인가요?", body: "아니요. 현재는 일본어 이용약관과 개인정보 처리방침이 기준 문서입니다." },
  ],
  home: "홈", library: "개인 서재", search: "작품 찾기", subscription: "구독",
};

export const helpDictionaries: Record<UiLocale, HelpDictionary> = { ja, en, ko };
