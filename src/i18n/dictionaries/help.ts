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
  guideLead: "LIB readで作品を探し、3つのReader modeとAI/Human翻訳を使い分け、個人本棚を利用する基本的な流れです。",
  guideSteps: [
    { title: "1. 作品を探す", body: "検索では作品の原文言語を絞り込みます。翻訳先言語はReaderで選びます。" },
    { title: "2. Reader modeを選ぶ", body: "Original・Bilingual・Translation onlyの3つから表示方法を選びます。" },
    { title: "3. 翻訳ソースを選ぶ", body: "公開済みHuman translationがある場合だけAI/Humanの翻訳ソース選択が表示されます。Human translationはAI利用枠やクレジットを消費しません。" },
    { title: "4. 読み続ける", body: "読み上げ、読書位置、栞を使い、modeや翻訳ソースを切り替えても同じ原文位置を基準に読み続けます。" },
    { title: "5. 個人本棚を使う", body: "ログイン後、利用権限のある対応ファイルを取り込んで非公開の本棚で読み続けられます。" },
  ],
  faqTitle: "よくある質問",
  faqLead: "海外利用を含む主要機能についての基本的な回答です。",
  faqItems: [
    { title: "UIの言語を変えると翻訳先言語も変わる？", body: "変わりません。UI言語、作品の原文言語、翻訳先言語は別の設定です。Searchは原文言語を絞り込み、翻訳先はReaderで選びます。" },
    { title: "AI翻訳とHuman translationは同じ？", body: "別です。作者はAI翻訳とHuman translationを別々に許可できます。Human translationはOpenAIを呼ばず、AI利用枠やクレジットを消費しません。" },
    { title: "作品を投稿すると自動でAIへ送られる？", body: "送られません。AI翻訳が許可された作品で、読者が未生成のAI翻訳など対応機能を実際に要求し、サーバー側の確認を通った場合に必要な本文等が処理されます。" },
    { title: "Human translationはいつ読める？", body: "その作品・言語に公開済みのHuman translationがある場合にReaderで選択できます。すべての作品にHuman translationがあるわけではありません。" },
    { title: "個人本棚の作品は公開される？", body: "公開されません。個人本棚は所有者本人だけが利用する非公開機能です。" },
    { title: "現在の料金・利用枠・クレジットは？", body: "Freeは¥0で、公開AI翻訳解放と個人本棚取り込みが合計1日3回、個人本棚は最大3作品です。Premiumは月額¥680（JPY）で、公開AI翻訳解放は1日30回、個人本棚取り込みは日次回数制限なし、最大20作品です。クレジットは5=¥300、8=¥450、12=¥600、有効150日で、1クレジットは公開1話×対象言語1つのAI翻訳解放に使います。Human translationはAI枠・クレジットを消費しません。" },
    { title: "OpenAI APIのデータは学習・保持される？", body: "OpenAIの公開方針ではAPI入力・出力は既定ではモデル学習に使われませんが、明示的なデータ共有参加は別扱いです。標準abuse-monitoring logsでは内容が最大30日保持される場合があります。LIB readのOpenAIアカウント固有のdata sharing・Zero Data Retention・Modified Abuse Monitoring設定は未確認です。" },
    { title: "法務ページの英語・韓国語版は正式版？", body: "現時点では日本語版を正式な規約・ポリシーとして案内しています。" },
  ],
  home: "トップ", library: "個人本棚", search: "作品を探す", subscription: "サブスク",
};

const en: HelpDictionary = {
  guideTitle: "Guide",
  guideLead: "The basic flow for finding a work, using the three Reader modes, choosing AI or Human translation when available, and importing your own books.",
  guideSteps: [
    { title: "1. Find a work", body: "Search filters the source language of public works. Choose the target translation language later in the Reader." },
    { title: "2. Choose a Reader mode", body: "Use Original, Bilingual, or Translation only. These modes control presentation, not translation provenance." },
    { title: "3. Choose a translation source", body: "When a published Human translation exists, the Reader can offer AI/Human source selection. Human translation uses no AI allowance or credits." },
    { title: "4. Keep your place", body: "Use read-aloud, reading position, and bookmarks. Source-side position remains the anchor across mode and translation-source changes." },
    { title: "5. Use My Library", body: "After signing in, import a supported file you have the right to store and translate, then keep reading it privately by chapter." },
  ],
  faqTitle: "FAQ",
  faqLead: "Answers to the main questions about using LIB read in Japanese, English, or Korean.",
  faqItems: [
    { title: "Does changing the UI language change the target translation language?", body: "No. UI language, work source language, and target translation language are separate. Search filters source language; the Reader selects the target language." },
    { title: "Are AI translation and Human translation the same?", body: "No. They have separate provenance and author permissions. Human translation does not call OpenAI or consume AI allowance or credits." },
    { title: "Does publishing a work automatically send it to OpenAI?", body: "No. A provider request occurs only when a supported AI feature is actually requested and the relevant server-side access, permission, and entitlement checks pass." },
    { title: "When can I read a Human translation?", body: "Only when a Human translation has been published for that work and target language. Availability varies by work." },
    { title: "Are works in My Library public?", body: "No. My Library is private and accessible only to the owner." },
    { title: "What are the current plan limits and credit prices?", body: "Free is ¥0: public AI-translation unlocks and My Library imports share 3 uses/day, and My Library stores up to 3 works. Premium is ¥680/month in JPY: up to 30 public AI-translation unlocks/day, no daily count limit for My Library imports, and up to 20 library works. Credits are 5=¥300, 8=¥450, or 12=¥600, valid for 150 days; 1 credit unlocks AI translation for one public episode in one target language. Human translation uses no AI allowance or credits." },
    { title: "Does OpenAI train on or retain API data?", body: "OpenAI's published API policy says API inputs and outputs are not used for model training by default, while explicit data-sharing participation is treated separately. Standard abuse-monitoring logs may retain content for up to 30 days. LIB read's account-specific data-sharing, Zero Data Retention, and Modified Abuse Monitoring settings are currently unverified." },
    { title: "Are the English legal labels official translations?", body: "No. The Japanese Terms and Privacy Policy are currently the controlling versions." },
  ],
  home: "Home", library: "My Library", search: "Explore works", subscription: "Subscription",
};

const ko: HelpDictionary = {
  guideTitle: "이용 방법",
  guideLead: "작품 찾기, 세 가지 Reader mode, AI/Human 번역 출처 선택, 개인 서재 사용의 기본 흐름입니다.",
  guideSteps: [
    { title: "1. 작품 찾기", body: "검색에서는 공개 작품의 원문 언어를 필터링합니다. 대상 번역 언어는 Reader에서 선택합니다." },
    { title: "2. Reader mode 선택", body: "원문·대역·번역만 보기 중에서 표시 방식을 선택합니다. mode와 번역 출처는 별개의 개념입니다." },
    { title: "3. 번역 출처 선택", body: "공개된 Human translation이 있을 때만 AI/Human 번역 출처 선택이 표시될 수 있습니다. Human translation은 AI 이용량이나 크레딧을 사용하지 않습니다." },
    { title: "4. 읽던 위치 유지", body: "읽어주기, 읽던 위치, 책갈피를 사용합니다. mode나 번역 출처를 바꿔도 원문 기준 위치를 유지합니다." },
    { title: "5. 개인 서재 사용", body: "로그인 후 저장·번역할 권리가 있는 지원 파일을 가져와 장별로 비공개 상태에서 이어 읽을 수 있습니다." },
  ],
  faqTitle: "자주 묻는 질문",
  faqLead: "일본어·영어·한국어 UI에서 LIB read를 사용할 때의 주요 질문입니다.",
  faqItems: [
    { title: "UI 언어를 바꾸면 대상 번역 언어도 바뀌나요?", body: "아니요. UI 언어, 작품 원문 언어, 대상 번역 언어는 서로 독립적입니다. 검색은 원문 언어를 필터링하고 대상 언어는 Reader에서 선택합니다." },
    { title: "AI 번역과 Human translation은 같은가요?", body: "아닙니다. 출처와 작가 허가가 분리되어 있습니다. Human translation은 OpenAI를 호출하지 않고 AI 이용량이나 크레딧을 사용하지 않습니다." },
    { title: "작품을 게시하면 자동으로 OpenAI에 전송되나요?", body: "아닙니다. 지원되는 AI 기능을 실제로 요청하고 서버의 접근·허가·이용 자격 확인을 통과한 경우에만 필요한 제공자 요청이 발생합니다." },
    { title: "Human translation은 언제 읽을 수 있나요?", body: "해당 작품과 대상 언어에 공개된 Human translation이 있을 때만 선택할 수 있습니다. 모든 작품에 제공되는 것은 아닙니다." },
    { title: "개인 서재 작품이 공개되나요?", body: "아니요. 개인 서재는 소유자 본인만 접근할 수 있는 비공개 기능입니다." },
    { title: "현재 요금·이용 한도·크레딧 가격은 어떻게 되나요?", body: "Free는 ¥0이며 공개 AI 번역 잠금 해제와 개인 서재 가져오기가 합산 하루 3회이고 개인 서재는 최대 3작품입니다. Premium은 월 ¥680(JPY)이며 공개 AI 번역 잠금 해제 하루 최대 30회, 개인 서재 가져오기 일일 횟수 제한 없음, 최대 20작품입니다. 크레딧은 5=¥300, 8=¥450, 12=¥600이고 150일 유효하며 1크레딧은 공개 작품 1화 × 대상 언어 1개의 AI 번역 잠금 해제에 사용합니다. Human translation은 AI 이용량이나 크레딧을 소비하지 않습니다." },
    { title: "OpenAI API 데이터는 학습이나 보관에 사용되나요?", body: "OpenAI의 공개 API 정책에 따르면 API 입력·출력은 기본적으로 모델 학습에 사용되지 않으며 명시적 데이터 공유 참여는 별도로 취급됩니다. 표준 abuse-monitoring logs에는 내용이 최대 30일 보관될 수 있습니다. LIB read OpenAI 계정의 data sharing·Zero Data Retention·Modified Abuse Monitoring 설정은 현재 확인되지 않았습니다." },
    { title: "한국어 법무 문구가 공식 번역인가요?", body: "아니요. 현재는 일본어 이용약관과 개인정보 처리방침이 기준 문서입니다." },
  ],
  home: "홈", library: "개인 서재", search: "작품 찾기", subscription: "구독",
};

export const helpDictionaries: Record<UiLocale, HelpDictionary> = { ja, en, ko };
